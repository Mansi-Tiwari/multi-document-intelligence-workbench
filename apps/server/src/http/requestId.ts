import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

export const REQUEST_ID_HEADER = "X-Request-Id";

/** Incoming ids are only trusted when they are short and log-safe. */
export const RequestIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);

const REQUEST_ID_LOCAL = "requestId";

/** Uses a valid incoming `X-Request-Id`, otherwise generates one; echoes it on the response. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = RequestIdSchema.safeParse(req.get(REQUEST_ID_HEADER));
  const requestId = incoming.success ? incoming.data : randomUUID();
  res.locals[REQUEST_ID_LOCAL] = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

/** Reads the request id set by `requestIdMiddleware` (validated, never trusted blindly). */
export function getRequestId(res: Response): string | undefined {
  const result = RequestIdSchema.safeParse(res.locals[REQUEST_ID_LOCAL]);
  return result.success ? result.data : undefined;
}
