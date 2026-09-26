import request from "supertest";
import { describe, expect, it } from "vitest";
import { ApiErrorSchema, HealthResponseSchema } from "@mdiw/shared";
import { createApp } from "./app";

describe("createApp", () => {
  const app = createApp();

  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ status: "ok" });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("unknown routes return a JSON 404", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe("NOT_FOUND");
  });

  it("malformed JSON returns 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/health").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("oversized JSON body returns 413 FILE_TOO_LARGE", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "x".repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe("FILE_TOO_LARGE");
  });
});
