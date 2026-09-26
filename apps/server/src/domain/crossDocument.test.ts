import { describe, expect, it } from "vitest";
import { FindingSchema } from "@mdiw/shared";
import type { AnalysisField } from "@mdiw/shared";
import {
  buildFindings,
  chooseKeyDocument,
  comparableValue,
  fieldStatus,
  findUnverifiedQuotes,
  locateQuote,
} from "./crossDocument";
import type { DocumentResult } from "./crossDocument";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const FIELDS: AnalysisField[] = [
  { key: "total_amount", description: "Total amount" },
  { key: "due_date", description: "Due date" },
  { key: "vendor", description: "Vendor" },
];

function result(documentId: string, relevance: number, values: Record<string, string | null>): DocumentResult {
  return {
    documentId,
    filename: `${documentId.slice(0, 1)}.txt`,
    summary: "s",
    relevance,
    fields: FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? null, quote: values[f.key] ?? null })),
    keyFacts: [],
  };
}

function ids(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

describe("comparableValue", () => {
  it("treats equivalent money and dates as equal", () => {
    expect(comparableValue("$1,200.00")).toBe(comparableValue("USD 1200"));
    expect(comparableValue("1 March 2024")).toBe(comparableValue("2024-03-01"));
    expect(comparableValue("  Acme   Corp ")).toBe(comparableValue("acme corp"));
  });

  it("keeps different amounts and currencies distinct", () => {
    expect(comparableValue("$1,200")).not.toBe(comparableValue("$1,250"));
    expect(comparableValue("€1,200")).not.toBe(comparableValue("$1,200"));
  });
});

describe("fieldStatus", () => {
  it("classifies consistent, discrepancy, partial and missing", () => {
    expect(fieldStatus(["$5", "USD 5.00"])).toBe("consistent");
    expect(fieldStatus(["$5", "$6"])).toBe("discrepancy");
    expect(fieldStatus(["$5", null])).toBe("partial");
    expect(fieldStatus([null, null])).toBe("missing");
    expect(fieldStatus(["$5", "$6", null])).toBe("discrepancy");
  });
});

describe("chooseKeyDocument", () => {
  it("picks highest relevance, then most fields found, then request order", () => {
    expect(chooseKeyDocument([result(A, 0.4, {}), result(B, 0.9, {})])?.documentId).toBe(B);
    expect(
      chooseKeyDocument([result(A, 0.5, { vendor: "x" }), result(B, 0.5, { vendor: "x", due_date: "2024-01-01" })])
        ?.documentId,
    ).toBe(B);
    expect(chooseKeyDocument([result(A, 0.5, {}), result(B, 0.5, {})])?.documentId).toBe(A);
    expect(chooseKeyDocument([])).toBeNull();
  });
});

describe("buildFindings", () => {
  const results = [
    result(A, 0.9, { total_amount: "$1,200.00", due_date: "2024-03-01", vendor: "Acme" }),
    result(B, 0.6, { total_amount: "USD 1250", due_date: "1 March 2024" }),
    { ...result(C, 0.3, { total_amount: "$1,200" }), keyFacts: [{ fact: "Net 30 terms", quote: "Net 30" }] },
  ];
  const findings = buildFindings(FIELDS, results, ids());

  it("produces only schema-valid findings with unique ids", () => {
    for (const f of findings) FindingSchema.parse(f);
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
  });

  it("creates one document-scoped field_value per found value and key facts", () => {
    const values = findings.filter((f) => f.kind === "field_value");
    expect(values).toHaveLength(6);
    expect(values.every((f) => f.sources.length === 1)).toBe(true);
    const facts = findings.filter((f) => f.kind === "key_fact");
    expect(facts.map((f) => [f.title, f.sources[0]?.documentId])).toEqual([["Net 30 terms", C]]);
  });

  it("creates a comparison per field with one source per document", () => {
    const comparisons = findings.filter((f) => f.kind === "comparison");
    expect(comparisons.map((f) => [f.fieldKey, f.detail])).toEqual([
      ["total_amount", "discrepancy"],
      ["due_date", "partial"],
      ["vendor", "partial"],
    ]);
    expect(comparisons.every((f) => f.sources.map((s) => s.documentId).join() === [A, B, C].join())).toBe(true);
  });

  it("flags discrepancies with only the documents that have values", () => {
    const discrepancies = findings.filter((f) => f.kind === "discrepancy");
    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]?.fieldKey).toBe("total_amount");
    expect(discrepancies[0]?.detail).toBe("2 different values across 3 documents.");
  });

  it("does not flag equivalent values written differently", () => {
    expect(findings.some((f) => f.kind === "discrepancy" && f.fieldKey === "due_date")).toBe(false);
  });

  it("lists which documents are missing a field", () => {
    const missing = findings.filter((f) => f.kind === "missing_info");
    expect(missing.map((f) => [f.fieldKey, f.sources.map((s) => s.documentId)])).toEqual([
      ["due_date", [C]],
      ["vendor", [B, C]],
    ]);
    expect(missing[1]?.title).toBe("Vendor is missing from 2 of 3 documents");
  });

  it("reports a field nobody mentions", () => {
    const none = buildFindings(FIELDS, [result(A, 0.5, {}), result(B, 0.5, {})], ids());
    const titles = none.filter((f) => f.kind === "missing_info").map((f) => f.title);
    expect(titles).toContain("No document mentions Vendor");
  });

  it("adds exactly one key_document", () => {
    const key = findings.filter((f) => f.kind === "key_document");
    expect(key).toHaveLength(1);
    expect(key[0]?.sources[0]?.documentId).toBe(A);
    expect(key[0]?.detail).toContain("3 of 3 requested fields");
  });
});

