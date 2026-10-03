import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  CreateDomainRequest,
  CreateExpertiseRequest,
  CreateFieldRequest,
  RenameRequest,
} from "./expertise.contracts.js";
import { ExpertiseService } from "./expertise.service.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

/**
 * /api/admin/expertise — the Domain → Field → Expertise taxonomy.
 * Assigning expertise to people/organizations lives on those resources.
 */
@Controller("admin/expertise")
export class ExpertiseController {
  constructor(private readonly expertise: ExpertiseService) {}

  @Get("tree")
  tree() {
    return this.expertise.tree();
  }

  @Post("domains")
  createDomain(@Body(new ZodValidationPipe(CreateDomainRequest)) body: CreateDomainRequest) {
    return this.expertise.createDomain(body.name);
  }

  @Patch("domains/:id")
  renameDomain(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(RenameRequest)) body: RenameRequest) {
    return this.expertise.rename("domain", id, body.name);
  }

  @Delete("domains/:id")
  @HttpCode(204)
  deleteDomain(@Param("id", IdParam) id: string) {
    return this.expertise.delete("domain", id);
  }

  @Post("fields")
  createField(@Body(new ZodValidationPipe(CreateFieldRequest)) body: CreateFieldRequest) {
    return this.expertise.createField(body.domainId, body.name);
  }

  @Patch("fields/:id")
  renameField(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(RenameRequest)) body: RenameRequest) {
    return this.expertise.rename("field", id, body.name);
  }

  @Delete("fields/:id")
  @HttpCode(204)
  deleteField(@Param("id", IdParam) id: string) {
    return this.expertise.delete("field", id);
  }

  @Post("items")
  createExpertise(@Body(new ZodValidationPipe(CreateExpertiseRequest)) body: CreateExpertiseRequest) {
    return this.expertise.createExpertise(body.fieldId, body.name);
  }

  @Patch("items/:id")
  renameExpertise(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(RenameRequest)) body: RenameRequest) {
    return this.expertise.rename("expertise", id, body.name);
  }

  @Delete("items/:id")
  @HttpCode(204)
  deleteExpertise(@Param("id", IdParam) id: string) {
    return this.expertise.delete("expertise", id);
  }
}
