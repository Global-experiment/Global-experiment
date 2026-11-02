import { Module } from "@nestjs/common";
import { OrganizationsRepository } from "../organizations/organizations.repository.js";
import { PeopleRepository } from "../people/people.repository.js";
import { CsvImportController } from "./csv/csv-import.controller.js";
import { CsvImportService } from "./csv/csv-import.service.js";
import { ImportRunsService } from "./import-runs.service.js";
import { ImportsController } from "./imports.controller.js";

/** Imports: the CSV import of People and Organizations, and the history of runs (OPS-154). */
@Module({
  controllers: [ImportsController, CsvImportController],
  providers: [
    ImportRunsService,
    // The CSV import creates records the way the detail pages do, through their repositories.
    CsvImportService,
    PeopleRepository,
    OrganizationsRepository,
  ],
})
export class ImportsModule {}
