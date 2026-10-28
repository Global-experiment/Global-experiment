import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { actorFor } from "../audit/audit.service.js";
import type { AdminRequest } from "../auth/admin-area.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { z } from "zod";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  CreateDomainRequest,
  CreateExpertiseRequest,
  CreateFieldRequest,
  ExpertiseSearchQuery,
  RenameRequest,
} from "./expertise.contracts.js";
import { ExpertiseService } from "./expertise.service.js";
import { Requires } from "../access-control/requires.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

/**
 * /api/admin/expertise — the Domain → Field → Expertise taxonomy.
 * Assigning expertise to people/organizations lives on those resources.
 */
const actor = (request: AdminRequest) => {
  if (!request.admin) throw new UnauthenticatedError();
  return actorFor(request.admin);
};

@Controller("admin/expertise")
export class ExpertiseController {
  constructor(private readonly expertise: ExpertiseService) {}

  @Get("tree")
  @Requires("taxonomy.read")
  tree() {
    return this.expertise.tree();
  }

  /** Picker search: ranked, paginated, Active items unless `includeInactive=true`. */
  @Get("search")
  @Requires("taxonomy.read")
  search(@Query(new ZodValidationPipe(ExpertiseSearchQuery)) query: ExpertiseSearchQuery) {
    return this.expertise.search(query);
  }

  @Post("domains")
  @Requires("taxonomy.create")
  createDomain(@Body(new ZodValidationPipe(CreateDomainRequest)) body: CreateDomainRequest, @Req() request: AdminRequest) {
    return this.expertise.createDomain(body.name, actor(request));
  }

  @Patch("domains/:id")
  @Requires("taxonomy.update")
  renameDomain(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(RenameRequest)) body: RenameRequest, @Req() request: AdminRequest) {
    return this.expertise.rename("domain", id, body.name, actor(request));
  }

  @Delete("domains/:id")
  @Requires("taxonomy.delete")
  @HttpCode(204)
  deleteDomain(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.expertise.delete("domain", id, actor(request));
  }

  @Post("fields")
  @Requires("taxonomy.create")
  createField(@Body(new ZodValidationPipe(CreateFieldRequest)) body: CreateFieldRequest, @Req() request: AdminRequest) {
    return this.expertise.createField(body.domainId, body.name, actor(request));
  }

  @Patch("fields/:id")
  @Requires("taxonomy.update")
  renameField(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(RenameRequest)) body: RenameRequest, @Req() request: AdminRequest) {
    return this.expertise.rename("field", id, body.name, actor(request));
  }

  @Delete("fields/:id")
  @Requires("taxonomy.delete")
  @HttpCode(204)
  deleteField(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.expertise.delete("field", id, actor(request));
  }

  @Post("items")
  @Requires("taxonomy.create")
  createExpertise(@Body(new ZodValidationPipe(CreateExpertiseRequest)) body: CreateExpertiseRequest, @Req() request: AdminRequest) {
    return this.expertise.createExpertise(body.fieldId, body.name, actor(request));
  }

  @Patch("items/:id")
  @Requires("taxonomy.update")
  renameExpertise(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(RenameRequest)) body: RenameRequest, @Req() request: AdminRequest) {
    return this.expertise.rename("expertise", id, body.name, actor(request));
  }

  @Delete("items/:id")
  @Requires("taxonomy.delete")
  @HttpCode(204)
  deleteExpertise(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.expertise.delete("expertise", id, actor(request));
  }
}
