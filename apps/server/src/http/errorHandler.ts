import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { ApiErrorSchema } from "@mdiw/shared";
import type { ApiError, ApiErrorIssue, ErrorCode } from "@mdiw/shared";
import { AppError, ERROR_STATUS, NotFoundError } from "../domain/errors";
import { getRequestId } from "./requestId";
import { sendJson } from "./sendJson";

type HttpError = { status: number; code: ErrorCode; message: string; issues?: ApiErrorIssue[] };

const INTERNAL_ERROR: HttpError = {
  status: ERROR_STATUS.INTERNAL_ERROR,
  code: "INTERNAL_ERROR",
  message: "An unexpected error occurred.",
};

/** Shape of the errors thrown by express.json() (body-parser) that we map explicitly. */
const BodyParserErrorSchema = z.object({
  type: z.enum(["entity.parse.failed", "entity.too.large"]),
});

/**
 * Maps a known error to an HTTP error, or returns undefined for unexpected ones.
 * A bare ZodError is deliberately NOT mapped: input validation goes through
 * `parseInput` (which throws ValidationError), so a raw ZodError means a response
 * failed its schema in `sendJson` — a server bug, hence a 500.
 */
function toHttpError(err: unknown): HttpError | undefined {
  if (err instanceof AppError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      ...(err.issues === undefined ? {} : { issues: err.issues }),
    };
  }

  if (err instanceof multer.MulterError) {
    return multerToHttpError(err);
  }

  const bodyParserError = BodyParserErrorSchema.safeParse(err);
  if (bodyParserError.success) {
    switch (bodyParserError.data.type) {
      case "entity.parse.failed":
        return { status: 400, code: "VALIDATION_ERROR", message: "Request body is not valid JSON." };
      case "entity.too.large":
        return { status: 413, code: "FILE_TOO_LARGE", message: "Request body is too large." };
    }
  }

  return undefined;
}

/** Request-level upload failures (per-file problems get their own status instead). */
function multerToHttpError(err: multer.MulterError): HttpError {
  switch (err.code) {
    case "LIMIT_FILE_SIZE":
      return { status: 413, code: "FILE_TOO_LARGE", message: "A file exceeds the maximum upload size." };
    case "LIMIT_FILE_COUNT":
    case "LIMIT_PART_COUNT":
      return { status: 400, code: "VALIDATION_ERROR", message: "Too many files in one upload." };
    case "LIMIT_UNEXPECTED_FILE":
      return {
        status: 400,
        code: "VALIDATION_ERROR",
        message: `Unexpected file field '${err.field ?? ""}' or too many files; use the 'files' field.`,
      };
    case "LIMIT_FIELD_COUNT":
    case "LIMIT_FIELD_KEY":
    case "LIMIT_FIELD_VALUE":
      return { status: 400, code: "VALIDATION_ERROR", message: "Only file fields are accepted in an upload." };
    default:
      return { status: 400, code: "VALIDATION_ERROR", message: "The upload was rejected." };
  }
}

/** Forwards unmatched routes to the error handler as a NotFoundError. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found.`));
}

/**
 * The single place where errors become HTTP responses. Never sends stack traces,
 * causes or internal messages; unexpected errors are logged with the request id.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = getRequestId(res);
  const known = toHttpError(err);
  const httpError = known ?? INTERNAL_ERROR;

  if (!known) {
    const kind = err instanceof z.ZodError ? "Response validation failed" : "Unhandled error";
    console.error(`[${requestId ?? "-"}] ${kind} on ${req.method} ${req.originalUrl}:`, err);
  } else if (httpError.status >= 500) {
    console.error(`[${requestId ?? "-"}] ${httpError.code} on ${req.method} ${req.originalUrl}:`, err);
  }

  const body: ApiError = {
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.issues === undefined ? {} : { issues: httpError.issues }),
      ...(requestId === undefined ? {} : { requestId }),
    },
  };
  sendJson(res, httpError.status, ApiErrorSchema, body);
}