describe("quote verification", () => {
  const text = "INVOICE 42\nTotal due:   $1,200.00\npayable within\n30 days.";

  it("locates quotes and tolerates whitespace differences", () => {
    const loc = locateQuote(text, "Total due: $1,200.00");
    expect(loc).not.toBeNull();
    if (loc) expect(text.slice(loc.start, loc.end)).toBe("Total due:   $1,200.00");
    expect(locateQuote(text, "payable within 30 days.")).not.toBeNull();
  });

  it("treats regex characters literally and rejects missing or empty quotes", () => {
    expect(locateQuote(text, "$1,200.00")).not.toBeNull();
    expect(locateQuote(text, "$1.200,00")).toBeNull();
    expect(locateQuote(text, "Total due: $9,999")).toBeNull();
    expect(locateQuote(text, "   ")).toBeNull();
  });

  it("lists every fabricated quote in a document result", () => {
    const r: DocumentResult = {
      documentId: A,
      filename: "a.txt",
      summary: "s",
      relevance: 1,
      fields: [
        { key: "total_amount", value: "$1,200.00", quote: "Total due: $1,200.00" },
        { key: "due_date", value: "2024-05-01", quote: "Due 2024-05-01" },
      ],
      keyFacts: [{ fact: "Invoice 42", quote: "INVOICE 42" }, { fact: "Paid", quote: "Marked as PAID" }],
    };
    expect(findUnverifiedQuotes(r, text)).toEqual(["Due 2024-05-01", "Marked as PAID"]);
  });
});

describe("buildFindings with one document", () => {
  it("reports only what the document lacks: no comparison, discrepancy or key document", () => {
    const findings = buildFindings(FIELDS, [result(A, 0.9, { total_amount: "$5" })], ids());
    expect(findings.map((f) => f.kind)).toEqual(["field_value", "missing_info", "missing_info"]);
    expect(findings.filter((f) => f.kind === "missing_info").map((f) => f.title)).toEqual([
      "Due date is not in 1.txt",
      "Vendor is not in 1.txt",
    ]);
    for (const f of findings) FindingSchema.parse(f);
  });
});
