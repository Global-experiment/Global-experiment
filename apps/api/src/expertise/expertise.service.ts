import { Injectable } from "@nestjs/common";
import { ConflictError, NotFoundError } from "../common/errors/api-error.js";
import type { ExpertiseLevel, ExpertiseTreeDto } from "./expertise.contracts.js";
import { ExpertiseRepository } from "./expertise.repository.js";

const LABEL: Record<ExpertiseLevel, string> = { domain: "Domain", field: "Field", expertise: "Expertise" };

/**
 * Taxonomy editing kept deliberately small: create, rename, and delete
 * only what nothing depends on. Duplicate sibling names are refused by a
 * unique index (409). No moves or merges — those need client rules first.
 */
@Injectable()
export class ExpertiseService {
  constructor(private readonly repository: ExpertiseRepository) {}

  tree(): Promise<ExpertiseTreeDto> {
    return this.repository.tree();
  }

  createDomain(name: string) {
    return this.repository.createDomain(name);
  }

  async createField(domainId: string, name: string) {
    if (!(await this.repository.exists("domain", domainId))) throw new NotFoundError("Domain not found.");
    return this.repository.createField(domainId, name);
  }

  async createExpertise(fieldId: string, name: string) {
    if (!(await this.repository.exists("field", fieldId))) throw new NotFoundError("Field not found.");
    return this.repository.createExpertise(fieldId, name);
  }

  async rename(level: ExpertiseLevel, id: string, name: string) {
    const row = await this.repository.rename(level, id, name);
    if (!row) throw new NotFoundError(`${LABEL[level]} not found.`);
    return row;
  }

  async delete(level: ExpertiseLevel, id: string): Promise<void> {
    if (!(await this.repository.exists(level, id))) throw new NotFoundError(`${LABEL[level]} not found.`);
    const dependants = await this.repository.dependants(level, id);
    if (dependants > 0) {
      throw new ConflictError(`${LABEL[level]} is still in use and can't be deleted.`, { dependants });
    }
    await this.repository.delete(level, id);
  }
}
