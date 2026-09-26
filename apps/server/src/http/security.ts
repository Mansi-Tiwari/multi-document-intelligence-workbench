import cors from "cors";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { RateLimitedError } from "../domain/errors";
import { REQUEST_ID_HEADER } from "./requestId";

export type CorsOptions = {
  /** Exact origins allowed to call the API from a browser. */
  origins: readonly string[];
};

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  /** Paths (relative to the mount point) that are never limited. */
  skipPaths?: readonly string[];
};

/**
 * Allow-list CORS. Requests without an Origin header (curl, same-origin) pass;
 * a disallowed origin simply gets no CORS headers, so the browser blocks it.
 */
export function corsMiddleware(options: CorsOptions): RequestHandler {
  return cors({
    origin: [...options.origins],
    exposedHeaders: [REQUEST_ID_HEADER],
  });
}

/** Rate limiter whose 429 goes through the central error handler (RATE_LIMITED). */
export function rateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const skipPaths = new Set(options.skipPaths ?? []);
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => skipPaths.has(req.path),
    handler: (_req, _res, next) => {
      next(new RateLimitedError());
    },
  });
}
