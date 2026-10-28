import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { Requires } from "../access-control/requires.js";
import { actorFor } from "../audit/audit.service.js";
import type { AdminRequest } from "../auth/admin-area.js";
import { UnauthenticatedError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  CreateGrantRequest,
  CreateServiceRequest,
  DeleteRecordRequest,
  GrantsListQuery,
  ServicesListQuery,
  UpdateGrantRequest,
  UpdateServiceRequest,
} from "./services.contracts.js";
import { ServicesService } from "./services.service.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));
const principal = (request: AdminRequest) => {
  if (!request.admin) throw new UnauthenticatedError();
  return request.admin;
};

/** /api/admin/services — services (admin-desktop.pdf p16); access per services.* (overview §3.1). */
@Controller("admin/services")
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @Requires("services.read")
  list(@Query(new ZodValidationPipe(ServicesListQuery)) query: ServicesListQuery) {
    return this.services.listServices(query);
  }

  /** The lookups and the accounts the service and permission records offer. */
  @Get("options")
  @Requires("services.read")
  options() {
    return this.services.options();
  }

  @Post()
  @Requires("services.create")
  create(@Body(new ZodValidationPipe(CreateServiceRequest)) body: CreateServiceRequest, @Req() request: AdminRequest) {
    return this.services.createService(body, actorFor(principal(request)));
  }

  @Get(":id")
  @Requires("services.read")
  get(@Param("id", IdParam) id: string) {
    return this.services.getService(id);
  }

  @Patch(":id")
  @Requires("services.update")
  update(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(UpdateServiceRequest)) body: UpdateServiceRequest, @Req() request: AdminRequest) {
    return this.services.updateService(id, body, actorFor(principal(request)));
  }

  @Post(":id/archive")
  @HttpCode(200)
  @Requires("services.update")
  archive(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.services.setServiceArchived(id, true, actorFor(principal(request)));
  }

  @Post(":id/restore")
  @HttpCode(200)
  @Requires("services.update")
  restore(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.services.setServiceArchived(id, false, actorFor(principal(request)));
  }

  @Delete(":id")
  @HttpCode(204)
  @Requires("services.delete")
  async remove(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(DeleteRecordRequest)) body: DeleteRecordRequest, @Req() request: AdminRequest) {
    const admin = principal(request);
    await this.services.deleteService(id, body.confirm, admin, actorFor(admin));
  }
}

/** /api/admin/access-grants — permissions, i.e. access grants (admin-desktop.pdf p17); access per access.*. */
@Controller("admin/access-grants")
export class AccessGrantsController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @Requires("access.read")
  list(@Query(new ZodValidationPipe(GrantsListQuery)) query: GrantsListQuery) {
    return this.services.listGrants(query);
  }

  @Post()
  @Requires("access.create")
  create(@Body(new ZodValidationPipe(CreateGrantRequest)) body: CreateGrantRequest, @Req() request: AdminRequest) {
    return this.services.createGrant(body, actorFor(principal(request)));
  }

  @Get(":id")
  @Requires("access.read")
  get(@Param("id", IdParam) id: string) {
    return this.services.getGrant(id);
  }

  @Patch(":id")
  @Requires("access.update")
  update(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(UpdateGrantRequest)) body: UpdateGrantRequest, @Req() request: AdminRequest) {
    return this.services.updateGrant(id, body, actorFor(principal(request)));
  }

  @Post(":id/archive")
  @HttpCode(200)
  @Requires("access.update")
  archive(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.services.setGrantArchived(id, true, actorFor(principal(request)));
  }

  @Post(":id/restore")
  @HttpCode(200)
  @Requires("access.update")
  restore(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.services.setGrantArchived(id, false, actorFor(principal(request)));
  }

  @Delete(":id")
  @HttpCode(204)
  @Requires("access.delete")
  async remove(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(DeleteRecordRequest)) body: DeleteRecordRequest, @Req() request: AdminRequest) {
    const admin = principal(request);
    await this.services.deleteGrant(id, body.confirm, admin, actorFor(admin));
  }
}
