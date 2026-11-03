import { Inject, Injectable } from "@nestjs/common";
import { AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor } from "../audit/audit.types.js";
import { diffRecord, type FieldSpec } from "../audit/record-fields.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import type { Page } from "../common/listing/list-query.js";
import type {
  CreateGrantRequest,
  CreateServiceRequest,
  GrantDto,
  GrantsListQuery,
  ServiceDto,
  ServicesListQuery,
  ServicesOptionsDto,
  UpdateGrantRequest,
  UpdateServiceRequest,
} from "./services.contracts.js";
import { ServicesRepository } from "./services.repository.js";

const ref = (value: { id: string; name: string } | null) => (value ? { id: value.id, label: value.name } : null);

/** The service fields the history records (Figma p16 order). */
export const SERVICE_FIELDS: readonly FieldSpec<ServiceDto>[] = [
  { field: "name", label: "Name", kind: "text", get: (s) => s.name },
  { field: "status", label: "Status", kind: "select", get: (s) => s.status },
  { field: "categories", label: "Category", kind: "relation", get: (s) => s.categories.map((category) => ({ id: category.key, label: category.label })) },
  { field: "hostingModel", label: "Hosting model", kind: "select", get: (s) => s.hostingModel },
  { field: "url", label: "URL", kind: "url", get: (s) => s.url },
  { field: "description", label: "Description", kind: "text", get: (s) => s.description },
];

/** The grant fields the history records, in the detail page's order (OPS-148); the name follows them (OPS-138). */
export const GRANT_FIELDS: readonly FieldSpec<GrantDto>[] = [
  { field: "service", label: "Service", kind: "relation", get: (g) => [ref(g.service)!] },
  { field: "account", label: "Account", kind: "relation", get: (g) => (g.account ? [ref(g.account)!] : []) },
  { field: "level", label: "Permission level", kind: "select", get: (g) => g.level },
  { field: "status", label: "Status", kind: "select", get: (g) => g.status },
  { field: "resourceScope", label: "Scope", kind: "text", get: (g) => g.resourceScope },
  { field: "grantedOn", label: "Granted", kind: "date", get: (g) => g.grantedOn },
  { field: "revokedOn", label: "Revoked", kind: "date", get: (g) => g.revokedOn },
  { field: "expiresOn", label: "Expired", kind: "date", get: (g) => g.expiresOn },
  { field: "person", label: "People", kind: "relation", get: (g) => (g.person ? [ref(g.person)!] : []) },
];

export const serviceLabel = (service: Pick<ServiceDto, "name">) => service.name;
export const grantLabel = (grant: Pick<GrantDto, "grantNumber" | "title">) => `#${grant.grantNumber} · ${grant.title}`;

/** The records a grant's event also shows on (OPS-151): its account, service and person. */
const related = (...grants: (GrantDto | null)[]) => {
  const seen = new Map<string, { type: string; id: string }>();
  for (const grant of grants) {
    if (!grant) continue;
    for (const [type, id] of [
      ["admin_user", grant.account?.id],
      ["service", grant.service.id],
      ["person", grant.person?.id],
    ] as const) {
      if (id) seen.set(`${type}:${id}`, { type, id });
    }
  }
  return [...seen.values()];
};

/**
 * Services and access grants (admin-desktop.pdf p16–p17). Every write is one
 * transaction with its history. A grant's write is ONE event, on the grant
 * (OPS-151, client 2026-11-03): "Candide granted Stanley Superadmin on
 * GitHub"; its account, service and person show that same event in their
 * histories (meta.related) instead of an event of their own. Nothing is
 * deleted (OPS-147): services and grants are archived.
 */
