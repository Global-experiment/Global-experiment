import { Module } from "@nestjs/common";
import { PeopleController } from "./people.controller.js";
import { PeopleRepository } from "./people.repository.js";
import { PeopleService } from "./people.service.js";

@Module({
  controllers: [PeopleController],
  providers: [PeopleRepository, PeopleService],
})
export class PeopleModule {}
