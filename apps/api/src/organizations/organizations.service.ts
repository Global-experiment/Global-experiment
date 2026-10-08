import { Inject, Injectable } from "@nestjs/common";
import { DATABASE, type Database } from "../common/database/database.module.js";
import { NotFoundError, ValidationFailedError } from "../common/errors/api-error.js";
import type { Page } from "../common/listing/list-query.js";
import { countExistingExpertise } from "../expertise/expertise-refs.js";
import type {
  CreateOrganizationRequest,
  OrganizationDto,
  OrganizationsListQuery,
  UpdateOrganizationRequest,
} from "./organizations.contracts.js";
import { OrganizationsRepository } from "./organizations.repository.js";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
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

  async create(input: CreateOrganizationRequest): Promise<OrganizationDto> {
    await this.assertExpertise(input.expertiseIds);
    return this.repository.create(input);
  }

  async update(id: string, input: UpdateOrganizationRequest): Promise<OrganizationDto> {
    await this.assertExpertise(input.expertiseIds);
    const organization = await this.repository.update(id, input);
    if (!organization) throw new NotFoundError("Organization not found.");
    return organization;
  }

  async linkExpertise(id: string, expertiseId: string): Promise<void> {
    if (!(await this.repository.exists(id))) throw new NotFoundError("Organization not found.");
    if ((await countExistingExpertise(this.db, [expertiseId])) === 0) throw new NotFoundError("Expertise not found.");
    await this.repository.linkExpertise(id, expertiseId);
  }

  async unlinkExpertise(id: string, expertiseId: string): Promise<void> {
    if (!(await this.repository.exists(id))) throw new NotFoundError("Organization not found.");
    await this.repository.unlinkExpertise(id, expertiseId);
  }

  async linkPerson(id: string, personId: string): Promise<void> {
    if (!(await this.repository.exists(id))) throw new NotFoundError("Organization not found.");
    if (!(await this.repository.personExists(personId))) throw new NotFoundError("Person not found.");
    await this.repository.linkPerson(id, personId);
  }

  async unlinkPerson(id: string, personId: string): Promise<void> {
    if (!(await this.repository.exists(id))) throw new NotFoundError("Organization not found.");
    await this.repository.unlinkPerson(id, personId);
  }

  private async assertExpertise(ids?: string[]) {
    if (!ids?.length) return;
    if ((await countExistingExpertise(this.db, ids)) !== ids.length) {
      throw new ValidationFailedError([{ path: "expertiseIds", message: "Unknown expertise." }]);
    }
  }
}
