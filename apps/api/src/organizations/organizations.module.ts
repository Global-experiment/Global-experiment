import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsRepository } from "./organizations.repository.js";
import { OrganizationsService } from "./organizations.service.js";
import { PeopleRepository } from "../people/people.repository.js";

@Module({
  controllers: [OrganizationsController],
  // PeopleRepository: a person link changes the person too, who gets their own audit event.
  providers: [OrganizationsRepository, OrganizationsService, PeopleRepository],
})
export class OrganizationsModule {}
