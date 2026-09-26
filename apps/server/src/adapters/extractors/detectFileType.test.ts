import { describe, expect, it } from "vitest";
import { detectFileType } from "./detectFileType";
import { textPdf } from "./testing/buildPdf";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("detectFileType", () => {
  it("detects PDF from bytes", async () => {
    expect(await detectFileType("a.pdf", textPdf("x"))).toEqual({ status: "detected", kind: "pdf", mimeType: "application/pdf" });
  });

  it("uses the extension for text candidates", async () => {
    expect(await detectFileType("a.txt", enc("x"))).toMatchObject({ kind: "text", mimeType: "text/plain" });
    expect(await detectFileType("a.md", enc("x"))).toMatchObject({ kind: "text", mimeType: "text/markdown" });
    expect(await detectFileType("a.csv", enc("x"))).toMatchObject({ kind: "csv", mimeType: "text/csv" });
  });

  it("rejects other binary formats even with an allowed extension", async () => {
    const result = await detectFileType("data.csv", ZIP_MAGIC);
    expect(result).toMatchObject({ status: "unsupported" });
    if (result.status === "unsupported") expect(result.detectedMimeType).not.toBeNull();
  });

  it("rejects a .pdf whose bytes are invalid UTF-8 and not PDF", async () => {
    expect(await detectFileType("x.pdf", new Uint8Array([0xc3, 0x28]))).toMatchObject({
      status: "unsupported",
      detectedMimeType: null,
    });
  });
});
