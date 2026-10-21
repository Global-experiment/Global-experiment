import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { actorFor } from "../audit/audit.service.js";
import type { AdminRequest } from "../auth/admin-area.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  CreateOrganizationRequest,
  DeleteOrganizationRequest,
  OrganizationsListQuery,
  UpdateOrganizationRequest,
} from "./organizations.contracts.js";
import { OrganizationsService } from "./organizations.service.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

const actor = (request: AdminRequest) => {
  if (!request.admin) throw new UnauthenticatedError();
  return actorFor(request.admin);
};

/**
 * /api/admin/organizations — owner-only (the global admin session and CSRF
 * Origin guards cover every `admin/*` controller). People ↔ Organization
 * links can be managed from either side — here (PUT/DELETE
 * :id/people/:personId) or from the person — over the same table. Every
 * write is audited; archive instead of delete; permanent delete is
 * owner-only behind the typed name (decision 12).
 */
@Controller("admin/organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(OrganizationsListQuery)) query: OrganizationsListQuery) {
    return this.organizations.list(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateOrganizationRequest)) body: CreateOrganizationRequest, @Req() request: AdminRequest) {
    return this.organizations.create(body, actor(request));
  }

  @Get(":id")
  get(@Param("id", IdParam) id: string) {
    return this.organizations.get(id);
  }

  /** POST /api/admin/organizations/:id/duplicate — the new copy (201). */
  @Post(":id/duplicate")
  duplicate(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.organizations.duplicate(id, actor(request));
  }

  @Patch(":id")
  update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(UpdateOrganizationRequest)) body: UpdateOrganizationRequest,
    @Req() request: AdminRequest,
  ) {
    return this.organizations.update(id, body, actor(request));
  }

  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.organizations.setArchived(id, true, actor(request));
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.organizations.setArchived(id, false, actor(request));
  }

  /** Permanent delete: owner only, with the organization's name typed in `confirm`. */
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(DeleteOrganizationRequest)) body: DeleteOrganizationRequest, @Req() request: AdminRequest) {
    return this.organizations.delete(id, body.confirm, actor(request));
  }

  @Put(":id/expertise/:expertiseId")
  @HttpCode(204)
  linkExpertise(@Param("id", IdParam) id: string, @Param("expertiseId", IdParam) expertiseId: string, @Req() request: AdminRequest) {
    return this.organizations.linkExpertise(id, expertiseId, actor(request));
  }

  @Delete(":id/expertise/:expertiseId")
  @HttpCode(204)
  unlinkExpertise(@Param("id", IdParam) id: string, @Param("expertiseId", IdParam) expertiseId: string, @Req() request: AdminRequest) {
    return this.organizations.unlinkExpertise(id, expertiseId, actor(request));
  }

  @Put(":id/people/:personId")
  @HttpCode(204)
  linkPerson(@Param("id", IdParam) id: string, @Param("personId", IdParam) personId: string, @Req() request: AdminRequest) {
    return this.organizations.linkPerson(id, personId, actor(request));
  }

  @Delete(":id/people/:personId")
  @HttpCode(204)
  unlinkPerson(@Param("id", IdParam) id: string, @Param("personId", IdParam) personId: string, @Req() request: AdminRequest) {
    return this.organizations.unlinkPerson(id, personId, actor(request));
  }
}
