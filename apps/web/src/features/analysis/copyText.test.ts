import { describe, expect, it } from "vitest";
import { must } from "../../test/must";
import { analysisFixture } from "./__fixtures__/analysis";
import { summarizeAnalysis } from "@mdiw/shared";
import { comparisonToMarkdown, factsToText, findingToText, overviewToText } from "./copyText";
import { filenameLookup, groupFindings } from "./findings";

const filenameOf = filenameLookup(analysisFixture);
const grouped = groupFindings(analysisFixture);

describe("findingToText", () => {
  it("includes title, basis, values, filenames and quotes", () => {
    expect(findingToText(must(grouped.discrepancies[0]), filenameOf)).toBe(
      [
        "Total amount differs between documents [Fact]",
        "2 different values across 2 documents.",
        "- invoice-a.pdf: $100",
        '  "Total: $100"',
        "- invoice-b.txt: $120",
        '  "Total: $120"',
      ].join("\n"),
    );
  });

  it("lists sources without values for missing info", () => {
    expect(findingToText(must(grouped.missing[0]), filenameOf)).toBe(
      ["Due date is missing from 2 of 3 documents [AI]", "- invoice-b.txt", "- notes.md"].join("\n"),
    );
  });
});

describe("tab copy text", () => {
  it("groups facts under document headings", () => {
    const text = factsToText(grouped.factsByDocument, filenameOf);
    expect(text).toContain("## invoice-a.pdf\n\nTotal amount [Fact]");
    expect(text).toContain("## notes.md\n\nBudget was discussed [AI]");
  });

  it("copies the summary in the same order as the tab: answer first, then documents", () => {
    const text = overviewToText(analysisFixture.instruction, summarizeAnalysis(analysisFixture));
    expect(text.startsWith("Instruction: Compare total amount and due date\n\nAt a glance: Compared 3 documents")).toBe(true);
    expect(text).toContain("Key document [AI]: invoice-a.pdf");
    expect(text).toContain("invoice-b.txt (medium relevance,");
    expect(text).toContain("Invoice B | revised.");
  });

  it("renders the comparison as a Markdown table with escaped cells", () => {
    const withPipe = [{ ...must(grouped.comparison[0]), title: "Total | amount" }, must(grouped.comparison[1])];
    expect(comparisonToMarkdown(analysisFixture, withPipe)).toBe(
      [
        "| Field | invoice-a.pdf | invoice-b.txt | notes.md | Status |",
        "| --- | --- | --- | --- | --- |",
        "| Total \\| amount | $100 | $120 | — | discrepancy |",
        "| Due date | 2026-02-01 | — | — | partial |",
      ].join("\n"),
    );
  });
});
