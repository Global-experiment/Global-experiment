import { Body, Controller, Get, Param, Post, Req, UploadedFile as UploadedFileParam, UseInterceptors, type PipeTransform } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { Requires, RequiresForParam } from "../../access-control/requires.js";
import type { AdminRequest } from "../../auth/admin-area.js";
import { ForbiddenError, UnauthenticatedError, ValidationFailedError } from "../../common/errors/api-error.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { ONLY_DIRECTORY_IMPORTS } from "../imports.controller.js";
import { CSV_TABLES, type CsvTable } from "./csv-fields.js";
import { CsvImportService, type CsvOptions } from "./csv-import.service.js";
import { CSV_MAX_BYTES } from "./csv-parse.js";

/** Creating records is the table's write access: the CSV import needs `directory.create`. */
export const CSV_MODULES = { people: "directory", organizations: "directory" } as const;

/** People or Organizations; any other table has no import (403), whatever the role. */
const TableParam: PipeTransform<unknown, CsvTable> = {
  transform(value: unknown) {
    if (!(CSV_TABLES as readonly unknown[]).includes(value)) throw new ForbiddenError(ONLY_DIRECTORY_IMPORTS);
    return value as CsvTable;
  },
};
const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));

const counts = z.strictObject({
  fileName: z.string().max(200),
  rows: z.number().int().min(0),
  create: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  duplicatesIncluded: z.number().int().min(0),
  errors: z.number().int().min(0),
});
/** The multipart "options" field: JSON. */
const Options = z.strictObject({
  fileName: z.string().max(500).optional(),
  mapping: z.array(z.string().max(40).nullable()).max(100).optional(),
  include: z.array(z.number().int().min(2)).max(10_000).optional(),
  expect: counts.optional(),
});
type Options = z.output<typeof Options>;

function readOptions(raw: unknown): Options {
  if (raw === undefined || raw === "") return {};
  let json: unknown;
  try {
    json = JSON.parse(String(raw));
  } catch {
    throw new ValidationFailedError([{ path: "options", message: "Invalid options." }]);
  }
  const parsed = Options.safeParse(json);
  if (!parsed.success) throw new ValidationFailedError(parsed.error.issues.map((issue) => ({ path: `options.${issue.path.join(".")}`, message: issue.message })));
  return parsed.data;
}

type Upload = { buffer: Buffer; originalname: string } | undefined;
const upload = (file: Upload, options: Options) => (file ? { buffer: file.buffer, fileName: options.fileName ?? file.originalname } : undefined);
const multipart = () => FileInterceptor("file", { limits: { fileSize: CSV_MAX_BYTES + 1, files: 1, fields: 1, parts: 2 } });

/**
 * /api/admin/imports/csv — the CSV import of People and Organizations:
 * preview (nothing written), confirm (one transaction), and the report of
 * a run. Each request carries the file (multipart "file") and the choices
 * (multipart "options", JSON); nothing is stored between the steps.
 */
@Controller("admin/imports/csv")
export class CsvImportController {
  constructor(private readonly imports: CsvImportService) {}

  @Post(":table/preview")
  @RequiresForParam("table", CSV_MODULES, "create")
  @UseInterceptors(multipart())
  preview(@Param("table", TableParam) table: CsvTable, @UploadedFileParam() file: Upload, @Body("options") raw: unknown) {
    const options = readOptions(raw);
    return this.imports.preview(table, upload(file, options), options satisfies CsvOptions);
  }

  @Post(":table/confirm")
  @RequiresForParam("table", CSV_MODULES, "create")
  @UseInterceptors(multipart())
  confirm(@Param("table", TableParam) table: CsvTable, @UploadedFileParam() file: Upload, @Body("options") raw: unknown, @Req() request: AdminRequest) {
    if (!request.admin) throw new UnauthenticatedError();
    const options = readOptions(raw);
    if (!options.expect || !options.mapping) throw new ValidationFailedError([{ path: "options", message: "Confirm the preview you reviewed (its column choices and counts)." }]);
    return this.imports.confirm(table, upload(file, options), { mapping: options.mapping, include: options.include, expect: options.expect }, request.admin);
  }

  @Get("runs/:id")
  @Requires("directory.read")
  report(@Param("id", IdParam) id: string) {
    return this.imports.report(id);
  }
}
