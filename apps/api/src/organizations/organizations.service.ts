import { Inject, Injectable } from "@nestjs/common";
import { AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor } from "../audit/audit.types.js";
import { diffRecord } from "../audit/record-fields.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import type { Page } from "../common/listing/list-query.js";
import { countExistingExpertise } from "../expertise/expertise-refs.js";
import { labelOfPerson, PERSON_FIELDS } from "../people/people.audit.js";
import { PeopleRepository } from "../people/people.repository.js";
import { labelOfOrganization, ORGANIZATION_FIELDS } from "./organizations.audit.js";
import type { CreateOrganizationRequest, OrganizationDto, OrganizationsListQuery, UpdateOrganizationRequest } from "./organizations.contracts.js";
import { OrganizationsRepository } from "./organizations.repository.js";

const ENTITY = "organization";

/**
 * Organization use cases. Every write runs in one transaction that reads
 * the organization before and after and records one audit event; a
 * person link also changes the person, who gets their own event.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly people: PeopleRepository,
    private readonly audit: AuditService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  list(query: OrganizationsListQuery): Promise<Page<OrganizationDto>> {
    return this.repository.list(query);
  }

  async get(id: string): Promise<OrganizationDto> {
    const organization = await this.repository.findById(id);
    if (!organization) throw new NotFoundError("Organization not found.");
    return organization;
  }

  async create(input: CreateOrganizationRequest, actor: AuditActor): Promise<OrganizationDto> {
    await this.assertExpertise(input.expertiseIds);
    return this.db.transaction(async (tx) => {
      const id = await this.repository.create(tx, input);
      const organization = (await this.repository.findById(id, tx))!;
      await this.audit.record(tx, {
        entityType: ENTITY,
        entityId: id,
        action: "created",
        actor,
        source: "admin",
        meta: { label: labelOfOrganization(organization), collection: "Organizations" },
      });
      return organization;
    });
  }

  async update(id: string, input: UpdateOrganizationRequest, actor: AuditActor): Promise<OrganizationDto> {
    await this.assertExpertise(input.expertiseIds);
    const { personIds, ...fields } = input;
    if (personIds === undefined) return this.audited(id, actor, (tx) => this.repository.update(tx, id, fields));
    for (const personId of personIds) {
      if (!(await this.repository.personExists(personId))) throw new ValidationFailedError([{ path: "personIds", message: "Unknown person." }]);
    }
    // One transaction, one event on the organization, and one on each person whose link changed.
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findById(id, tx);
      if (!before) throw new NotFoundError("Organization not found.");
      const current = new Set(before.people.map((person) => person.id));
      const wanted = new Set(personIds);
      const touched = [...personIds.filter((personId) => !current.has(personId)), ...[...current].filter((personId) => !wanted.has(personId))];
      const peopleBefore = new Map(await Promise.all(touched.map(async (personId) => [personId, await this.people.findById(personId, tx)] as const)));
      if (Object.keys(fields).length > 0) await this.repository.update(tx, id, fields);
      for (const personId of touched) {
        if (wanted.has(personId)) await this.repository.linkPerson(tx, id, personId);
        else await this.repository.unlinkPerson(tx, id, personId);
      }
      const after = (await this.repository.findById(id, tx))!;
      await this.recordChanges(tx, before, after, actor);
      for (const personId of touched) await this.recordPerson(tx, peopleBefore.get(personId) ?? null, personId, actor);
      return after;
    });
  }

  async duplicate(id: string, actor: AuditActor): Promise<OrganizationDto> {
    return this.db.transaction(async (tx) => {
      const source = await this.repository.findById(id, tx);
      if (!source) throw new NotFoundError("Organization not found.");
      const copyId = (await this.repository.duplicate(tx, id))!;
      const copy = (await this.repository.findById(copyId, tx))!;
      await this.audit.record(tx, {
        entityType: ENTITY,
        entityId: copyId,
        action: "duplicated",
        actor,
        source: "admin",
        meta: { label: labelOfOrganization(copy), duplicatedFrom: { id: source.id, label: `ORG-${source.orgNumber}` } },
      });
      return copy;
    });
  }

  async linkExpertise(id: string, expertiseId: string, actor: AuditActor): Promise<void> {
    if ((await countExistingExpertise(this.db, [expertiseId])) === 0) throw new NotFoundError("Expertise not found.");
    await this.audited(id, actor, (tx) => this.repository.linkExpertise(tx, id, expertiseId));
  }

  async unlinkExpertise(id: string, expertiseId: string, actor: AuditActor): Promise<void> {
    await this.audited(id, actor, (tx) => this.repository.unlinkExpertise(tx, id, expertiseId));
  }

  async linkPerson(id: string, personId: string, actor: AuditActor): Promise<void> {
    if (!(await this.repository.personExists(personId))) throw new NotFoundError("Person not found.");
    await this.auditedWithPerson(id, personId, actor, (tx) => this.repository.linkPerson(tx, id, personId));
  }

  async unlinkPerson(id: string, personId: string, actor: AuditActor): Promise<void> {
    await this.auditedWithPerson(id, personId, actor, (tx) => this.repository.unlinkPerson(tx, id, personId));
  }

  /** Archive (decision 12): out of the default views, into "Archived"; restorable. */
  async setArchived(id: string, archived: boolean, actor: AuditActor): Promise<OrganizationDto> {
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findById(id, tx);
      if (!before) throw new NotFoundError("Organization not found.");
      if ((before.archivedAt !== null) === archived) return before;
      await this.repository.setArchived(tx, id, archived && actor.type === "admin" ? actor.id : null);
      await this.audit.record(tx, {
        entityType: ENTITY,
        entityId: id,
        action: archived ? "archived" : "restored",
        actor,
        source: "admin",
        meta: { label: labelOfOrganization(before) },
      });
      return (await this.repository.findById(id, tx))!;
    });
  }

  /** Permanent delete (decision 12): owner only, the name typed exactly, logged; refused while expenses name it as recipient. */
  async delete(id: string, confirm: string, actor: AuditActor): Promise<void> {
    if (actor.type !== "admin" || actor.role !== "owner") throw new ForbiddenError("Only the owner can delete permanently.");
    const organization = await this.get(id);
    if (confirm.trim() !== organization.name) {
      throw new ValidationFailedError([{ path: "confirm", message: "Type the organization's name exactly to confirm." }]);
    }
    if (await this.repository.hasExpenses(id)) throw new ConflictError("This organization is the recipient of expenses: archive it instead.");
    await this.db.transaction(async (tx) => {
      await this.audit.record(tx, {
        entityType: ENTITY,
        entityId: id,
        action: "deleted",
        actor,
        source: "admin",
        meta: { label: labelOfOrganization(organization), number: `ORG-${organization.orgNumber}` },
      });
      await this.repository.delete(tx, id);
    });
  }

  /** Reads before, writes, reads after, records one "updated" event (if anything changed). */
  private async audited(id: string, actor: AuditActor, write: (tx: Executor) => Promise<unknown>): Promise<OrganizationDto> {
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findById(id, tx);
      if (!before) throw new NotFoundError("Organization not found.");
      await write(tx);
      const after = (await this.repository.findById(id, tx))!;
      await this.recordChanges(tx, before, after, actor);
      return after;
    });
  }

  /** The same, and the linked person's own event (both records show the link). */
  private async auditedWithPerson(id: string, personId: string, actor: AuditActor, write: (tx: Executor) => Promise<unknown>): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = await this.repository.findById(id, tx);
      if (!before) throw new NotFoundError("Organization not found.");
      const personBefore = await this.people.findById(personId, tx);
      await write(tx);
      await this.recordChanges(tx, before, (await this.repository.findById(id, tx))!, actor);
      await this.recordPerson(tx, personBefore ?? null, personId, actor);
    });
  }

  private async recordPerson(tx: Executor, personBefore: Awaited<ReturnType<PeopleRepository["findById"]>> | null, personId: string, actor: AuditActor) {
    const personAfter = await this.people.findById(personId, tx);
    if (!personBefore || !personAfter) return;
    const changes = diffRecord(PERSON_FIELDS, personBefore, personAfter);
    if (changes.length === 0) return;
    await this.audit.record(tx, { entityType: "person", entityId: personId, action: "updated", actor, source: "admin", changes, meta: { label: labelOfPerson(personAfter) } });
  }

  private async recordChanges(tx: Executor, before: OrganizationDto, after: OrganizationDto, actor: AuditActor) {
    const changes = diffRecord(ORGANIZATION_FIELDS, before, after);
    if (changes.length === 0) return;
    await this.audit.record(tx, { entityType: ENTITY, entityId: after.id, action: "updated", actor, source: "admin", changes, meta: { label: labelOfOrganization(after) } });
  }

  private async assertExpertise(ids?: string[]) {
    if (!ids?.length) return;
    if ((await countExistingExpertise(this.db, ids)) !== ids.length) throw new ValidationFailedError([{ path: "expertiseIds", message: "Unknown expertise." }]);
  }
}
