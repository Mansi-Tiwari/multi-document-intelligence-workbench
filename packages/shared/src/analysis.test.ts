import { describe, expect, it } from "vitest";
import { AnalysisSchema, FindingSchema, type Analysis } from "./analysis";
import { DocumentSummarySchema } from "./documents";

const DOC_A = "11111111-1111-4111-8111-111111111111";
const DOC_B = "22222222-2222-4222-8222-222222222222";
const FINDING = "33333333-3333-4333-8333-333333333333";
const ANALYSIS = "44444444-4444-4444-8444-444444444444";

const source = (documentId: string) => ({ documentId, value: "30 days", quote: "Payment: 30 days" });

const analysis = (overrides: Partial<Analysis> = {}): Record<string, unknown> => ({
  id: ANALYSIS,
  instruction: "Compare payment terms",
  provider: "mock",
  model: "mock-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  fields: [{ key: "payment_terms", description: "Payment terms" }],
  documents: [
    { documentId: DOC_A, filename: "a.txt", summary: "A", relevance: 0.8 },
    { documentId: DOC_B, filename: "b.txt", summary: "B", relevance: 0.4 },
  ],
  findings: [],
  ...overrides,
});

describe("FindingSchema", () => {
  const base = { id: FINDING, fieldKey: "payment_terms", title: "Payment terms", detail: null };

  it("accepts a document-scope field_value with one source", () => {
    expect(FindingSchema.safeParse({ ...base, scope: "document", kind: "field_value", sources: [source(DOC_A)] }).success).toBe(true);
  });

  it("rejects a document-scope finding with two sources", () => {
    const result = FindingSchema.safeParse({
      ...base,
      scope: "document",
      kind: "field_value",
      sources: [source(DOC_A), source(DOC_B)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a finding with no sources", () => {
    expect(FindingSchema.safeParse({ ...base, scope: "cross_document", kind: "comparison", sources: [] }).success).toBe(false);
  });

  it("rejects a cross-document kind with document scope and vice versa", () => {
    expect(FindingSchema.safeParse({ ...base, scope: "document", kind: "discrepancy", sources: [source(DOC_A)] }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...base, scope: "cross_document", kind: "field_value", sources: [source(DOC_A)] }).success).toBe(false);
  });

  it("requires fieldKey for field kinds and forbids it for key_fact/key_document", () => {
    expect(
      FindingSchema.safeParse({ ...base, fieldKey: null, scope: "cross_document", kind: "discrepancy", sources: [source(DOC_A)] }).success,
    ).toBe(false);
    expect(FindingSchema.safeParse({ ...base, scope: "document", kind: "key_fact", sources: [source(DOC_A)] }).success).toBe(false);
    expect(
      FindingSchema.safeParse({ ...base, fieldKey: null, scope: "cross_document", kind: "key_document", sources: [source(DOC_A)] }).success,
    ).toBe(true);
  });

  it("rejects duplicate source documents", () => {
    expect(
      FindingSchema.safeParse({ ...base, scope: "cross_document", kind: "comparison", sources: [source(DOC_A), source(DOC_A)] }).success,
    ).toBe(false);
  });

  it("rejects non-snake_case field keys", () => {
    expect(
      FindingSchema.safeParse({ ...base, fieldKey: "PaymentTerms", scope: "document", kind: "field_value", sources: [source(DOC_A)] }).success,
    ).toBe(false);
  });
});

describe("AnalysisSchema", () => {
  it("accepts a consistent analysis and trims the instruction", () => {
    const parsed = AnalysisSchema.parse({
      ...analysis(),
      instruction: "  Compare payment terms  ",
      findings: [
        {
          id: FINDING,
          scope: "cross_document",
          kind: "comparison",
          fieldKey: "payment_terms",
          title: "Payment terms",
          detail: null,
          sources: [source(DOC_A), source(DOC_B)],
        },
      ],
    });
    expect(parsed.instruction).toBe("Compare payment terms");
  });

  it("rejects instructions that are too short after trimming", () => {
    expect(AnalysisSchema.safeParse(analysis({ instruction: "  ab  " })).success).toBe(false);
  });

  it("rejects a finding source that is not one of the analysis documents", () => {
    const result = AnalysisSchema.safeParse(
      analysis({
        findings: [
          {
            id: FINDING,
            scope: "document",
            kind: "key_fact",
            fieldKey: null,
            title: "Fact",
            detail: null,
            sources: [source("55555555-5555-4555-8555-555555555555")],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a finding whose fieldKey is not a planned field", () => {
    const result = AnalysisSchema.safeParse(
      analysis({
        findings: [
          {
            id: FINDING,
            scope: "document",
            kind: "field_value",
            fieldKey: "total_amount",
            title: "Total",
            detail: null,
            sources: [source(DOC_A)],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects relevance outside 0..1 and duplicate field keys", () => {
    expect(
      AnalysisSchema.safeParse(analysis({ documents: [{ documentId: DOC_A, filename: "a", summary: "", relevance: 1.5 }] })).success,
    ).toBe(false);
    expect(
      AnalysisSchema.safeParse(
        analysis({
          fields: [
            { key: "total", description: "x" },
            { key: "total", description: "y" },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});

describe("DocumentSummarySchema", () => {
  it("validates kind, sha256 and timestamps", () => {
    const doc = {
      id: DOC_A,
      filename: "a.pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a".repeat(64),
      pageCount: 2,
      charCount: 5,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(DocumentSummarySchema.safeParse(doc).success).toBe(true);
    expect(DocumentSummarySchema.safeParse({ ...doc, kind: "docx" }).success).toBe(false);
    expect(DocumentSummarySchema.safeParse({ ...doc, sha256: "abc" }).success).toBe(false);
    expect(DocumentSummarySchema.safeParse({ ...doc, createdAt: "yesterday" }).success).toBe(false);
  });
});
