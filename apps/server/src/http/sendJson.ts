import type { Response } from "express";
import type { z } from "zod";

/**
 * Validates `data` against the response schema before sending it, so the API
 * contract is enforced server-side. A failing parse is a server bug: the ZodError
 * propagates and the error handler turns it into a 500.
 */
export function sendJson<S extends z.ZodType>(res: Response, status: number, schema: S, data: z.input<S>): void {
  const body = schema.parse(data);
  res.status(status).json(body);
}
