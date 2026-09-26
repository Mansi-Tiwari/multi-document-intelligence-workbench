import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema } from "@mdiw/shared";
import { errorHandler } from "./errorHandler";

describe("errorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps unexpected errors to a generic 500 without leaking details", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = express();
    app.get("/boom", () => {
      throw new Error("secret internal detail");
    });
    app.use(errorHandler);

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
    expect(consoleError).toHaveBeenCalled();
  });
});
