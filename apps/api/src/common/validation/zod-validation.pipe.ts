import type { PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ValidationFailedError } from "../errors/api-error.js";

/**
 * Validates and parses one request part (body, query, param) against a Zod
 * schema: `@Body(new ZodValidationPipe(LoginRequest)) body: LoginRequest`.
 * Unknown keys are stripped by the schemas themselves; issues report the
 * field path and rule, never the submitted value.
 */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform<unknown, z.output<Schema>> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ValidationFailedError(
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
}
