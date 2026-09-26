import type { Analysis, Finding } from "./analysis";
import type { SkippedDocument } from "./analysisApi";

/**
 * A plain-language overview of an analysis, derived only from its saved findings.
 * The web Summary tab and "copy summary" both use it, so they always agree.
 */

export type RelevanceLevel = "high" | "medium" | "low";

export function relevanceLevel(relevance: number): RelevanceLevel {
  if (relevance >= 0.7) return "high";
  if (relevance >= 0.4) return "medium";
  return "low";
}

export interface OverviewValue {
  documentId: string;
  filename: string;
  value: string;
}

export interface AnalysisOverview {
  /** 1–4 short sentences answering "what did we find?". */
  headline: string;
  /** Points where documents state different values. */
  differences: { fieldKey: string; label: string; values: OverviewValue[] }[];
  /** Points stated in some documents but not others. */
  missing: { fieldKey: string; label: string; missingFrom: string[]; foundIn: number }[];
  /** Points no document mentions. */
  notFoundAnywhere: { fieldKey: string; label: string }[];
  /** Points where every document that states them agrees. */
  matches: { fieldKey: string; label: string; value: string; foundIn: number }[];
  keyDocument: { documentId: string; filename: string; reason: string } | null;
  documents: {
    documentId: string;
    filename: string;
    summary: string;
    relevance: number;
    relevanceLevel: RelevanceLevel;
    pointsFound: number;
    pointsTotal: number;
  }[];
  skipped: { name: string; message: string }[];
}

export function summarizeAnalysis(analysis: Analysis, skipped: readonly SkippedDocument[] = []): AnalysisOverview {
  const filenameOf = (id: string) => analysis.documents.find((d) => d.documentId === id)?.filename ?? id;
  const labelOf = (key: string | null) =>
    analysis.fields.find((f) => f.key === key)?.description ?? (key ?? "").replaceAll("_", " ");
  const total = analysis.documents.length;

  const differences: AnalysisOverview["differences"] = [];
  const missing: AnalysisOverview["missing"] = [];
  const notFoundAnywhere: AnalysisOverview["notFoundAnywhere"] = [];
  const matches: AnalysisOverview["matches"] = [];

  // Per field, which documents state a value. Built from the document-scoped
  // field_value findings, so it works for one document as well as many.
  for (const field of analysis.fields) {
    const fieldKey = field.key;
    const label = labelOf(fieldKey);
    const present: OverviewValue[] = analysis.documents.flatMap((doc) => {
      const finding = analysis.findings.find(
        (f) => f.kind === "field_value" && f.fieldKey === fieldKey && f.sources[0]?.documentId === doc.documentId,
      );
      const value = finding?.sources[0]?.value ?? null;
      return value === null ? [] : [{ documentId: doc.documentId, filename: doc.filename, value }];
    });

    if (present.length === 0) {
      notFoundAnywhere.push({ fieldKey, label });
      continue;
    }
    const comparison = analysis.findings.find((f) => f.kind === "comparison" && f.fieldKey === fieldKey);
    const [first] = present;
    if (comparison?.detail === "discrepancy") {
      differences.push({ fieldKey, label, values: present });
    } else if (first !== undefined) {
      matches.push({ fieldKey, label, value: first.value, foundIn: present.length });
    }
    if (present.length < total) {
      const has = new Set(present.map((p) => p.documentId));
      missing.push({
        fieldKey,
        label,
        missingFrom: analysis.documents.filter((d) => !has.has(d.documentId)).map((d) => d.filename),
        foundIn: present.length,
      });
    }
  }

  const keyFinding: Finding | undefined = analysis.findings.find((f) => f.kind === "key_document");
  const keySource = keyFinding?.sources[0];
  const keyDocument =
    keyFinding && keySource
      ? { documentId: keySource.documentId, filename: filenameOf(keySource.documentId), reason: keyFinding.detail ?? "" }
      : null;

  const pointsTotal = analysis.fields.length;
  const documents = analysis.documents.map((doc) => ({
    documentId: doc.documentId,
    filename: doc.filename,
    summary: doc.summary,
    relevance: doc.relevance,
    relevanceLevel: relevanceLevel(doc.relevance),
    pointsFound: analysis.findings.filter(
      (f) => f.kind === "field_value" && f.sources[0]?.documentId === doc.documentId,
    ).length,
    pointsTotal,
  }));

  const skippedList = skipped.map((s) => ({ name: s.filename ?? s.documentId, message: s.message }));

  return {
    headline:
      total === 1
        ? singleDocumentHeadline(analysis.documents[0]?.filename ?? "the document", pointsTotal, matches, notFoundAnywhere, skippedList.length)
        : buildHeadline({ total, pointsTotal, differences, missing, notFoundAnywhere, skipped: skippedList.length }),
    differences,
    missing,
    notFoundAnywhere,
    matches,
    keyDocument,
    documents,
    skipped: skippedList,
  };
}

/** "Analysed employees.csv for 5 points. Found name, email and monthly income. Not in the document: …" */
function singleDocumentHeadline(
  filename: string,
  pointsTotal: number,
  matches: AnalysisOverview["matches"],
  notFound: AnalysisOverview["notFoundAnywhere"],
  skipped: number,
): string {
  const sentences = [
    pointsTotal > 0 ? `Analysed ${filename} for ${plural(pointsTotal, "point")}.` : `Analysed ${filename}.`,
  ];
  if (matches.length > 0) sentences.push(`Found ${joinList(matches.map((m) => inSentence(m.label)))}.`);
  if (notFound.length > 0) {
    sentences.push(`Not in the document: ${joinList(notFound.map((m) => inSentence(m.label)))}.`);
  }
  if (skipped > 0) sentences.push(`${plural(skipped, "other document")} could not be analysed.`);
  return sentences.join(" ");
}

function buildHeadline(input: {
  total: number;
  pointsTotal: number;
  differences: AnalysisOverview["differences"];
  missing: AnalysisOverview["missing"];
  notFoundAnywhere: AnalysisOverview["notFoundAnywhere"];
  skipped: number;
}): string {
  const { total, pointsTotal, differences, missing, notFoundAnywhere, skipped } = input;
  const sentences: string[] = [];

  sentences.push(
    pointsTotal > 0
      ? `Compared ${plural(total, "document")} on ${plural(pointsTotal, "point")}.`
      : `Analysed ${plural(total, "document")}.`,
  );

  if (differences.length > 0) {
    sentences.push(
      `Found ${plural(differences.length, "difference")}: ${joinList(differences.map((d) => inSentence(d.label)))}.`,
    );
  } else if (pointsTotal > 0 && total > 1) {
    sentences.push("No differences: the documents agree wherever they state the same point.");
  }

  if (missing.length > 0) {
    const labels = joinList(missing.map((m) => inSentence(m.label)));
    sentences.push(`${capitalize(labels)} ${missing.length === 1 ? "is" : "are"} missing from some documents.`);
  }

  if (notFoundAnywhere.length > 0) {
    sentences.push(`No document mentions ${joinList(notFoundAnywhere.map((m) => inSentence(m.label)))}.`);
  }

  if (skipped > 0) {
    sentences.push(`${plural(skipped, "document")} could not be analysed.`);
  }

  return sentences.join(" ");
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "a", "a and b", "a, b and c" (or "a, b or c"). */
export function joinList(items: readonly string[], conjunction: "and" | "or" = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1] ?? ""}`;
}

/** Lower-cases a label's first letter for use mid-sentence, unless it starts with an acronym ("VAT number"). */
function inSentence(label: string): string {
  const firstWord = label.split(/\s+/)[0] ?? "";
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
