import express from "express";
import type { Express, RequestHandler } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiErrorSchema } from "@mdiw/shared";
import {
  ExtractionError,
  FileTooLargeError,
  LlmError,
  NotFoundError,
  UnsupportedFileError,
  ValidationError,
} from "../domain/errors";
import { errorHandler, notFoundHandler } from "./errorHandler";
import { requestIdMiddleware } from "./requestId";
import { sendJson } from "./sendJson";

function appThrowing(handler: RequestHandler): Express {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/boom", handler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps unexpected errors to a generic 500 without leaking details, logged with the request id", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = appThrowing(() => {
      throw new Error("secret internal detail");
    });

    const res = await request(app).get("/boom").set("X-Request-Id", "req-500");

    expect(res.status).toBe(500);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId: "req-500",
    });
    expect(res.text).not.toContain("secret internal detail");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("req-500"), expect.any(Error));
  });

  it.each([
    [new NotFoundError("Document not found."), 404, "NOT_FOUND"],
    [new UnsupportedFileError("Only PDF, text and CSV are supported."), 415, "UNSUPPORTED_FILE"],
    [new FileTooLargeError("File exceeds 10 MB."), 413, "FILE_TOO_LARGE"],
    [new ExtractionError("PDF has no text layer.", new Error("parser internals")), 422, "EXTRACTION_FAILED"],
    [new LlmError("The language model failed.", new Error("upstream secret")), 502, "LLM_ERROR"],
  ])("maps %s to its status and code", async (error, status, code) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = appThrowing(() => {
      throw error;
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(status);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error.code).toBe(code);
    expect(body.error.message).toBe(error.message);
    expect(body.error.requestId).toBe(res.headers["x-request-id"]);
    expect(res.text).not.toMatch(/internals|secret|stack/);
  });

  it("includes issues for a ValidationError", async () => {
    const issues = [{ path: "documentIds.0", message: "Invalid UUID" }];
    const app = appThrowing(() => {
      throw new ValidationError("Invalid request.", issues);
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(400);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.issues).toEqual(issues);
  });

  it("treats a response that fails its schema as a 500 (server bug)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = appThrowing((_req, res) => {
      sendJson(res, 200, z.object({ n: z.number() }), { n: Number.NaN });
    });

    const failed = await request(app).get("/boom");
    expect(failed.status).toBe(500);
    expect(ApiErrorSchema.parse(failed.body).error.code).toBe("INTERNAL_ERROR");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Response validation failed"), expect.any(z.ZodError));
  });

  it("routes unknown paths through the same handler as NOT_FOUND", async () => {
    const res = await request(appThrowing(() => undefined)).get("/missing");
    expect(res.status).toBe(404);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(res.headers["x-request-id"]);
  });
});
