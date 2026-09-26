import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiErrorSchema } from "@mdiw/shared";
import type { ApiError, ErrorCode } from "@mdiw/shared";
import { sendJson } from "./sendJson";

type HttpError = { status: number; body: ApiError };

function httpError(status: number, code: ErrorCode, message: string): HttpError {
  return { status, body: { error: { code, message } } };
}

/** Shape of the errors thrown by express.json() (body-parser) that we map explicitly. */
const BodyParserErrorSchema = z.object({
  type: z.enum(["entity.parse.failed", "entity.too.large"]),
});

/** Maps a known error to an HTTP response, or returns undefined for unexpected errors. */
function toHttpError(err: unknown): HttpError | undefined {
  // Future domain errors (NotFoundError, ValidationError, UnsupportedFileError,
  // ExtractionError, LlmError) are mapped here with `instanceof` checks.

  const bodyParserError = BodyParserErrorSchema.safeParse(err);
  if (bodyParserError.success) {
    switch (bodyParserError.data.type) {
      case "entity.parse.failed":
        return httpError(400, "VALIDATION_ERROR", "Request body is not valid JSON.");
      case "entity.too.large":
        return httpError(413, "FILE_TOO_LARGE", "Request body is too large.");
    }
  }

  return undefined;
}

export function notFoundHandler(req: Request, res: Response): void {
  sendJson(res, 404, ApiErrorSchema, {
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found.` },
  });
}

/** Central Express error middleware. Never leaks stack traces or internal messages to clients. */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const known = toHttpError(err);
  if (known) {
    sendJson(res, known.status, ApiErrorSchema, known.body);
    return;
  }

  console.error("Unhandled error:", err);
  sendJson(res, 500, ApiErrorSchema, {
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
}
