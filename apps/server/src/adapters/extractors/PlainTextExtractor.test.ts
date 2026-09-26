import { describe, expect, it } from "vitest";
import { UnreadableContentError } from "../../domain/extraction";
import { PlainTextExtractor } from "./PlainTextExtractor";

const signal = () => new AbortController().signal;

describe("PlainTextExtractor", () => {
  const extractor = new PlainTextExtractor();

  it("decodes UTF-8 and strips the BOM", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("héllo")]);
    expect(await extractor.extract(bytes, signal())).toEqual({ text: "héllo", pageCount: null });
  });

  it("rejects invalid UTF-8 and NUL bytes", async () => {
    await expect(extractor.extract(new Uint8Array([0xc3, 0x28]), signal())).rejects.toBeInstanceOf(UnreadableContentError);
    await expect(extractor.extract(new Uint8Array([0x61, 0x00]), signal())).rejects.toBeInstanceOf(UnreadableContentError);
  });
});
