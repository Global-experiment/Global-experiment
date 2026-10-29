import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../common/config/config.module.js";
import type { AppConfig } from "../common/config/env.js";
import { OrganizationsRepository } from "../organizations/organizations.repository.js";
import { PeopleRepository } from "../people/people.repository.js";
import { CsvImportController } from "./csv/csv-import.controller.js";
import { CsvImportService } from "./csv/csv-import.service.js";
import { ImportJobsService } from "./import-jobs.service.js";
import { createImportSource, IMPORT_SOURCE } from "./import-source.js";
import { ImportsController } from "./imports.controller.js";

@Module({
  controllers: [ImportsController, CsvImportController],
  providers: [
    ImportJobsService,
    { provide: IMPORT_SOURCE, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createImportSource(config) },
    // The CSV import creates records the way the detail pages do, through their repositories.
    CsvImportService,
    PeopleRepository,
    OrganizationsRepository,
  ],
})
export class ImportsModule {}
