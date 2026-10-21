import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { actorFor } from "../audit/audit.service.js";
import type { AdminRequest } from "../auth/admin-area.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import { CreatePersonRequest, DeletePersonRequest, PeopleListQuery, UpdatePersonRequest } from "./people.contracts.js";
import { PeopleService } from "./people.service.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

const actor = (request: AdminRequest) => {
  if (!request.admin) throw new UnauthenticatedError();
  return actorFor(request.admin);
};

/**
 * /api/admin/people — owner-only (the global admin guard covers every
 * `admin/*` controller). Every write is audited with the signed-in admin as
 * its actor. Archive instead of delete; permanent delete is owner-only,
 * behind the typed name (decision 12 of 2026-10-19).
 */
@Controller("admin/people")
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  list(@Query(new ZodValidationPipe(PeopleListQuery)) query: PeopleListQuery) {
    return this.people.list(query);
  }

  /** States, sources and contact channels for pickers/filters (labels come from the database, not the client). */
  @Get("options")
  options() {
    return this.people.options();
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreatePersonRequest)) body: CreatePersonRequest, @Req() request: AdminRequest) {
    return this.people.create(body, actor(request));
  }

  @Get(":id")
  get(@Param("id", IdParam) id: string) {
    return this.people.get(id);
  }

  /** POST /api/admin/people/:id/duplicate — the new copy (201). */
  @Post(":id/duplicate")
  duplicate(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.people.duplicate(id, actor(request));
  }

  @Patch(":id")
  update(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(UpdatePersonRequest)) body: UpdatePersonRequest, @Req() request: AdminRequest) {
    return this.people.update(id, body, actor(request));
  }

  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.people.setArchived(id, true, actor(request));
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.people.setArchived(id, false, actor(request));
  }

  /** Permanent delete: owner only, with the person's name typed in `confirm`. */
  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(DeletePersonRequest)) body: DeletePersonRequest, @Req() request: AdminRequest) {
    return this.people.delete(id, body.confirm, actor(request));
  }

  @Put(":id/organizations/:organizationId")
  @HttpCode(204)
  linkOrganization(@Param("id", IdParam) id: string, @Param("organizationId", IdParam) organizationId: string, @Req() request: AdminRequest) {
    return this.people.link("organization", id, organizationId, actor(request));
  }

  @Delete(":id/organizations/:organizationId")
  @HttpCode(204)
  unlinkOrganization(@Param("id", IdParam) id: string, @Param("organizationId", IdParam) organizationId: string, @Req() request: AdminRequest) {
    return this.people.unlink("organization", id, organizationId, actor(request));
  }

  @Put(":id/expertise/:expertiseId")
  @HttpCode(204)
  linkExpertise(@Param("id", IdParam) id: string, @Param("expertiseId", IdParam) expertiseId: string, @Req() request: AdminRequest) {
    return this.people.link("expertise", id, expertiseId, actor(request));
  }

  @Delete(":id/expertise/:expertiseId")
  @HttpCode(204)
  unlinkExpertise(@Param("id", IdParam) id: string, @Param("expertiseId", IdParam) expertiseId: string, @Req() request: AdminRequest) {
    return this.people.unlink("expertise", id, expertiseId, actor(request));
  }
}
