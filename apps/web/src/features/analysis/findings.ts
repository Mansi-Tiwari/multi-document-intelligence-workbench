import { findingBasis } from "@mdiw/shared";
import type { Analysis, AnalysisDocument, Finding, FindingBasis, SkippedDocument } from "@mdiw/shared";

export const RESULT_TABS = [
  { id: "summary", label: "Summary" },
  { id: "comparison", label: "Comparison" },
  { id: "discrepancies", label: "Discrepancies" },
  { id: "missing", label: "Missing info" },
  { id: "facts", label: "Key facts" },
] as const;
export type ResultTabId = (typeof RESULT_TABS)[number]["id"];

export interface DocumentFacts {
  readonly document: AnalysisDocument;
  readonly findings: readonly Finding[];
}

export interface GroupedFindings {
  readonly keyDocument: Finding | null;
  readonly comparison: readonly Finding[];
  readonly discrepancies: readonly Finding[];
  readonly missing: readonly Finding[];
  /** `key_fact` and `field_value` findings per document, in `analysis.documents` order. */
  readonly factsByDocument: readonly DocumentFacts[];
}

/** Splits an analysis's findings into what each results tab shows. */
export function groupFindings(analysis: Analysis): GroupedFindings {
  const byKind = (kind: Finding["kind"]) => analysis.findings.filter((f) => f.kind === kind);
  const factsByDocument = analysis.documents.map((document) => ({
    document,
    findings: analysis.findings.filter(
      (f) =>
        (f.kind === "field_value" || f.kind === "key_fact") && f.sources.some((s) => s.documentId === document.documentId),
    ),
  }));
  return {
    keyDocument: byKind("key_document")[0] ?? null,
    comparison: byKind("comparison"),
    discrepancies: byKind("discrepancy"),
    missing: byKind("missing_info"),
    factsByDocument,
  };
}

export function tabCounts(analysis: Analysis, grouped: GroupedFindings): Record<ResultTabId, number> {
  return {
    summary: analysis.documents.length,
    comparison: grouped.comparison.length,
    discrepancies: grouped.discrepancies.length,
    missing: grouped.missing.length,
    facts: grouped.factsByDocument.reduce((sum, group) => sum + group.findings.length, 0),
  };
}

export type FilenameOf = (documentId: string) => string;

/** Maps a document id to its filename in this analysis (falls back to the id). */
export function filenameLookup(analysis: Analysis): FilenameOf {
  const names = new Map(analysis.documents.map((d) => [d.documentId, d.filename]));
  return (documentId) => names.get(documentId) ?? documentId;
}

export function skippedLabel(skipped: SkippedDocument): string {
  return skipped.filename ?? skipped.documentId;
}

export const BASIS_META: Readonly<Record<FindingBasis, { label: string; description: string }>> = {
  fact: { label: "Fact", description: "Fact: quoted verbatim from the document (verified)" },
  ai: { label: "AI", description: "AI: model judgement, check before relying on it" },
};

export function basisOf(finding: Finding) {
  return BASIS_META[findingBasis(finding)];
}

export type ComparisonStatus = "consistent" | "discrepancy" | "partial" | "missing";

const COMPARISON_STATUSES: readonly ComparisonStatus[] = ["consistent", "discrepancy", "partial", "missing"];

/** The comparison status stored in a `comparison` finding's `detail`, if recognised. */
export function comparisonStatus(finding: Finding): ComparisonStatus | null {
  return COMPARISON_STATUSES.find((status) => status === finding.detail) ?? null;
}

/** The value of `finding` for one document (`null` = not found or not a source). */
export function sourceFor(finding: Finding, documentId: string) {
  return finding.sources.find((s) => s.documentId === documentId) ?? null;
}

export function relevancePercent(relevance: number): number {
  return Math.round(Math.min(1, Math.max(0, relevance)) * 100);
}
