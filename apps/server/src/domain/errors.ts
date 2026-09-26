import type { z } from "zod";
import type { ApiErrorIssue, ErrorCode } from "@mdiw/shared";

/** Single source of truth for the HTTP status of every error code. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  NOTHING_TO_ANALYZE: 422,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE: 415,
  EXTRACTION_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  LLM_ERROR: 502,
};

export type AppErrorOptions = {
  issues?: ApiErrorIssue[];
  cause?: unknown;
};

/**
 * An expected, typed application error. Its `message` is client-facing by contract;
 * internal details belong in `cause`, which is only logged, never sent.
 */
export class AppError extends Error {
  override readonly name: string = "AppError";
  readonly code: ErrorCode;
  readonly status: number;
  readonly issues?: ApiErrorIssue[];

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (options.issues !== undefined) {
      this.issues = options.issues;
    }
  }
}

export class ValidationError extends AppError {
  override readonly name = "ValidationError";
  constructor(message: string, issues: ApiErrorIssue[] = [], cause?: unknown) {
    super("VALIDATION_ERROR", message, { issues, cause });
  }
}

export class NotFoundError extends AppError {
  override readonly name = "NotFoundError";
  constructor(message: string) {
    super("NOT_FOUND", message);
  }
}

export class UnsupportedFileError extends AppError {
  override readonly name = "UnsupportedFileError";
  constructor(message: string, issues?: ApiErrorIssue[]) {
    super("UNSUPPORTED_FILE", message, issues === undefined ? {} : { issues });
  }
}

export class FileTooLargeError extends AppError {
  override readonly name = "FileTooLargeError";
  constructor(message: string) {
    super("FILE_TOO_LARGE", message);
  }
}

export class ExtractionError extends AppError {
  override readonly name = "ExtractionError";
  constructor(message: string, cause?: unknown) {
    super("EXTRACTION_FAILED", message, { cause });
  }
}

export class LlmError extends AppError {
  override readonly name = "LlmError";
  constructor(message: string, cause?: unknown) {
    super("LLM_ERROR", message, { cause });
  }
}

/** Every requested document was skipped; `issues` say why for each one. */
export class NothingToAnalyzeError extends AppError {
  override readonly name = "NothingToAnalyzeError";
  constructor(message: string, issues: ApiErrorIssue[]) {
    super("NOTHING_TO_ANALYZE", message, { issues });
  }
}

export class RateLimitedError extends AppError {
  override readonly name = "RateLimitedError";
  constructor(message = "Too many requests, please try again later.") {
    super("RATE_LIMITED", message);
  }
}

/** Converts Zod issues to API issues; the path is joined with "." (empty for the root). */
export function zodIssuesToApiIssues(error: z.ZodError): ApiErrorIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
