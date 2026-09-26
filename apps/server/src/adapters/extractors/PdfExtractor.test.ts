import { describe, expect, it } from "vitest";
import { UnreadableContentError } from "../../domain/extraction";
import { PdfExtractor } from "./PdfExtractor";
import { noTextPdf, textPdf } from "./testing/buildPdf";

const signal = () => new AbortController().signal;

describe("PdfExtractor", () => {
  const extractor = new PdfExtractor();

  it("extracts text and page count", async () => {
    const result = await extractor.extract(textPdf("Hello invoice 42"), signal());
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain("Hello invoice 42");
  });

  it("does not detach the caller's buffer", async () => {
    const bytes = textPdf("Hi");
    await extractor.extract(bytes, signal());
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("returns blank text for a page without text", async () => {
    const result = await extractor.extract(noTextPdf(), signal());
    expect(result.text.trim()).toBe("");
    expect(result.pageCount).toBe(1);
  });

  it("throws UnreadableContentError for corrupt bytes", async () => {
    await expect(extractor.extract(new TextEncoder().encode("%PDF-1.4\n garbage"), signal())).rejects.toBeInstanceOf(
      UnreadableContentError,
    );
  });

  it("rejects immediately when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(extractor.extract(textPdf("x"), controller.signal)).rejects.toThrow();
  });
});
