import { AnalysisSchema, CreateAnalysisResponseSchema } from "@mdiw/shared";
import { must } from "../../test/must";
import { describe, expect, it } from "vitest";
import { DOC_A, DOC_B, DOC_C, analysisFixture, responseFixture } from "./__fixtures__/analysis";
import {
  basisOf,
  comparisonStatus,
  filenameLookup,
  groupFindings,
  relevancePercent,
  skippedLabel,
  tabCounts,
} from "./findings";

describe("fixture", () => {
  it("is valid against the shared schemas", () => {
    expect(AnalysisSchema.safeParse(analysisFixture).success).toBe(true);
    expect(CreateAnalysisResponseSchema.safeParse(responseFixture).success).toBe(true);
  });
});

describe("groupFindings", () => {
  const grouped = groupFindings(analysisFixture);

  it("routes each finding kind to its tab", () => {
    expect(grouped.keyDocument?.kind).toBe("key_document");
    expect(grouped.comparison.map((f) => f.fieldKey)).toEqual(["total_amount", "due_date"]);
    expect(grouped.discrepancies).toHaveLength(1);
    expect(grouped.missing).toHaveLength(1);
  });

  it("groups key facts and field values by document in document order", () => {
    expect(grouped.factsByDocument.map((g) => [g.document.documentId, g.findings.map((f) => f.title)])).toEqual([
      [DOC_A, ["Total amount", "Signed by Alice"]],
      [DOC_B, ["Total amount"]],
      [DOC_C, ["Budget was discussed"]],
    ]);
  });

  it("counts findings per tab", () => {
    expect(tabCounts(analysisFixture, grouped)).toEqual({
      summary: 3,
      comparison: 2,
      discrepancies: 1,
      missing: 1,
      facts: 4,
    });
  });

  it("handles an analysis without a key document", () => {
    const withoutKey = { ...analysisFixture, findings: analysisFixture.findings.filter((f) => f.kind !== "key_document") };
    expect(groupFindings(withoutKey).keyDocument).toBeNull();
  });
});

describe("helpers", () => {
  it("looks up filenames and falls back to the id", () => {
    const filenameOf = filenameLookup(analysisFixture);
    expect(filenameOf(DOC_B)).toBe("invoice-b.txt");
    expect(filenameOf("unknown")).toBe("unknown");
  });

  it("labels skipped documents by filename or id", () => {
    const skipped = must(responseFixture.skipped[0]);
    expect(skippedLabel(skipped)).toBe(skipped.documentId);
    expect(skippedLabel({ ...skipped, filename: "x.pdf" })).toBe("x.pdf");
  });

  it("labels findings Fact or AI using the shared rule", () => {
    const [fieldValue, , , unquotedFact] = analysisFixture.findings;
    expect(basisOf(must(fieldValue)).label).toBe("Fact");
    expect(basisOf(must(unquotedFact)).label).toBe("AI");
    expect(basisOf(must(groupFindings(analysisFixture).keyDocument)).description).toMatch(/model judgement/);
  });

  it("reads comparison statuses and clamps relevance", () => {
    const [total, due] = groupFindings(analysisFixture).comparison;
    expect(comparisonStatus(must(total))).toBe("discrepancy");
    expect(comparisonStatus(must(due))).toBe("partial");
    expect(comparisonStatus({ ...must(total), detail: "weird" })).toBeNull();
    expect(relevancePercent(0.456)).toBe(46);
    expect(relevancePercent(2)).toBe(100);
  });
});
