import { Inject, Injectable } from "@nestjs/common";
import { AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor, AuditChange } from "../audit/audit.types.js";
import { diffRecord, type FieldSpec } from "../audit/record-fields.js";
import type { AdminPrincipal } from "../auth/auth.service.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
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
  { field: "category", label: "Category", kind: "select", get: (s) => s.category },
  { field: "hostingModel", label: "Hosting model", kind: "select", get: (s) => s.hostingModel },
  { field: "url", label: "URL", kind: "url", get: (s) => s.url },
  { field: "description", label: "Description", kind: "text", get: (s) => s.description },
  { field: "responsible", label: "Responsible account", kind: "relation", get: (s) => (s.responsible ? [ref(s.responsible)!] : []) },
];

/** The grant fields the history records (Figma p17 order). */
export const GRANT_FIELDS: readonly FieldSpec<GrantDto>[] = [
  { field: "name", label: "Name", kind: "text", get: (g) => g.name },
  { field: "person", label: "Account", kind: "relation", get: (g) => (g.person ? [ref(g.person)!] : []) },
  { field: "account", label: "Admin account", kind: "relation", get: (g) => (g.account ? [ref(g.account)!] : []) },
  { field: "service", label: "Service", kind: "relation", get: (g) => [ref(g.service)!] },
  { field: "level", label: "Permission level", kind: "select", get: (g) => g.level },
  { field: "status", label: "Status", kind: "select", get: (g) => g.status },
  { field: "resourceScope", label: "Resource scope", kind: "text", get: (g) => g.resourceScope },
  { field: "grantedOn", label: "Granted", kind: "date", get: (g) => g.grantedOn },
  { field: "revokedOn", label: "Revoked", kind: "date", get: (g) => g.revokedOn },
  { field: "expiresOn", label: "Expires", kind: "date", get: (g) => g.expiresOn },
];

export const serviceLabel = (service: Pick<ServiceDto, "name">) => service.name;
export const grantLabel = (grant: Pick<GrantDto, "grantNumber" | "title">) => `#${grant.grantNumber} · ${grant.title}`;
/** "GitHub · admin", as the person, account and service histories show a grant (prototype p4). */
export const accessChip = (grant: Pick<GrantDto, "id" | "service" | "level">) => ({ id: grant.id, label: `${grant.service.name}${grant.level ? ` · ${grant.level.label}` : ""}` });

const owners = (grant: GrantDto) =>
  [
    ["person", grant.person?.id ?? null, grant.person?.name ?? ""],
    ["admin_user", grant.account?.id ?? null, grant.account?.name ?? ""],
    ["service", grant.service.id, grant.service.name],
  ] as const;

