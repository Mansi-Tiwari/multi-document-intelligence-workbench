import { describe, expect, it } from "vitest";
import { allowedExtension, fileExtension, hasMeaningfulText, normalizeExtractedText } from "./extraction";

describe("extraction domain helpers", () => {
  it("parses extensions case-insensitively", () => {
    expect(fileExtension("A.PDF")).toBe(".pdf");
    expect(fileExtension("dir/x.tar.gz")).toBe(".gz");
    expect(fileExtension(".env")).toBeNull();
    expect(fileExtension("noext")).toBeNull();
    expect(fileExtension("trailing.")).toBeNull();
  });

  it("maps allowed extensions and rejects others (including prototype keys)", () => {
    expect(allowedExtension("a.md")).toEqual({ kind: "text", mimeType: "text/markdown" });
    expect(allowedExtension("a.csv")).toEqual({ kind: "csv", mimeType: "text/csv" });
    expect(allowedExtension("a.docx")).toBeNull();
    expect(allowedExtension("a.constructor")).toBeNull();
  });

  it("normalizes line endings and trailing whitespace", () => {
    expect(normalizeExtractedText("a  \r\nb\rc\t\n\n  ")).toBe("a\nb\nc");
    expect(normalizeExtractedText("  indented")).toBe("  indented");
  });

  it("detects meaningful text", () => {
    expect(hasMeaningfulText(" \n\t")).toBe(false);
    expect(hasMeaningfulText(" x ")).toBe(true);
  });
});
