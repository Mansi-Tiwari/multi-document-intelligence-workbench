import type { z } from "zod";
import { ValidationError, zodIssuesToApiIssues } from "../domain/errors";

/**
 * Parses untrusted input (body, params, query, files) with `schema`.
 * Throws a `ValidationError` (400 with issues) when the input is rejected.
 */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown, message = "Invalid request."): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(message, zodIssuesToApiIssues(result.error));
  }
  return result.data;
}
