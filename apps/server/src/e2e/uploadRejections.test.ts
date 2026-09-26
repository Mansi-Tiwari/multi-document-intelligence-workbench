/**
 * Rejected uploads end to end: bad files get their own status and reason, good ones
 * in the same batch are stored, and rejected files can never be analysed.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ApiErrorSchema, CreateAnalysisResponseSchema, UPLOAD_LIMITS } from "@mdiw/shared";
import { noTextPdf } from "../testing/fixtures";
import { loadSample, uploadFiles } from "../testing/samples";
import { buildTestApp } from "../testing/testApp";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("upload rejections", () => {
  it("rejects each bad file with its own reason while storing the good one", async () => {
    const { app, documents } = buildTestApp({
      uploadLimits: { ...UPLOAD_LIMITS, maxFileBytes: 4096 },
    });
    const body = await uploadFiles(app, [
      { name: "application-form.txt", bytes: loadSample("application-form.txt") },
      { name: "corrupt.pdf", bytes: loadSample("corrupt.pdf") }, // PDF header, garbage body
      { name: "fake.pdf", bytes: loadSample("application-form.txt") }, // text pretending to be a PDF
      { name: "photo.txt", bytes: PNG }, // image pretending to be text
      { name: "report.docx", bytes: ZIP }, // extension not allowed
      { name: "archive.csv", bytes: ZIP }, // zip bytes behind an allowed extension
      { name: "scan.pdf", bytes: noTextPdf() }, // no text layer, OCR is out of scope
      { name: "blank.md", bytes: Buffer.from(" \n\t\n") },
      { name: "latin1.txt", bytes: Buffer.from([0x63, 0x61, 0x66, 0xe9]) }, // not UTF-8
      { name: "big.txt", bytes: Buffer.alloc(5000, "a") },
    ]);

    expect(body.results.map((r) => [r.filename, r.status])).toEqual([
      ["application-form.txt", "ok"],
      ["corrupt.pdf", "unreadable"],
      ["fake.pdf", "unsupported"],
      ["photo.txt", "unsupported"],
      ["report.docx", "unsupported"],
      ["archive.csv", "unsupported"],
      ["scan.pdf", "empty"],
      ["blank.md", "empty"],
      ["latin1.txt", "unreadable"],
      ["big.txt", "too_large"],
    ]);
    for (const r of body.results) {
      if (r.status !== "ok") expect(r.reason.length).toBeGreaterThan(10);
    }
    expect(body).toMatchObject({ acceptedCount: 1, rejectedCount: 9 });
    expect(documents.list().map((d) => d.filename)).toEqual(["application-form.txt"]);
  });

  it("skips ids of rejected or unknown files and analyses the rest", async () => {
    const { app } = buildTestApp();
    const body = await uploadFiles(app, [
      { name: "application-form.txt", bytes: loadSample("application-form.txt") },
      { name: "corrupt.pdf", bytes: loadSample("corrupt.pdf") },
    ]);
    const ok = body.results[0];
    if (ok?.status !== "ok") throw new Error("expected ok");
    const unknownId = "9b2e6c1a-3d4f-4a5b-8c7d-0e1f2a3b4c5d";

    const res = await request(app)
      .post("/api/analyses")
      .send({ instruction: "Find the name and email", documentIds: [unknownId, ok.document.id] });
    expect(res.status).toBe(201);
    const analysis = CreateAnalysisResponseSchema.parse(res.body);
    expect(analysis.analysis.documents.map((d) => d.documentId)).toEqual([ok.document.id]);
    expect(analysis.skipped).toEqual([
      expect.objectContaining({ documentId: unknownId, reason: "not_found", filename: null }),
    ]);
  });

  it("returns 422 NOTHING_TO_ANALYZE when every selected document is skipped", async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post("/api/analyses")
      .send({ instruction: "Find the total amount", documentIds: ["9b2e6c1a-3d4f-4a5b-8c7d-0e1f2a3b4c5d"] });
    expect(res.status).toBe(422);
    const error = ApiErrorSchema.parse(res.body).error;
    expect(error.code).toBe("NOTHING_TO_ANALYZE");
    expect(error.issues).toHaveLength(1);
  });
});
