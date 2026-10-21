import { Inject, Injectable } from "@nestjs/common";
import { AuditService, type Executor } from "../audit/audit.service.js";
import type { AuditActor } from "../audit/audit.types.js";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { ConflictError, NotFoundError } from "../common/errors/api-error.js";
import type { ExpertiseLevel, ExpertiseSearchQuery, ExpertiseTreeDto } from "./expertise.contracts.js";
import { ExpertiseRepository } from "./expertise.repository.js";

const LABEL: Record<ExpertiseLevel, string> = { domain: "Domain", field: "Field", expertise: "Expertise" };
const ENTITY: Record<ExpertiseLevel, string> = { domain: "expertise_domain", field: "expertise_field", expertise: "expertise_item" };

/**
 * Taxonomy editing kept deliberately small: create, rename, and delete
 * only what nothing depends on. Duplicate sibling names are refused by a
 * unique index (409). No moves or merges — those need client rules first.
 * Every write records its audit event in the same transaction.
 */
@Injectable()
export class ExpertiseService {
  constructor(
    private readonly repository: ExpertiseRepository,
    private readonly audit: AuditService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  tree(): Promise<ExpertiseTreeDto> {
    return this.repository.tree();
  }

  search(query: ExpertiseSearchQuery) {
    return this.repository.search(query);
  }

  createDomain(name: string, actor: AuditActor) {
    return this.created("domain", actor, (tx) => this.repository.createDomain(name, tx));
  }

  async createField(domainId: string, name: string, actor: AuditActor) {
    if (!(await this.repository.exists("domain", domainId))) throw new NotFoundError("Domain not found.");
    return this.created("field", actor, (tx) => this.repository.createField(domainId, name, tx));
  }

  async createExpertise(fieldId: string, name: string, actor: AuditActor) {
    if (!(await this.repository.exists("field", fieldId))) throw new NotFoundError("Field not found.");
    return this.created("expertise", actor, (tx) => this.repository.createExpertise(fieldId, name, tx));
  }

  async rename(level: ExpertiseLevel, id: string, name: string, actor: AuditActor) {
    return this.db.transaction(async (tx) => {
      const before = await this.repository.nameOf(level, id, tx);
      const row = await this.repository.rename(level, id, name, tx);
      if (!row) throw new NotFoundError(`${LABEL[level]} not found.`);
      if (before !== row.name) {
        await this.audit.record(tx, {
          entityType: ENTITY[level],
          entityId: id,
          action: "updated",
          actor,
          source: "admin",
          changes: [{ field: "name", label: "Name", kind: "text", before: before ?? null, after: row.name }],
          meta: { label: row.name },
        });
      }
      return row;
    });
  }

  async delete(level: ExpertiseLevel, id: string, actor: AuditActor): Promise<void> {
    if (!(await this.repository.exists(level, id))) throw new NotFoundError(`${LABEL[level]} not found.`);
    const dependants = await this.repository.dependants(level, id);
    if (dependants > 0) throw new ConflictError(`${LABEL[level]} is still in use and can't be deleted.`, { dependants });
    await this.db.transaction(async (tx) => {
      const name = await this.repository.nameOf(level, id, tx);
      await this.audit.record(tx, { entityType: ENTITY[level], entityId: id, action: "deleted", actor, source: "admin", meta: { label: name ?? id } });
      await this.repository.delete(level, id, tx);
    });
  }

  private created<Row extends { id: string; name: string }>(level: ExpertiseLevel, actor: AuditActor, write: (tx: Executor) => Promise<Row>): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const row = await write(tx);
      await this.audit.record(tx, { entityType: ENTITY[level], entityId: row.id, action: "created", actor, source: "admin", meta: { label: row.name } });
      return row;
    });
  }
}
