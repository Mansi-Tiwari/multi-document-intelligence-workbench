import request from "supertest";
import { describe, expect, it } from "vitest";
import { ApiErrorSchema, AnalysisSummarySchema } from "@mdiw/shared";
import { z } from "zod";
import { uploadSamples } from "../testing/samples";
import { buildTestApp } from "../testing/testApp";

const ID = "9b2e6c1a-3d4f-4a5b-8c7d-0e1f2a3b4c5d";

describe("/api/analyses", () => {
  it.each([
    ["missing body", undefined],
    ["short instruction", { instruction: "hi", documentIds: [ID] }],
    ["no documents", { instruction: "Compare names", documentIds: [] }],
    ["duplicate ids", { instruction: "Compare names", documentIds: [ID, ID] }],
    ["non-uuid id", { instruction: "Compare names", documentIds: ["abc"] }],
    ["too many ids", { instruction: "Compare names", documentIds: Array.from({ length: 11 }, () => crypto.randomUUID()) }],
  ])("POST rejects %s with 400", async (_label, payload) => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/analyses").send(payload);
    expect(res.status).toBe(400);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.issues?.length).toBeGreaterThan(0);
  });

  it("GET /:id returns 400 for a malformed id and 404 for an unknown one", async () => {
    const { app } = buildTestApp();
    expect((await request(app).get("/api/analyses/not-a-uuid")).status).toBe(400);
    const missing = await request(app).get(`/api/analyses/${ID}`);
    expect(missing.status).toBe(404);
    expect(ApiErrorSchema.parse(missing.body).error.code).toBe("NOT_FOUND");
  });

  it("GET / lists saved analyses newest first", async () => {
    const { app } = buildTestApp();
    const ids = await uploadSamples(app);
    for (const instruction of ["Compare names", "Compare emails"]) {
      const res = await request(app).post("/api/analyses").send({ instruction, documentIds: Object.values(ids) });
      expect(res.status).toBe(201);
    }
    const res = await request(app).get("/api/analyses");
    const { analyses } = z.object({ analyses: z.array(AnalysisSummarySchema) }).parse(res.body);
    expect(analyses.map((a) => [a.instruction, a.documentCount])).toEqual([
      ["Compare emails", 3],
      ["Compare names", 3],
    ]);
  });
});
