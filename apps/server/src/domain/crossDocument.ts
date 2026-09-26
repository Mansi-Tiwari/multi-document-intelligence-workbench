/**
 * Pure cross-document analysis. It works ONLY on validated per-document results
 * (each produced by that document's own LLM call); it never sees combined raw text.
 */
import type { AnalysisField, Finding, FindingSource } from "@mdiw/shared";
import { extractEntities } from "./regexEntities";

export interface DocumentFieldResult {
  key: string;
  value: string | null;
  quote: string | null;
}

export interface DocumentKeyFact {
  fact: string;
  quote: string | null;
}

/** One document's validated analysis, in request order. */
export interface DocumentResult {
  documentId: string;
  filename: string;
  summary: string;
  relevance: number;
  fields: readonly DocumentFieldResult[];
  keyFacts: readonly DocumentKeyFact[];
}

export type FieldStatus = "consistent" | "discrepancy" | "partial" | "missing";

// ---------------------------------------------------------------------------
// Value comparison
// ---------------------------------------------------------------------------

/**
 * Canonical form used to compare values across documents. A value that is exactly
 * one date/money/email/licence entity compares by its normalized entity
 * ("$1,200.00" == "USD 1200.00", "1 March 2024" == "2024-03-01"); anything else
 * compares case- and whitespace-insensitively.
 */
export function comparableValue(value: string): string {
  const trimmed = value.trim();
  const entities = extractEntities(trimmed);
  const [only] = entities;
  if (entities.length === 1 && only && only.normalized !== null && only.start === 0 && only.end === trimmed.length) {
    return `${only.type}:${only.normalized.toLowerCase().replace(/\.0+$|(\.\d*?)0+$/, "$1")}`;
  }
  return trimmed.toLowerCase().replace(/\s+/g, " ");
}

export function fieldStatus(values: readonly (string | null)[]): FieldStatus {
  const present = values.filter((v): v is string => v !== null);
  if (present.length === 0) return "missing";
  if (new Set(present.map(comparableValue)).size > 1) return "discrepancy";
  return present.length < values.length ? "partial" : "consistent";
}

// ---------------------------------------------------------------------------
// Key document
// ---------------------------------------------------------------------------

export interface KeyDocumentChoice {
  documentId: string;
  reason: string;
}

/** Highest relevance; ties → most fields found; then request order. */
export function chooseKeyDocument(results: readonly DocumentResult[]): KeyDocumentChoice | null {
  let best: { result: DocumentResult; found: number } | null = null;
  for (const result of results) {
    const found = result.fields.filter((f) => f.value !== null).length;
    if (
      best === null ||
      result.relevance > best.result.relevance ||
      (result.relevance === best.result.relevance && found > best.found)
    ) {
      best = { result, found };
    }
  }
  if (best === null) return null;
  const total = best.result.fields.length;
  return {
    documentId: best.result.documentId,
    reason:
      `Most relevant to the instruction (relevance ${best.result.relevance.toFixed(2)})` +
      (total > 0 ? ` and contains ${best.found} of ${total} requested fields.` : "."),
  };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 * Turns per-document results into findings:
 * - document scope: `field_value` (found values) and `key_fact`, one source each;
 * - cross-document: one `comparison` per field, plus `discrepancy` / `missing_info`
 *   when applicable, and a single `key_document`.
 */
export function buildFindings(
  fields: readonly AnalysisField[],
  results: readonly DocumentResult[],
  newId: () => string,
): Finding[] {
  const findings: Finding[] = [];

  for (const result of results) {
    for (const field of result.fields) {
      if (field.value === null) continue;
      findings.push({
        id: newId(),
        scope: "document",
        kind: "field_value",
        fieldKey: field.key,
        title: labelFor(fields, field.key),
        detail: field.value,
        sources: [{ documentId: result.documentId, value: field.value, quote: field.quote }],
      });
    }
    for (const fact of result.keyFacts) {
      findings.push({
        id: newId(),
        scope: "document",
        kind: "key_fact",
        fieldKey: null,
        title: fact.fact,
        detail: null,
        sources: [{ documentId: result.documentId, value: null, quote: fact.quote }],
      });
    }
  }

  for (const field of fields) {
    const sources: FindingSource[] = results.map((result) => {
      const found = result.fields.find((f) => f.key === field.key);
      return { documentId: result.documentId, value: found?.value ?? null, quote: found?.quote ?? null };
    });
    if (sources.length === 0) continue;
    const status = fieldStatus(sources.map((s) => s.value));
    const label = labelFor(fields, field.key);

    findings.push({
      id: newId(),
      scope: "cross_document",
      kind: "comparison",
      fieldKey: field.key,
      title: label,
      detail: status,
      sources,
    });

    if (status === "discrepancy") {
      const withValues = sources.filter((s) => s.value !== null);
      findings.push({
        id: newId(),
        scope: "cross_document",
        kind: "discrepancy",
        fieldKey: field.key,
        title: `${label} differs between documents`,
        detail: `${new Set(withValues.map((s) => comparableValue(s.value ?? ""))).size} different values across ${withValues.length} documents.`,
        sources: withValues,
      });
    }

    if (status === "partial" || status === "missing") {
      const missing = sources.filter((s) => s.value === null);
      findings.push({
        id: newId(),
        scope: "cross_document",
        kind: "missing_info",
        fieldKey: field.key,
        title: status === "missing" ? `No document mentions ${label}` : `${label} is missing from ${missing.length} of ${sources.length} documents`,
        detail: null,
        sources: missing,
      });
    }
  }

  const key = chooseKeyDocument(results);
  if (key !== null) {
    findings.push({
      id: newId(),
      scope: "cross_document",
      kind: "key_document",
      fieldKey: null,
      title: `Key document: ${results.find((r) => r.documentId === key.documentId)?.filename ?? key.documentId}`,
      detail: key.reason,
      sources: [{ documentId: key.documentId, value: null, quote: null }],
    });
  }

  return findings;
}

function labelFor(fields: readonly AnalysisField[], key: string): string {
  return fields.find((f) => f.key === key)?.description ?? key.replaceAll("_", " ");
}

// ---------------------------------------------------------------------------
// Quote verification
// ---------------------------------------------------------------------------

export interface QuoteLocation {
  start: number;
  end: number;
}

/**
 * Finds `quote` in `text`, tolerating whitespace differences (line breaks, repeated
 * spaces). Returns UTF-16 offsets into `text`, or null if the quote does not exist.
 */
export function locateQuote(text: string, quote: string): QuoteLocation | null {
  const parts = quote.trim().split(/\s+/).filter((p) => p !== "");
  if (parts.length === 0) return null;
  const pattern = new RegExp(parts.map(escapeRegExp).join("\\s+"));
  const match = pattern.exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/** Every non-null quote of a document result, with where it came from, that is NOT in the text. */
export function findUnverifiedQuotes(result: DocumentResult, text: string): string[] {
  const quotes = [
    ...result.fields.map((f) => f.quote),
    ...result.keyFacts.map((k) => k.quote),
  ].filter((q): q is string => q !== null);
  return quotes.filter((q) => locateQuote(text, q) === null);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
