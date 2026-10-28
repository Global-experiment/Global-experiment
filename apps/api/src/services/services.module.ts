import { Module } from "@nestjs/common";
import { AccessGrantsController, ServicesController } from "./services.controller.js";
import { ServicesRepository } from "./services.repository.js";
import { ServicesService } from "./services.service.js";

/** Services and access grants (admin-desktop.pdf p16–p17). */
@Module({
  controllers: [ServicesController, AccessGrantsController],
  providers: [ServicesRepository, ServicesService],
  exports: [ServicesRepository],
})
export class ServicesModule {}
