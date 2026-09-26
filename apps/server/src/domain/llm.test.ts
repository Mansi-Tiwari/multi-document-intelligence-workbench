import { describe, expect, it } from "vitest";
import { normalizeWhitespace, validateDocumentAnalysis, validatePlannedFields, type PlannedField } from "./llm";

const fields: PlannedField[] = [
  { key: "total_amount", description: "Invoice total" },
  { key: "due_date", description: "Payment due date" },
];
const documentText = "Invoice INV-7\nTotal:   $1,250.00\nDue date: 2026-03-01\nPayment within 30 days.";
const ctx = { fields, documentText };

type RawAnalysis = {
  summary: string;
  relevance: number;
  fields: { key: string; value: string | null; quote: string | null }[];
  keyFacts: { fact: string; quote: string | null }[];
};

const valid = (): RawAnalysis => ({
  summary: "An invoice.",
  relevance: 0.8,
  fields: [
    { key: "total_amount", value: "$1,250.00", quote: "Total: $1,250.00" },
    { key: "due_date", value: "2026-03-01", quote: "Due date: 2026-03-01" },
  ],
  keyFacts: [{ fact: "Payment is due within 30 days", quote: "Payment within 30 days." }],
});

const issuesOf = (result: { ok: true } | { ok: false; issues: string[] }): string[] => (result.ok ? [] : result.issues);

describe("validatePlannedFields", () => {
  it("accepts 1..12 unique snake_case fields", () => {
    const result = validatePlannedFields({ fields: [{ key: "payment_terms", description: " Terms " }] });
    expect(result).toEqual({ ok: true, value: [{ key: "payment_terms", description: "Terms" }] });
  });

  it.each([
    ["no fields", { fields: [] }],
    ["13 fields", { fields: Array.from({ length: 13 }, (_, i) => ({ key: `f${i}`, description: "d" })) }],
    ["a non snake_case key", { fields: [{ key: "Payment Terms", description: "d" }] }],
    ["a blank description", { fields: [{ key: "a", description: "  " }] }],
    ["a too long description", { fields: [{ key: "a", description: "x".repeat(301) }] }],
    ["duplicate keys", { fields: [{ key: "a", description: "d" }, { key: "a", description: "e" }] }],
    ["not an object", "fields"],
  ])("rejects %s", (_label, raw) => {
    const result = validatePlannedFields(raw);
    expect(result.ok).toBe(false);
    expect(issuesOf(result).length).toBeGreaterThan(0);
  });
});

describe("validateDocumentAnalysis", () => {
  it("accepts valid output, matching quotes after whitespace normalization", () => {
    const result = validateDocumentAnalysis(valid(), ctx);
    expect(result.ok).toBe(true);
  });

  it("normalizes field order to the requested order", () => {
    const raw = valid();
    raw.fields.reverse();
    const result = validateDocumentAnalysis(raw, ctx);
    expect(result.ok && result.value.fields.map((f) => f.key)).toEqual(["total_amount", "due_date"]);
  });

  it("turns blank values and quotes into null", () => {
    const raw = valid();
    raw.fields[1] = { key: "due_date", value: " ", quote: "" };
    const result = validateDocumentAnalysis(raw, ctx);
    expect(result.ok && result.value.fields[1]).toEqual({ key: "due_date", value: null, quote: null });
  });

  it("rejects a missing requested key", () => {
    const raw = valid();
    raw.fields.pop();
    expect(issuesOf(validateDocumentAnalysis(raw, ctx))).toEqual([expect.stringContaining("'due_date' is missing")]);
  });

  it("rejects an extra key", () => {
    const raw = valid();
    raw.fields.push({ key: "vendor", value: "Acme", quote: null });
    expect(issuesOf(validateDocumentAnalysis(raw, ctx))).toEqual([expect.stringContaining("'vendor' was not requested")]);
  });

  it("rejects a duplicated key", () => {
    const raw = valid();
    raw.fields.push({ key: "due_date", value: null, quote: null });
    expect(issuesOf(validateDocumentAnalysis(raw, ctx))).toEqual([expect.stringContaining("more than once")]);
  });

  it("rejects a fabricated field quote", () => {
    const raw = valid();
    raw.fields[0] = { key: "total_amount", value: "$9,999", quote: "Total: $9,999" };
    expect(issuesOf(validateDocumentAnalysis(raw, ctx))).toEqual([
      expect.stringContaining("fields.0.quote: not found verbatim"),
    ]);
  });

  it("rejects a fabricated key-fact quote", () => {
    const raw = valid();
    raw.keyFacts = [{ fact: "Late fee applies", quote: "A late fee of 5% applies." }];
    expect(issuesOf(validateDocumentAnalysis(raw, ctx))).toEqual([
      expect.stringContaining("keyFacts.0.quote: not found verbatim"),
    ]);
  });

  it("rejects a quote when the value is null", () => {
    const raw = valid();
    raw.fields[1] = { key: "due_date", value: null, quote: "Due date: 2026-03-01" };
    expect(issuesOf(validateDocumentAnalysis(raw, ctx))).toEqual([expect.stringContaining("must be null when value is null")]);
  });

  it.each([-0.1, 1.5, Number.NaN])("rejects relevance %s", (relevance) => {
    const result = validateDocumentAnalysis({ ...valid(), relevance }, ctx);
    expect(issuesOf(result)).toEqual([expect.stringContaining("relevance")]);
  });

  it.each([
    ["a missing summary", { ...valid(), summary: "" }],
    ["too many key facts", { ...valid(), keyFacts: Array.from({ length: 21 }, () => ({ fact: "f", quote: null })) }],
    ["a bad JSON value (string instead of object)", "{\"summary\": "],
    ["null", null],
  ])("rejects %s", (_label, raw) => {
    expect(validateDocumentAnalysis(raw, ctx).ok).toBe(false);
  });
});

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeWhitespace("  a \n\t b  ")).toBe("a b");
  });
});
