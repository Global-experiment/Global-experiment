import { Inject, Injectable } from "@nestjs/common";
import { AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor, AuditChange } from "../audit/audit.types.js";
import { entryLabel } from "../audit/entity-labels.js";
import { diffRecord } from "../audit/record-fields.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationFailedError, type ValidationIssue } from "../common/errors/api-error.js";
import type { Page } from "../common/listing/list-query.js";
import { countExistingExpertise } from "../expertise/expertise-refs.js";
import { countExistingOrganizations } from "../organizations/organization-refs.js";
import { labelOfOrganization, ORGANIZATION_FIELDS } from "../organizations/organizations.audit.js";
import { OrganizationsRepository } from "../organizations/organizations.repository.js";
import { SettingsService } from "../settings/settings.service.js";
import { labelOfPerson, PERSON_FIELDS } from "./people.audit.js";
import type { CreatePersonRequest, PeopleListQuery, PeopleOptionsDto, PersonDto, UpdatePersonRequest } from "./people.contracts.js";
import { PeopleRepository } from "./people.repository.js";

const ENTITY = "person";

/**
 * People use cases. Every write runs in one transaction that reads the
 * person before and after and records ONE audit event with the fields that
 * changed (one "Submit changes" = one event). References are checked up
 * front so a bad id is a 400 naming the field, not a foreign-key 409.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly repository: PeopleRepository,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly organizations: OrganizationsRepository,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  list(query: PeopleListQuery): Promise<Page<PersonDto>> {
    return this.repository.list(query);
  }

  async options(): Promise<PeopleOptionsDto> {
    const [options, aiEnabled] = await Promise.all([this.repository.options(), this.settings.get("ai.enabled")]);
    return { ...options, aiScoreReadOnly: aiEnabled };
  }

  async get(id: string): Promise<PersonDto> {
    const person = await this.repository.findById(id);
    if (!person) throw new NotFoundError("Person not found.");
    return person;
  }

  async create(input: CreatePersonRequest, actor: AuditActor): Promise<PersonDto> {
    await this.assertInput(input);
    return this.db.transaction(async (tx) => {
      const id = await this.repository.create(tx, input);
      const person = (await this.repository.findById(id, tx))!;
      await this.audit.record(tx, { entityType: ENTITY, entityId: id, action: "created", actor, source: "admin", meta: { label: labelOfPerson(person), collection: "People" } });
      await this.recordExpenseLinks(tx, person, [], person.expenses, actor);
      return person;
    });
  }

  async update(id: string, input: UpdatePersonRequest, actor: AuditActor): Promise<PersonDto> {
    await this.assertInput(input, id);
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findById(id, tx);
      if (!before) throw new NotFoundError("Person not found.");
      // Organizations linked or unlinked by this Submit record their own event too (both records show the link).
      const current = new Set(before.organizations.map((organization) => organization.id));
      const wanted = new Set(input.organizationIds ?? current);
      const touched = [...[...wanted].filter((orgId) => !current.has(orgId)), ...[...current].filter((orgId) => !wanted.has(orgId))];
      const organizationsBefore = await Promise.all(touched.map((orgId) => this.organizations.findById(orgId, tx)));
      await this.repository.update(tx, id, input);
      const after = (await this.repository.findById(id, tx))!;
      await this.recordUpdate(tx, before, after, actor);
      for (const organizationBefore of organizationsBefore) if (organizationBefore) await this.recordOrganization(tx, organizationBefore, actor);
      return after;
    });
  }

  async duplicate(id: string, actor: AuditActor): Promise<PersonDto> {
    return this.db.transaction(async (tx) => {
      const source = await this.repository.findById(id, tx);
      if (!source) throw new NotFoundError("Person not found.");
      const copyId = (await this.repository.duplicate(tx, id))!;
      const copy = (await this.repository.findById(copyId, tx))!;
      await this.audit.record(tx, {
        entityType: ENTITY,
        entityId: copyId,
        action: "duplicated",
        actor,
        source: "admin",
        meta: { label: labelOfPerson(copy), duplicatedFrom: { id: source.id, label: `PER-${source.personNumber}` } },
      });
      return copy;
    });
  }

  async link(kind: "organization" | "expertise", personId: string, targetId: string, actor: AuditActor): Promise<void> {
    await this.assertTarget(kind, targetId);
    await this.linkChange(kind, personId, targetId, actor, (tx) => this.repository.link(tx, kind, personId, targetId));
  }

  async unlink(kind: "organization" | "expertise", personId: string, targetId: string, actor: AuditActor): Promise<void> {
    await this.linkChange(kind, personId, targetId, actor, (tx) => this.repository.unlink(tx, kind, personId, targetId));
  }

  /** A link changes the person and, for an organization, the organization too: each gets its own event. */
  private async linkChange(kind: "organization" | "expertise", personId: string, targetId: string, actor: AuditActor, write: (tx: Executor) => Promise<void>) {
    await this.db.transaction(async (tx) => {
      const before = await this.repository.findById(personId, tx);
      if (!before) throw new NotFoundError("Person not found.");
      const organizationBefore = kind === "organization" ? await this.organizations.findById(targetId, tx) : undefined;
      await write(tx);
      await this.recordUpdate(tx, before, (await this.repository.findById(personId, tx))!, actor);
      if (organizationBefore) await this.recordOrganization(tx, organizationBefore, actor);
    });
  }

  /** The organization's own "updated" event after a link change (nothing if nothing changed). */
  private async recordOrganization(tx: Executor, organizationBefore: NonNullable<Awaited<ReturnType<OrganizationsRepository["findById"]>>>, actor: AuditActor) {
    const organizationAfter = await this.organizations.findById(organizationBefore.id, tx);
    if (!organizationAfter) return;
    const changes = diffRecord(ORGANIZATION_FIELDS, organizationBefore, organizationAfter);
    if (changes.length === 0) return;
    await this.audit.record(tx, { entityType: "organization", entityId: organizationAfter.id, action: "updated", actor, source: "admin", changes, meta: { label: labelOfOrganization(organizationAfter) } });
  }

  /** Archive (decision 12): out of the default views, into "Archived"; restorable. */
  async setArchived(id: string, archived: boolean, actor: AuditActor): Promise<PersonDto> {
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findById(id, tx);
      if (!before) throw new NotFoundError("Person not found.");
      if ((before.archivedAt !== null) === archived) return before;
      await this.repository.setArchived(tx, id, archived && actor.type === "admin" ? actor.id : null);
      await this.audit.record(tx, { entityType: ENTITY, entityId: id, action: archived ? "archived" : "restored", actor, source: "admin", meta: { label: labelOfPerson(before) } });
      return (await this.repository.findById(id, tx))!;
    });
  }

  /**
   * Permanent delete (decision 12): directory.delete, the person's name typed
   * exactly, logged before the row goes. Refused while expenses name them
   * as recipient (the ledger keeps its recipients).
   */
  async delete(id: string, confirm: string, actor: AuditActor): Promise<void> {
    // directory.delete is checked by the permission guard (the Rootadmin's, overview §3.1).
    if (actor.type !== "admin") throw new ForbiddenError("Only an admin can delete permanently.");
    const person = await this.get(id);
    if (confirm.trim() !== person.name) throw new ValidationFailedError([{ path: "confirm", message: "Type the person's name exactly to confirm." }]);
    if (await this.repository.hasExpenses(id)) throw new ConflictError("This person is the recipient of expenses: unlink them first, or archive the person.");
    if (await this.repository.hasGrants(id)) throw new ConflictError("This person has permissions: delete or reassign them first, or archive the person.");
    await this.db.transaction(async (tx) => {
      await this.audit.record(tx, {
        entityType: ENTITY,
        entityId: id,
        action: "deleted",
        actor,
        source: "admin",
        meta: { label: labelOfPerson(person), number: `PER-${person.personNumber}` },
      });
      await this.repository.delete(tx, id);
    });
  }

  /** One "updated" event with every changed field (nothing when nothing changed), plus the expenses' own events. */
  private async recordUpdate(tx: Executor, before: PersonDto, after: PersonDto, actor: AuditActor) {
    const changes = diffRecord(PERSON_FIELDS, before, after);
    if (changes.length > 0) {
      await this.audit.record(tx, { entityType: ENTITY, entityId: after.id, action: "updated", actor, source: "admin", changes, meta: { label: labelOfPerson(after) } });
    }
    await this.recordExpenseLinks(tx, after, before.expenses, after.expenses, actor);
  }

  /** Linking or unlinking an expense also changes the expense's recipient: it gets its own event. */
  private async recordExpenseLinks(tx: Executor, person: PersonDto, before: PersonDto["expenses"], after: PersonDto["expenses"], actor: AuditActor) {
    const was = new Set(before.map((expense) => expense.id));
    const now = new Set(after.map((expense) => expense.id));
    const recipient = { id: person.id, label: labelOfPerson(person) };
    for (const [expense, linked] of [...after.filter((e) => !was.has(e.id)).map((e) => [e, true] as const), ...before.filter((e) => !now.has(e.id)).map((e) => [e, false] as const)]) {
      const change: AuditChange = { field: "recipient", label: "Recipient", kind: "relation", before: linked ? [] : [recipient], after: linked ? [recipient] : [] };
      await this.audit.record(tx, { entityType: "treasury_entry", entityId: expense.id, action: "updated", actor, source: "admin", changes: [change], meta: { label: entryLabel(expense) } });
    }
  }

  private async assertTarget(kind: "organization" | "expertise", id: string) {
    const found = kind === "organization" ? await countExistingOrganizations(this.db, [id]) : await countExistingExpertise(this.db, [id]);
    if (found === 0) throw new NotFoundError(kind === "organization" ? "Organization not found." : "Expertise not found.");
  }

  private async assertInput(input: UpdatePersonRequest, personId?: string) {
    const issues: ValidationIssue[] = [];
    if (input.stateKey && !(await this.repository.vocabularyExists("state", input.stateKey))) issues.push({ path: "stateKey", message: "Unknown state." });
    if (input.sourceKey && !(await this.repository.vocabularyExists("source", input.sourceKey))) issues.push({ path: "sourceKey", message: "Unknown source." });
    if (input.organizationIds?.length) {
      const found = await countExistingOrganizations(this.db, input.organizationIds);
      if (found !== input.organizationIds.length) issues.push({ path: "organizationIds", message: "Unknown organization." });
    }
    if (input.expertiseIds?.length) {
      const found = await countExistingExpertise(this.db, input.expertiseIds);
      if (found !== input.expertiseIds.length) issues.push({ path: "expertiseIds", message: "Unknown expertise." });
    }
    if (input.contactChannelKeys?.length) {
      const found = await this.repository.countContactChannels(input.contactChannelKeys);
      if (found !== input.contactChannelKeys.length) issues.push({ path: "contactChannelKeys", message: "Unknown contact channel." });
    }
    if (input.aiRelevanceScore !== undefined && (await this.settings.get("ai.enabled"))) {
      issues.push({ path: "aiRelevanceScore", message: "The AI relevance score is set automatically." });
    }
    if (input.firstContactOn && input.lastContactOn && input.firstContactOn > input.lastContactOn) {
      issues.push({ path: "lastContactOn", message: "The last contact can't be before the first contact." });
    }
    if (input.expenseIds) {
      const expenses = await this.repository.expensesById(input.expenseIds);
      if (expenses.length !== input.expenseIds.length || expenses.some((expense) => expense.entryType !== "expense")) {
        issues.push({ path: "expenseIds", message: "Unknown expense." });
      } else if (expenses.some((expense) => expense.recipientOrganizationId !== null || (expense.recipientPersonId !== null && expense.recipientPersonId !== personId))) {
        issues.push({ path: "expenseIds", message: "This expense already has a recipient." });
      }
      const current = personId ? ((await this.repository.findById(personId))?.expenses ?? []) : [];
      // Newly linked expenses only: links that already exist stay as they are.
      const added = expenses.filter((expense) => !current.some((linked) => linked.id === expense.id));
      if (added.some((expense) => expense.managedBy === "notion")) {
        // The Treasury import sets these recipients from Notion and would undo the link.
        issues.push({ path: "expenseIds", message: "This expense is managed in Notion: set its recipient there." });
      } else if (added.some((expense) => expense.archivedAt !== null)) {
        issues.push({ path: "expenseIds", message: "This expense is archived: restore it first." });
      }
      if (personId) {
        const removed = current.filter((expense) => !input.expenseIds!.includes(expense.id)).map((expense) => expense.id);
        const qualified = (await this.repository.expensesById(removed)).some((expense) => ["qualified", "not_required"].includes(expense.reviewStatusKey ?? ""));
        if (qualified) issues.push({ path: "expenseIds", message: "A qualified expense keeps its recipient: change it in Treasury." });
      }
    }
    if (issues.length > 0) throw new ValidationFailedError(issues);
  }
}
