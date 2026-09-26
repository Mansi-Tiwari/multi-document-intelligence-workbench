import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { getRequestId, requestIdMiddleware } from "./requestId";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const app = express();
app.use(requestIdMiddleware);
app.get("/id", (_req, res) => {
  res.json({ requestId: getRequestId(res) ?? null });
});

describe("requestIdMiddleware", () => {
  it("generates a UUID when the header is missing and exposes it to handlers", async () => {
    const res = await request(app).get("/id");
    const header = res.headers["x-request-id"];
    expect(header).toMatch(UUID);
    expect(res.body).toEqual({ requestId: header });
  });

  it("echoes a valid incoming id", async () => {
    const res = await request(app).get("/id").set("X-Request-Id", "abc.DEF_123-xyz");
    expect(res.headers["x-request-id"]).toBe("abc.DEF_123-xyz");
    expect(res.body).toEqual({ requestId: "abc.DEF_123-xyz" });
  });

  it.each(["has space", "a/b", "<script>", "x".repeat(129), "é"])("replaces an unsafe incoming id %s", async (id) => {
    const res = await request(app).get("/id").set("X-Request-Id", id);
    expect(res.headers["x-request-id"]).toMatch(UUID);
  });
});
