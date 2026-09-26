import { UPLOAD_LIMITS } from "@mdiw/shared";
import { describe, expect, it } from "vitest";
import { ACCEPT_ATTRIBUTE, checkFile, mergeFiles, validateSelection } from "./validateSelection";

const file = (name: string, size = 100, lastModified = 1) => ({ name, size, lastModified });

describe("checkFile", () => {
  it.each(["report.pdf", "notes.txt", "README.MD", "data.csv"])("accepts %s", (name) => {
    expect(checkFile(file(name))).toBeNull();
  });

  it("rejects unsupported and missing extensions", () => {
    expect(checkFile(file("photo.png"))).toMatch(/\.png files are not supported/);
    expect(checkFile(file("Makefile"))).toMatch(/need an extension/);
    expect(checkFile(file(".pdf"))).toMatch(/need an extension/);
  });

  it("rejects empty and oversized files", () => {
    expect(checkFile(file("a.txt", 0))).toBe("The file is empty.");
    expect(checkFile(file("a.txt", UPLOAD_LIMITS.maxFileBytes))).toBeNull();
    expect(checkFile(file("a.txt", UPLOAD_LIMITS.maxFileBytes + 1))).toMatch(/limit is 10 MB/);
  });

  it("rejects over-long file names", () => {
    expect(checkFile(file(`${"a".repeat(252)}.txt`))).toMatch(/1–255 characters/);
  });
});

describe("validateSelection", () => {
  it("splits files into accepted and rejected", () => {
    const result = validateSelection([file("a.pdf"), file("b.exe"), file("c.csv", 0)]);
    expect(result.accepted.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(result.rejected.map((r) => r.file.name)).toEqual(["b.exe", "c.csv"]);
    expect(result.batchError).toBeNull();
    expect(result.canUpload).toBe(true);
  });

  it("cannot upload when nothing is acceptable", () => {
    expect(validateSelection([]).canUpload).toBe(false);
    expect(validateSelection([file("x.docx")]).canUpload).toBe(false);
  });

  it("blocks batches with more than the maximum number of acceptable files", () => {
    const files = Array.from({ length: UPLOAD_LIMITS.maxFiles + 2 }, (_, i) => file(`f${i}.txt`));
    const result = validateSelection(files);
    expect(result.batchError).toMatch(/at most 10 files.*Remove 2 files/);
    expect(result.canUpload).toBe(false);
  });

  it("does not count rejected files toward the maximum", () => {
    const files = [
      ...Array.from({ length: UPLOAD_LIMITS.maxFiles }, (_, i) => file(`f${i}.txt`)),
      file("extra.png"),
    ];
    expect(validateSelection(files).canUpload).toBe(true);
  });
});

describe("mergeFiles", () => {
  it("appends new files and skips duplicates", () => {
    const merged = mergeFiles([file("a.txt")], [file("a.txt"), file("a.txt", 100, 2), file("b.txt")]);
    expect(merged.map((f) => `${f.name}@${f.lastModified}`)).toEqual(["a.txt@1", "a.txt@2", "b.txt@1"]);
  });
});

it("builds the accept attribute from the shared extensions", () => {
  expect(ACCEPT_ATTRIBUTE).toBe(".pdf,.txt,.md,.csv");
});
