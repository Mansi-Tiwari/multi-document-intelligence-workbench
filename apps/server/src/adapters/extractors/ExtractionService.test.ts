import { describe, expect, it } from "vitest";
import type { ExtractedText, TextExtractor } from "../../ports/TextExtractor";
import { ExtractionService } from "./ExtractionService";
import { createDefaultExtractionService } from "./index";
import { noTextPdf, textPdf } from "./testing/buildPdf";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const BOM = [0xef, 0xbb, 0xbf];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52];

const service = createDefaultExtractionService({ timeoutMs: 5_000 });
const run = (filename: string, bytes: Uint8Array) => service.extract({ filename, bytes });

describe("ExtractionService outcomes", () => {
  it("extracts a .txt file", async () => {
    const outcome = await run("notes.txt", enc("Hello\r\nworld   \r\n\n"));
    expect(outcome).toEqual({
      status: "ok",
      kind: "text",
      mimeType: "text/plain",
      text: "Hello\nworld",
      charCount: 11,
      pageCount: null,
    });
  });

  it("extracts a .md file as text/markdown", async () => {
    const outcome = await run("README.MD", enc("# Title\n\nBody"));
    expect(outcome).toMatchObject({ status: "ok", kind: "text", mimeType: "text/markdown", text: "# Title\n\nBody" });
  });

  it("strips a UTF-8 BOM from text", async () => {
    const outcome = await run("bom.txt", new Uint8Array([...BOM, ...enc("Grüße")]));
    expect(outcome).toMatchObject({ status: "ok", text: "Grüße", charCount: 5 });
  });

  it("extracts a CSV as readable rows", async () => {
    const outcome = await run("invoices.csv", enc("name,amount\r\nAcme,42\r\n\r\n\"Beta, Inc\",7\r\n"));
    expect(outcome).toMatchObject({
      status: "ok",
      kind: "csv",
      mimeType: "text/csv",
      text: "Columns: name, amount\nRow 1: name=Acme; amount=42\nRow 2: name=Beta, Inc; amount=7",
      pageCount: null,
    });
  });

  it("handles a BOM in CSV (header name has no BOM)", async () => {
    const outcome = await run("bom.csv", new Uint8Array([...BOM, ...enc("id,total\n1,9\n")]));
    expect(outcome).toMatchObject({ status: "ok", text: "Columns: id, total\nRow 1: id=1; total=9" });
  });

  it("returns empty for whitespace-only text", async () => {
    expect(await run("blank.txt", enc("  \n\t\r\n "))).toMatchObject({ status: "empty", kind: "text", mimeType: "text/plain" });
  });

  it("returns empty for a zero-byte text file", async () => {
    expect(await run("zero.txt", new Uint8Array())).toMatchObject({ status: "empty", kind: "text" });
  });

  it("returns empty for a header-only CSV", async () => {
    expect(await run("header.csv", enc("name,amount\n"))).toMatchObject({ status: "empty", kind: "csv", mimeType: "text/csv" });
  });

  it("returns empty for a completely empty CSV", async () => {
    expect(await run("nothing.csv", enc(""))).toMatchObject({ status: "empty", kind: "csv" });
  });

  it("returns unreadable for a CSV with inconsistent column counts", async () => {
    const outcome = await run("bad.csv", enc("a,b\n1,2,3\n"));
    expect(outcome).toMatchObject({ status: "unreadable", kind: "csv" });
    if (outcome.status === "unreadable") expect(outcome.reason).toMatch(/different numbers of columns/);
  });

  it("returns unreadable for an unclosed CSV quote", async () => {
    expect(await run("quote.csv", enc('a,b\n"oops,2\n'))).toMatchObject({ status: "unreadable", kind: "csv" });
  });

  it("returns unreadable for invalid UTF-8", async () => {
    const outcome = await run("latin.txt", new Uint8Array([0x61, 0xc3, 0x28, 0x62]));
    expect(outcome).toEqual({ status: "unreadable", kind: "text", reason: "The file is not valid UTF-8 text." });
  });

  it("returns unreadable for a text file containing a NUL byte", async () => {
    expect(await run("nul.csv", new Uint8Array([...enc("a,b\n1"), 0, ...enc(",2\n")]))).toMatchObject({
      status: "unreadable",
      kind: "csv",
    });
  });

  it("returns unsupported for PNG bytes named .txt", async () => {
    expect(await run("image.txt", new Uint8Array(PNG_MAGIC))).toMatchObject({
      status: "unsupported",
      detectedMimeType: "image/png",
    });
  });

  it.each(["report.docx", "setup.exe", "noextension", "archive.tar.gz"])("returns unsupported for %s", async (name) => {
    expect(await run(name, enc("hello"))).toMatchObject({ status: "unsupported", detectedMimeType: null });
  });

  it("returns unsupported for a .pdf containing plain text", async () => {
    expect(await run("fake.pdf", enc("just some text"))).toMatchObject({
      status: "unsupported",
      detectedMimeType: "text/plain",
    });
  });

  it("returns unsupported for PDF bytes named .txt", async () => {
    expect(await run("real.txt", textPdf("Hi"))).toMatchObject({
      status: "unsupported",
      detectedMimeType: "application/pdf",
    });
  });

  it("returns unreadable for a truncated/corrupt PDF", async () => {
    const outcome = await run("broken.pdf", new Uint8Array([...enc("%PDF-1.4\n"), 0x13, 0x37, 0xff, 0x00, 0x42]));
    expect(outcome).toMatchObject({ status: "unreadable", kind: "pdf" });
  });

  it("extracts text from a real minimal PDF", async () => {
    const outcome = await run("invoice.pdf", textPdf("Hello invoice 42"));
    expect(outcome).toMatchObject({ status: "ok", kind: "pdf", mimeType: "application/pdf", pageCount: 1 });
    if (outcome.status === "ok") expect(outcome.text).toContain("Hello invoice 42");
  });

  it("returns empty for a PDF page with no text", async () => {
    expect(await run("scan.PDF", noTextPdf())).toMatchObject({ status: "empty", kind: "pdf", mimeType: "application/pdf" });
  });
});

