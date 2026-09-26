import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNSUPPORTED_FILE",
  "FILE_TOO_LARGE",
  "EXTRACTION_FAILED",
  "NOT_FOUND",
  "LLM_ERROR",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ApiErrorIssue = z.infer<typeof ApiErrorIssueSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    issues: z.array(ApiErrorIssueSchema).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
