import { describe, expect, it } from "vitest";
import { UnreadableContentError } from "../../domain/extraction";
import { CsvExtractor } from "./CsvExtractor";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const signal = () => new AbortController().signal;

describe("CsvExtractor", () => {
  const extractor = new CsvExtractor();

  it("renders header and rows, flattening multi-line values and naming blank headers", async () => {
    const result = await extractor.extract(enc('name,,note\nAcme,1,"line one\nline two"\n'), signal());
    expect(result).toEqual({
      text: "Columns: name, column 2, note\nRow 1: name=Acme; column 2=1; note=line one line two",
      pageCount: null,
    });
  });

  it("skips rows where every cell is blank", async () => {
    const result = await extractor.extract(enc("a,b\n , \n1,2\n"), signal());
    expect(result.text).toBe("Columns: a, b\nRow 1: a=1; b=2");
  });

  it("returns empty text for header-only input", async () => {
    expect((await extractor.extract(enc("a,b"), signal())).text).toBe("");
  });

  it("rejects a blank header row", async () => {
    await expect(extractor.extract(enc(" , \n1,2\n"), signal())).rejects.toThrow("header row");
  });

  it("rejects inconsistent column counts", async () => {
    await expect(extractor.extract(enc("a,b\n1\n"), signal())).rejects.toBeInstanceOf(UnreadableContentError);
  });

  it("rejects invalid UTF-8", async () => {
    await expect(extractor.extract(new Uint8Array([0x61, 0x2c, 0xff]), signal())).rejects.toBeInstanceOf(
      UnreadableContentError,
    );
  });
});
