import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { ImportJobsService } from "./import-jobs.service.js";
import { createImportSource, IMPORT_SOURCE } from "./import-source.js";
import { ImportsController } from "./imports.controller.js";

@Module({
  controllers: [ImportsController],
  providers: [ImportJobsService, { provide: IMPORT_SOURCE, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createImportSource(config) }],
})
export class ImportsModule {}