/**
 * Services and access grants (admin-desktop.pdf p16–p17). Every write is one
 * transaction with its history: the grant's own event, and — decision of
 * 2026-10-28 — "granted / changed / revoked access" on its person, its
 * admin account and its service, so each of those records shows it.
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
      await this.audit.record(tx, { entityType: "service", entityId: id, action: "created", actor, source: "admin", meta: { label: serviceLabel(service), collection: "Services" } });
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
      if (changes.length > 0) await this.audit.record(tx, { entityType: "service", entityId: id, action: "updated", actor, source: "admin", changes, meta: { label: serviceLabel(after) } });
      return after;
    });
  }

  async setServiceArchived(id: string, archived: boolean, actor: AuditActor): Promise<ServiceDto> {
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findService(id, tx);
      if (!before) throw new NotFoundError("Service not found.");
      if ((before.archivedAt !== null) === archived) return before;
      await this.repository.setServiceArchived(tx, id, actor.type === "admin" ? actor.id : null, archived);
      await this.audit.record(tx, { entityType: "service", entityId: id, action: archived ? "archived" : "restored", actor, source: "admin", meta: { label: serviceLabel(before) } });
      return (await this.repository.findService(id, tx))!;
    });
  }

  /** Permanent delete (decision 12): the name typed exactly; refused while grants name the service (archive it instead). */
  async deleteService(id: string, confirm: string, principal: AdminPrincipal, actor: AuditActor): Promise<void> {
    if (!principal.permissions.has("services.delete")) throw new ForbiddenError("Your role doesn't allow deleting services.");
    const service = await this.getService(id);
    if (confirm.trim() !== service.name) throw new ValidationFailedError([{ path: "confirm", message: "Type the service's name exactly to confirm." }]);
    if (await this.repository.serviceHasGrants(id)) throw new ConflictError("Permissions name this service: archive it instead.");
    await this.db.transaction(async (tx) => {
      await this.audit.record(tx, { entityType: "service", entityId: id, action: "deleted", actor, source: "admin", meta: { label: serviceLabel(service), number: String(service.serviceNumber) } });
      await this.repository.deleteService(tx, id);
    });
  }

  private async checkService(input: UpdateServiceRequest) {
    const issues: { path: string; message: string }[] = [];
    if (input.statusKey && !(await this.repository.knownKey("status", input.statusKey))) issues.push({ path: "statusKey", message: "Unknown status." });
    if (input.categoryKey && !(await this.repository.knownKey("category", input.categoryKey))) issues.push({ path: "categoryKey", message: "Unknown category." });
    if (input.hostingModelKey && !(await this.repository.knownKey("hosting", input.hostingModelKey))) issues.push({ path: "hostingModelKey", message: "Unknown hosting model." });
    if (input.responsibleAdminId && !(await this.repository.accountExists(input.responsibleAdminId))) issues.push({ path: "responsibleAdminId", message: "Unknown account." });
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

  async createGrant(input: CreateGrantRequest, actor: AuditActor): Promise<GrantDto> {
    await this.checkGrant(input);
    return this.db.transaction(async (tx) => {
      const id = await this.repository.createGrant(tx, input);
      const grant = (await this.repository.findGrant(id, tx))!;
      await this.audit.record(tx, { entityType: "access_grant", entityId: id, action: "created", actor, source: "admin", meta: { label: grantLabel(grant), collection: "Permissions" } });
      await this.recordAccess(tx, null, grant, actor);
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
      await this.audit.record(tx, { entityType: "access_grant", entityId: id, action: "updated", actor, source: "admin", changes, meta: { label: grantLabel(after) } });
      await this.recordAccess(tx, before, after, actor);
      return after;
    });
  }

  async setGrantArchived(id: string, archived: boolean, actor: AuditActor): Promise<GrantDto> {
    return this.db.transaction(async (tx) => {
      const before = await this.repository.findGrant(id, tx);
      if (!before) throw new NotFoundError("Permission not found.");
      if ((before.archivedAt !== null) === archived) return before;
      await this.repository.setGrantArchived(tx, id, actor.type === "admin" ? actor.id : null, archived);
      await this.audit.record(tx, { entityType: "access_grant", entityId: id, action: archived ? "archived" : "restored", actor, source: "admin", meta: { label: grantLabel(before) } });
      return (await this.repository.findGrant(id, tx))!;
    });
  }

  /** Permanent delete: the grant's ID typed ("#12"); its person, account and service record the access as revoked. */
  async deleteGrant(id: string, confirm: string, principal: AdminPrincipal, actor: AuditActor): Promise<void> {
    if (!principal.permissions.has("access.delete")) throw new ForbiddenError("Your role doesn't allow deleting permissions.");
    const grant = await this.getGrant(id);
    if (confirm.trim() !== `#${grant.grantNumber}`) throw new ValidationFailedError([{ path: "confirm", message: `Type #${grant.grantNumber} to confirm.` }]);
    await this.db.transaction(async (tx) => {
      await this.audit.record(tx, { entityType: "access_grant", entityId: id, action: "deleted", actor, source: "admin", meta: { label: grantLabel(grant), number: `#${grant.grantNumber}` } });
      await this.recordAccess(tx, grant, null, actor, "Permission deleted.");
      await this.repository.deleteGrant(tx, id);
    });
  }

  /**
   * "granted / changed / revoked access" on the grant's person, admin
   * account and service (prototype p4): a new owner is granted it, a removed
   * one revoked; on the same owner, a status turning Revoked or Expired is a
   * revocation, any other change of service, level or status a change.
   */
  private async recordAccess(tx: Executor, before: GrantDto | null, after: GrantDto | null, actor: AuditActor, note?: string) {
    const ended = (grant: GrantDto | null) => grant?.status?.key === "revoked" || grant?.status?.key === "expired";
    const previous = before ? owners(before) : null;
    const next = after ? owners(after) : null;
    for (let index = 0; index < 3; index++) {
      const [entityType, oldId, oldName] = previous?.[index] ?? [null, null, ""];
      const [type, newId, newName] = next?.[index] ?? [null, null, ""];
      const kind = (type ?? entityType)!;
      const change = (from: GrantDto | null, to: GrantDto | null): AuditChange => ({
        field: "permissions",
        label: "Permissions",
        kind: "relation",
        before: from ? [accessChip(from)] : [],
        after: to ? [accessChip(to)] : [],
      });
      const record = (entityId: string, label: string, action: "access_granted" | "access_changed" | "access_revoked", changes: AuditChange[], meta: Record<string, unknown> = {}) =>
        this.audit.record(tx, { entityType: kind, entityId, action, actor, source: "admin", changes, meta: { label, ...meta } });
      if (oldId && oldId !== newId) await record(oldId, oldName, "access_revoked", [change(before, null)], { note: note ?? "No longer linked to this permission." });
      if (newId && newId !== oldId) await record(newId, newName, ended(after) ? "access_revoked" : "access_granted", [change(null, after)], ended(after) ? { note: `Status: ${after!.status!.label}.` } : {});
      if (oldId && newId && oldId === newId && before && after) {
        const chipChanged = accessChip(before).label !== accessChip(after).label;
        const statusChanged = before.status?.key !== after.status?.key;
        if (!chipChanged && !statusChanged) continue;
        if (!ended(before) && ended(after)) {
          await record(newId, newName, "access_revoked", [change(before, null)], { note: `Grant status changed to ${after.status!.label}.` });
        } else {
          await record(newId, newName, "access_changed", [change(before, after)], statusChanged ? { note: `Status: ${before.status?.label ?? "Not set"} → ${after.status?.label ?? "Not set"}.` } : {});
        }
      }
    }
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
