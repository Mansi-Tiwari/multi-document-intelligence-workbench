import request from "supertest";
import { describe, expect, it } from "vitest";
import { ApiErrorSchema, HealthResponseSchema } from "@mdiw/shared";
import type { AppOptions } from "./app";
import { TEST_ORIGIN, buildTestApp } from "./testing/testApp";

const ALLOWED_ORIGIN = TEST_ORIGIN;

function testApp(overrides: Partial<Omit<AppOptions, "services">> = {}) {
  return buildTestApp(overrides).app;
}

describe("createApp", () => {
  const app = testApp();

  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ status: "ok" });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("unknown routes return a JSON 404 with the request id", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(res.headers["x-request-id"]);
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

  describe("request id", () => {
    it("is generated when missing and echoed when valid", async () => {
      const generated = await request(app).get("/api/health");
      expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

      const echoed = await request(app).get("/api/health").set("X-Request-Id", "client-id-1");
      expect(echoed.headers["x-request-id"]).toBe("client-id-1");
    });

    it("replaces an invalid incoming id", async () => {
      const res = await request(app).get("/api/health").set("X-Request-Id", "bad id!");
      expect(res.headers["x-request-id"]).not.toBe("bad id!");
      expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("security headers", () => {
    it("sets helmet headers", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBeDefined();
    });
  });

  describe("CORS", () => {
    it("allows a listed origin and exposes X-Request-Id", async () => {
      const res = await request(app).get("/api/health").set("Origin", ALLOWED_ORIGIN);
      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
      expect(res.headers["access-control-expose-headers"]).toMatch(/X-Request-Id/i);
    });

    it("answers a preflight for a listed origin", async () => {
      const res = await request(app)
        .options("/api/health")
        .set("Origin", ALLOWED_ORIGIN)
        .set("Access-Control-Request-Method", "POST");
      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    });

    it("sends no CORS headers to a disallowed origin (and no 500)", async () => {
      const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("allows requests without an Origin header", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 RATE_LIMITED with a request id after exceeding the limit", async () => {
      const limited = testApp({ rateLimit: { windowMs: 60_000, max: 2 } });

      for (let i = 0; i < 2; i += 1) {
        const ok = await request(limited).get("/api/nope");
        expect(ok.status).toBe(404);
      }
      const res = await request(limited).get("/api/nope");

      expect(res.status).toBe(429);
      const body = ApiErrorSchema.parse(res.body);
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.requestId).toBe(res.headers["x-request-id"]);
      expect(res.headers["ratelimit-policy"]).toBeDefined();
      expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
    });

    it("does not limit the health check", async () => {
      const limited = testApp({ rateLimit: { windowMs: 60_000, max: 1 } });
      for (let i = 0; i < 3; i += 1) {
        const res = await request(limited).get("/api/health");
        expect(res.status).toBe(200);
      }
    });
  });
});
