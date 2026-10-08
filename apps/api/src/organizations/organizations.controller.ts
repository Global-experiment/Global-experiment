import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  CreateOrganizationRequest,
  OrganizationsListQuery,
  UpdateOrganizationRequest,
} from "./organizations.contracts.js";
import { OrganizationsService } from "./organizations.service.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

/**
 * /api/admin/organizations — owner-only (the global admin session and CSRF
 * Origin guards cover every `admin/*` controller). People ↔ Organization
 * links can be managed from either side — here (PUT/DELETE
 * :id/people/:personId) or from the person (PUT/DELETE
 * /api/admin/people/:id/organizations/:id) — over the same table.
 * No DELETE for organizations yet (retention undecided).
 */
@Controller("admin/organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(OrganizationsListQuery)) query: OrganizationsListQuery) {
    return this.organizations.list(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateOrganizationRequest)) body: CreateOrganizationRequest) {
    return this.organizations.create(body);
  }

  @Get(":id")
  get(@Param("id", IdParam) id: string) {
    return this.organizations.get(id);
  }

  @Patch(":id")
  update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(UpdateOrganizationRequest)) body: UpdateOrganizationRequest,
  ) {
    return this.organizations.update(id, body);
  }

  @Put(":id/expertise/:expertiseId")
  @HttpCode(204)
  linkExpertise(@Param("id", IdParam) id: string, @Param("expertiseId", IdParam) expertiseId: string) {
    return this.organizations.linkExpertise(id, expertiseId);
  }

  @Delete(":id/expertise/:expertiseId")
  @HttpCode(204)
  unlinkExpertise(@Param("id", IdParam) id: string, @Param("expertiseId", IdParam) expertiseId: string) {
    return this.organizations.unlinkExpertise(id, expertiseId);
  }

  @Put(":id/people/:personId")
  @HttpCode(204)
  linkPerson(@Param("id", IdParam) id: string, @Param("personId", IdParam) personId: string) {
    return this.organizations.linkPerson(id, personId);
  }

  @Delete(":id/people/:personId")
  @HttpCode(204)
  unlinkPerson(@Param("id", IdParam) id: string, @Param("personId", IdParam) personId: string) {
    return this.organizations.unlinkPerson(id, personId);
  }
}