describe("ExtractionService with fake extractors", () => {
  const never: TextExtractor = {
    kind: "text",
    extract: () => new Promise<ExtractedText>(() => undefined),
  };

  it("maps a timeout to unreadable", async () => {
    const svc = new ExtractionService({ extractors: [never], timeoutMs: 20 });
    const outcome = await svc.extract({ filename: "slow.txt", bytes: enc("hi") });
    expect(outcome).toEqual({ status: "unreadable", kind: "text", reason: "Reading the file took too long and was stopped." });
  });

  it("maps an unexpected extractor error to a generic unreadable reason (no internals)", async () => {
    const throwing: TextExtractor = {
      kind: "text",
      extract: () => Promise.reject(new Error("internal detail at /secret/path")),
    };
    const svc = new ExtractionService({ extractors: [throwing], timeoutMs: 1_000 });
    expect(await svc.extract({ filename: "x.txt", bytes: enc("hi") })).toEqual({
      status: "unreadable",
      kind: "text",
      reason: "The file could not be read.",
    });
  });

  it("returns unsupported when no extractor handles the kind", async () => {
    const svc = new ExtractionService({ extractors: [never], timeoutMs: 1_000 });
    expect(await svc.extract({ filename: "x.csv", bytes: enc("a\n1") })).toMatchObject({ status: "unsupported" });
  });

  it("validates constructor options", () => {
    expect(() => new ExtractionService({ extractors: [], timeoutMs: 0 })).toThrow(RangeError);
    expect(() => new ExtractionService({ extractors: [], timeoutMs: Number.NaN })).toThrow(RangeError);
    expect(() => new ExtractionService({ extractors: [never, never], timeoutMs: 10 })).toThrow(/Duplicate/);
  });
});
