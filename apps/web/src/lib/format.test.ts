import { describe, expect, it } from "vitest";
import { formatBytes, formatCount, pluralize } from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [10 * 1024 * 1024, "10 MB"],
    [-1, "—"],
  ])("formats %d as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("formatCount / pluralize", () => {
  it("adds thousands separators and picks the right noun", () => {
    expect(formatCount(12345)).toBe("12,345");
    expect(pluralize(1, "page")).toBe("1 page");
    expect(pluralize(2, "page")).toBe("2 pages");
  });
});
