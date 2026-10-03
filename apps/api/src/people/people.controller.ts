import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  CreatePersonRequest,
  PeopleListQuery,
  UpdatePersonRequest,
} from "./people.contracts.js";
import { PeopleService } from "./people.service.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

/**
 * /api/admin/people — owner-only (the global admin guard covers every
 * `admin/*` controller). No DELETE: whether people may be destroyed (vs.
 * archived) is an open retention decision.
 */
@Controller("admin/people")
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  list(@Query(new ZodValidationPipe(PeopleListQuery)) query: PeopleListQuery) {
    return this.people.list(query);
  }

  /** States and sources for pickers/filters (labels come from the database, not the client). */
  @Get("options")
  options() {
    return this.people.options();
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreatePersonRequest)) body: CreatePersonRequest) {
    return this.people.create(body);
  }

  @Get(":id")
  get(@Param("id", IdParam) id: string) {
    return this.people.get(id);
  }

  @Patch(":id")
  update(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(UpdatePersonRequest)) body: UpdatePersonRequest) {
    return this.people.update(id, body);
  }

  @Put(":id/organizations/:organizationId")
  @HttpCode(204)
  linkOrganization(@Param("id", IdParam) id: string, @Param("organizationId", IdParam) organizationId: string) {
    return this.people.link("organization", id, organizationId);
  }

  @Delete(":id/organizations/:organizationId")
  @HttpCode(204)
  unlinkOrganization(@Param("id", IdParam) id: string, @Param("organizationId", IdParam) organizationId: string) {
    return this.people.unlink("organization", id, organizationId);
  }

  @Put(":id/expertise/:expertiseId")
  @HttpCode(204)
  linkExpertise(@Param("id", IdParam) id: string, @Param("expertiseId", IdParam) expertiseId: string) {
    return this.people.link("expertise", id, expertiseId);
  }

  @Delete(":id/expertise/:expertiseId")
  @HttpCode(204)
  unlinkExpertise(@Param("id", IdParam) id: string, @Param("expertiseId", IdParam) expertiseId: string) {
    return this.people.unlink("expertise", id, expertiseId);
  }
}
