import { Inject, Injectable } from "@nestjs/common";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { NotFoundError, ValidationFailedError, type ValidationIssue } from "../common/errors/api-error.js";
import type { Page } from "../common/listing/list-query.js";
import { countExistingExpertise } from "../expertise/expertise-refs.js";
import { countExistingOrganizations } from "../organizations/organization-refs.js";
import type {
  CreatePersonRequest,
  PeopleListQuery,
  PeopleOptionsDto,
  PersonDto,
  UpdatePersonRequest,
} from "./people.contracts.js";
import { PeopleRepository } from "./people.repository.js";

/**
 * People use cases. References (state, source, organizations, expertise)
 * are checked up front so a bad id is a 400 naming the field, not a
 * foreign-key 409 — the FKs remain the final guarantee.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly repository: PeopleRepository,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  list(query: PeopleListQuery): Promise<Page<PersonDto>> {
    return this.repository.list(query);
  }

  options(): Promise<PeopleOptionsDto> {
    return this.repository.options();
  }

  async get(id: string): Promise<PersonDto> {
    const person = await this.repository.findById(id);
    if (!person) throw new NotFoundError("Person not found.");
    return person;
  }

  async create(input: CreatePersonRequest): Promise<PersonDto> {
    await this.assertReferences(input);
    return this.repository.create(input);
  }

  async update(id: string, input: UpdatePersonRequest): Promise<PersonDto> {
    await this.assertReferences(input);
    const person = await this.repository.update(id, input);
    if (!person) throw new NotFoundError("Person not found.");
    return person;
  }

  async link(kind: "organization" | "expertise", personId: string, targetId: string): Promise<void> {
    await this.assertPerson(personId);
    await this.assertTarget(kind, targetId);
    await this.repository.link(kind, personId, targetId);
  }

  async unlink(kind: "organization" | "expertise", personId: string, targetId: string): Promise<void> {
    await this.assertPerson(personId);
    await this.repository.unlink(kind, personId, targetId);
  }

  private async assertPerson(id: string) {
    if (!(await this.repository.exists(id))) throw new NotFoundError("Person not found.");
  }

  private async assertTarget(kind: "organization" | "expertise", id: string) {
    const found =
      kind === "organization" ? await countExistingOrganizations(this.db, [id]) : await countExistingExpertise(this.db, [id]);
    if (found === 0) throw new NotFoundError(kind === "organization" ? "Organization not found." : "Expertise not found.");
  }

  private async assertReferences(input: UpdatePersonRequest) {
    const issues: ValidationIssue[] = [];
    if (input.stateKey && !(await this.repository.vocabularyExists("state", input.stateKey))) {
      issues.push({ path: "stateKey", message: "Unknown state." });
    }
    if (input.sourceKey && !(await this.repository.vocabularyExists("source", input.sourceKey))) {
      issues.push({ path: "sourceKey", message: "Unknown source." });
    }
    if (input.organizationIds?.length) {
      const found = await countExistingOrganizations(this.db, input.organizationIds);
      if (found !== input.organizationIds.length) issues.push({ path: "organizationIds", message: "Unknown organization." });
    }
    if (input.expertiseIds?.length) {
      const found = await countExistingExpertise(this.db, input.expertiseIds);
      if (found !== input.expertiseIds.length) issues.push({ path: "expertiseIds", message: "Unknown expertise." });
    }
    if (issues.length > 0) throw new ValidationFailedError(issues);
  }
}
