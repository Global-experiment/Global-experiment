import { Module } from "@nestjs/common";
import { PeopleController } from "./people.controller.js";
import { PeopleRepository } from "./people.repository.js";
import { PeopleService } from "./people.service.js";
import { OrganizationsRepository } from "../organizations/organizations.repository.js";

@Module({
  controllers: [PeopleController],
  // OrganizationsRepository: a link changes the organization too, which gets its own audit event.
  providers: [PeopleRepository, PeopleService, OrganizationsRepository],
})
export class PeopleModule {}
