import { createHash } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ApiErrorSchema, UPLOAD_LIMITS, UploadDocumentsResponseSchema } from "@mdiw/shared";
import type { UploadLimits } from "@mdiw/shared";
import { noTextPdf, textPdf } from "../testing/fixtures";
import { buildTestApp } from "../testing/testApp";

const SMALL_LIMITS: UploadLimits = {
  ...UPLOAD_LIMITS,
  maxFiles: 3,
  maxFileBytes: 1024,
  hardMaxFileBytes: 4096,
  maxTextChars: 200,
};

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

describe("POST /api/documents", () => {
  it("gives each file its own status and stores only ok files", async () => {
    const { app, documents } = buildTestApp();
    const res = await request(app)
      .post("/api/documents")
      .attach("files", Buffer.from("Invoice total: $120\nDue: 2024-03-01\n"), "invoice.txt")
      .attach("files", Buffer.from("name,amount\nAcme,120\n"), "ledger.csv")
      .attach("files", Buffer.from(textPdf("Contract value 5000")), "contract.pdf")
      .attach("files", Buffer.from("   \n\n"), "blank.txt")
      .attach("files", PNG_BYTES, "photo.txt")
      .attach("files", Buffer.from([0xc3, 0x28, 0x41]), "broken.txt")
      .attach("files", Buffer.from(noTextPdf()), "scan.pdf")
      .attach("files", Buffer.from("hello"), "notes.docx");

    expect(res.status).toBe(201);
    const body = UploadDocumentsResponseSchema.parse(res.body);
    expect(body.results.map((r) => [r.filename, r.status])).toEqual([
      ["invoice.txt", "ok"],
      ["ledger.csv", "ok"],
      ["contract.pdf", "ok"],
      ["blank.txt", "empty"],
      ["photo.txt", "unsupported"],
      ["broken.txt", "unreadable"],
      ["scan.pdf", "empty"],
      ["notes.docx", "unsupported"],
    ]);
    expect(body.acceptedCount).toBe(3);
    expect(body.rejectedCount).toBe(5);

    const photo = body.results[4];
    expect(photo?.status === "unsupported" && photo.detectedMimeType).toBe("image/png");

    // Only ok files are persisted, with type detected from bytes.
    const stored = documents.list();
    expect(stored.map((d) => d.filename).sort()).toEqual(["contract.pdf", "invoice.txt", "ledger.csv"]);
    const pdf = stored.find((d) => d.filename === "contract.pdf");
    expect(pdf).toMatchObject({ kind: "pdf", mimeType: "application/pdf", pageCount: 1 });
  });

  it("stores the sha256 of the raw bytes and the full extracted text", async () => {
    const { app, documents } = buildTestApp();
    const bytes = Buffer.from("Licence No: D1234-5678\n");
    const res = await request(app).post("/api/documents").attach("files", bytes, "licence.txt");
    const body = UploadDocumentsResponseSchema.parse(res.body);
    const first = body.results[0];
    if (first?.status !== "ok") throw new Error("expected ok");
    expect(first.document.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(documents.findById(first.document.id)?.text).toBe("Licence No: D1234-5678");
  });

  it("returns 200 when no file was accepted", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/documents").attach("files", PNG_BYTES, "a.png");
    expect(res.status).toBe(200);
    expect(UploadDocumentsResponseSchema.parse(res.body).acceptedCount).toBe(0);
  });

  it("keeps UTF-8 filenames and strips path components", async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post("/api/documents")
      .attach("files", Buffer.from("x"), { filename: "../../résumé.txt", contentType: "text/plain" });
    const body = UploadDocumentsResponseSchema.parse(res.body);
    expect(body.results[0]?.filename).toBe("résumé.txt");
  });

  it("marks a file over the size limit too_large without failing the rest", async () => {
    const { app } = buildTestApp({ uploadLimits: SMALL_LIMITS });
    const res = await request(app)
      .post("/api/documents")
      .attach("files", Buffer.alloc(2000, "a"), "big.txt")
      .attach("files", Buffer.from("small"), "small.txt");
    const body = UploadDocumentsResponseSchema.parse(res.body);
    expect(body.results.map((r) => [r.status, r.sizeBytes])).toEqual([
      ["too_large", 2000],
      ["ok", 5],
    ]);
  });

  it("marks a file whose extracted text is too long too_large", async () => {
    const { app } = buildTestApp({ uploadLimits: SMALL_LIMITS });
    const res = await request(app).post("/api/documents").attach("files", Buffer.from("word ".repeat(100)), "long.txt");
    const body = UploadDocumentsResponseSchema.parse(res.body);
    expect(body.results[0]?.status).toBe("too_large");
  });

  it("rejects the whole request with 413 above the hard size cap", async () => {
    const { app } = buildTestApp({ uploadLimits: SMALL_LIMITS });
    const res = await request(app).post("/api/documents").attach("files", Buffer.alloc(5000, "a"), "huge.txt");
    expect(res.status).toBe(413);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects too many files with 400", async () => {
    const { app } = buildTestApp({ uploadLimits: SMALL_LIMITS });
    let req = request(app).post("/api/documents");
    for (let i = 0; i < 4; i++) req = req.attach("files", Buffer.from(`f${i}`), `f${i}.txt`);
    const res = await req;
    expect(res.status).toBe(400);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a request without files", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/api/documents").send({});
    expect(res.status).toBe(400);
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.issues?.[0]?.message).toMatch(/at least one file/);
  });

  it("rejects files sent in the wrong field and extra text fields", async () => {
    const { app } = buildTestApp();
    const wrongField = await request(app).post("/api/documents").attach("upload", Buffer.from("x"), "a.txt");
    expect(wrongField.status).toBe(400);
    const extraField = await request(app)
      .post("/api/documents")
      .field("note", "hi")
      .attach("files", Buffer.from("x"), "a.txt");
    expect(extraField.status).toBe(400);
  });

  it("returns 400 (not 500) for a malformed multipart body", async () => {
    const { app } = buildTestApp();
    const noBoundary = await request(app)
      .post("/api/documents")
      .set("Content-Type", "multipart/form-data")
      .send("garbage");
    expect(noBoundary.status).toBe(400);
    const truncated = await request(app)
      .post("/api/documents")
      .set("Content-Type", "multipart/form-data; boundary=XX")
      .send('--XX\r\nContent-Disposition: form-data; name="files"; filename="a.txt"\r\n\r\nabc');
    expect(truncated.status).toBe(400);
    expect(ApiErrorSchema.parse(truncated.body).error.code).toBe("VALIDATION_ERROR");
  });
});