@Injectable()
export class ServicesService {
  constructor(
    private readonly repository: ServicesRepository,
    private readonly audit: AuditService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  options(): Promise<ServicesOptionsDto> {
    return this.repository.options();
  }

  // ---- Services ----

  listServices(query: ServicesListQuery): Promise<Page<ServiceDto>> {
    return this.repository.listServices(query);
  }

  async getService(id: string): Promise<ServiceDto> {
    const service = await this.repository.findService(id);
    if (!service) throw new NotFoundError("Service not found.");
    return service;
  }

  async createService(input: CreateServiceRequest, actor: AuditActor): Promise<ServiceDto> {
    await this.checkService(input);
    return this.db.transaction(async (tx) => {
      const id = await this.repository.createService(tx, input);
      const service = (await this.repository.findService(id, tx))!;
      await this.audit.record(tx, {
        entityType: "service",
        entityId: id,
        action: "created",
        actor,
        source: "admin",
        meta: { label: serviceLabel(service), collection: "Services" },
      });
      return service;
    });
  }

  async updateService(id: string, input: UpdateServiceRequest, actor: AuditActor): Promise<ServiceDto> {
    await this.checkService(input);
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findService(id, tx);
      if (!before) throw new NotFoundError("Service not found.");
      await this.repository.updateService(tx, id, input);
      const after = (await this.repository.findService(id, tx))!;
      const changes = diffRecord(SERVICE_FIELDS, before, after);
      if (changes.length > 0)
        await this.audit.record(tx, {
          entityType: "service",
          entityId: id,
          action: "updated",
          actor,
          source: "admin",
          changes,
          meta: { label: serviceLabel(after) },
        });
      return after;
    });
  }

  async setServiceArchived(id: string, archived: boolean, actor: AuditActor): Promise<ServiceDto> {
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findService(id, tx);
      if (!before) throw new NotFoundError("Service not found.");
      if ((before.archivedAt !== null) === archived) return before;
      await this.repository.setServiceArchived(tx, id, actor.type === "admin" ? actor.id : null, archived);
      await this.audit.record(tx, {
        entityType: "service",
        entityId: id,
        action: archived ? "archived" : "restored",
        actor,
        source: "admin",
        meta: { label: serviceLabel(before) },
      });
      return (await this.repository.findService(id, tx))!;
    });
  }

  private async checkService(input: UpdateServiceRequest) {
    const issues: { path: string; message: string }[] = [];
    if (input.statusKey && !(await this.repository.knownKey("status", input.statusKey))) issues.push({ path: "statusKey", message: "Unknown status." });
    for (const key of input.categoryKeys ?? []) {
      if (!(await this.repository.knownKey("category", key))) issues.push({ path: "categoryKeys", message: "Unknown category." });
    }
    if (input.hostingModelKey && !(await this.repository.knownKey("hosting", input.hostingModelKey)))
      issues.push({ path: "hostingModelKey", message: "Unknown hosting model." });
    if (issues.length > 0) throw new ValidationFailedError(issues);
  }

  // ---- Access grants ----

  listGrants(query: GrantsListQuery): Promise<Page<GrantDto>> {
    return this.repository.listGrants(query);
  }

  async getGrant(id: string): Promise<GrantDto> {
    const grant = await this.repository.findGrant(id);
    if (!grant) throw new NotFoundError("Permission not found.");
    return grant;
  }

  /** "Candide granted Stanley Superadmin on GitHub": one event (OPS-151). */
  async createGrant(input: CreateGrantRequest, actor: AuditActor): Promise<GrantDto> {
    await this.checkGrant(input);
    return this.db.transaction(async (tx) => {
      const id = await this.repository.createGrant(tx, input);
      const grant = (await this.repository.findGrant(id, tx))!;
      await this.audit.record(tx, {
        entityType: "access_grant",
        entityId: id,
        action: "access_granted",
        actor,
        source: "admin",
        meta: {
          label: grantLabel(grant),
          collection: "Permissions",
          account: grant.account?.name ?? grant.person?.name ?? null,
          level: grant.level ? capitalized(grant.level.label) : null,
          service: grant.service.name,
          related: related(grant),
        },
      });
      return grant;
    });
  }

  async updateGrant(id: string, input: UpdateGrantRequest, actor: AuditActor): Promise<GrantDto> {
    await this.checkGrant(input);
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findGrant(id, tx);
      if (!before) throw new NotFoundError("Permission not found.");
      await this.repository.updateGrant(tx, id, input);
      const after = (await this.repository.findGrant(id, tx))!;
      const changes = diffRecord(GRANT_FIELDS, before, after);
      if (changes.length === 0) return after;
      await this.recordGrant(tx, "updated", before, after, actor, { changes });
      return after;
    });
  }

  async setGrantArchived(id: string, archived: boolean, actor: AuditActor): Promise<GrantDto> {
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findGrant(id, tx);
      if (!before) throw new NotFoundError("Permission not found.");
      if ((before.archivedAt !== null) === archived) return before;
      await this.repository.setGrantArchived(tx, id, actor.type === "admin" ? actor.id : null, archived);
      await this.recordGrant(tx, archived ? "archived" : "restored", before, before, actor);
      return (await this.repository.findGrant(id, tx))!;
    });
  }

  /** A grant's own event, shown on the records it names before and after (OPS-151). */
  private async recordGrant(
    tx: Executor,
    action: "updated" | "archived" | "restored",
    before: GrantDto,
    after: GrantDto,
    actor: AuditActor,
    extra: { changes?: ReturnType<typeof diffRecord> } = {},
  ) {
    await this.audit.record(tx, {
      entityType: "access_grant",
      entityId: after.id,
      action,
      actor,
      source: "admin",
      changes: extra.changes ?? [],
      meta: { label: grantLabel(after), related: related(before, after) },
    });
  }

  private async checkGrant(input: UpdateGrantRequest) {
    const issues: { path: string; message: string }[] = [];
    if (input.serviceId && !(await this.repository.serviceExists(input.serviceId))) issues.push({ path: "serviceId", message: "Unknown service." });
    if (input.personId && !(await this.repository.personExists(input.personId))) issues.push({ path: "personId", message: "Unknown person." });
    if (input.adminUserId && !(await this.repository.accountExists(input.adminUserId))) issues.push({ path: "adminUserId", message: "Unknown account." });
    if (input.levelKey && !(await this.repository.knownKey("level", input.levelKey))) issues.push({ path: "levelKey", message: "Unknown permission level." });
    if (input.statusKey && !(await this.repository.knownKey("accessStatus", input.statusKey))) issues.push({ path: "statusKey", message: "Unknown status." });
    if (issues.length > 0) throw new ValidationFailedError(issues);
  }
}

/** "superadmin" → "Superadmin", as in a permission's name (OPS-138). */
const capitalized = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);
