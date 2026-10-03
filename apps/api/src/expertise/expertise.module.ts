import { Module } from "@nestjs/common";
import { ExpertiseController } from "./expertise.controller.js";
import { ExpertiseRepository } from "./expertise.repository.js";
import { ExpertiseService } from "./expertise.service.js";

@Module({
  controllers: [ExpertiseController],
  providers: [ExpertiseRepository, ExpertiseService],
})
export class ExpertiseModule {}
