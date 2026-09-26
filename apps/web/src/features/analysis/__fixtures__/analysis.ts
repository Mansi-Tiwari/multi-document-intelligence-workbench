import type { Analysis, CreateAnalysisResponse } from "@mdiw/shared";

/** Test fixture: three documents, two fields, every finding kind. Valid against `AnalysisSchema`. */
export const DOC_A = "00000000-0000-4000-8000-00000000000a";
export const DOC_B = "00000000-0000-4000-8000-00000000000b";
export const DOC_C = "00000000-0000-4000-8000-00000000000c";

const fid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const analysisFixture: Analysis = {
  id: "20000000-0000-4000-8000-000000000001",
  instruction: "Compare total amount and due date",
  provider: "mock",
  model: "mock-1",
  createdAt: "2026-01-31T12:00:00.000Z",
  fields: [
    { key: "total_amount", description: "Total amount" },
    { key: "due_date", description: "Due date" },
  ],
  documents: [
    { documentId: DOC_A, filename: "invoice-a.pdf", summary: "Invoice A for consulting.", relevance: 0.9 },
    { documentId: DOC_B, filename: "invoice-b.txt", summary: "Invoice B | revised.", relevance: 0.6 },
    { documentId: DOC_C, filename: "notes.md", summary: "Meeting notes.", relevance: 0.1 },
  ],
  findings: [
    {
      id: fid(1),
      scope: "document",
      kind: "field_value",
      fieldKey: "total_amount",
      title: "Total amount",
      detail: "$100",
      sources: [{ documentId: DOC_A, value: "$100", quote: "Total: $100" }],
    },
    {
      id: fid(2),
      scope: "document",
      kind: "field_value",
      fieldKey: "total_amount",
      title: "Total amount",
      detail: "$120",
      sources: [{ documentId: DOC_B, value: "$120", quote: "Total: $120" }],
    },
    {
      id: fid(3),
      scope: "document",
      kind: "key_fact",
      fieldKey: null,
      title: "Signed by Alice",
      detail: null,
      sources: [{ documentId: DOC_A, value: null, quote: "Signed by Alice" }],
    },
    {
      id: fid(4),
      scope: "document",
      kind: "key_fact",
      fieldKey: null,
      title: "Budget was discussed",
      detail: null,
      sources: [{ documentId: DOC_C, value: null, quote: null }],
    },
    {
      id: fid(5),
      scope: "cross_document",
      kind: "comparison",
      fieldKey: "total_amount",
      title: "Total amount",
      detail: "discrepancy",
      sources: [
        { documentId: DOC_A, value: "$100", quote: "Total: $100" },
        { documentId: DOC_B, value: "$120", quote: "Total: $120" },
        { documentId: DOC_C, value: null, quote: null },
      ],
    },
    {
      id: fid(6),
      scope: "cross_document",
      kind: "comparison",
      fieldKey: "due_date",
      title: "Due date",
      detail: "partial",
      sources: [
        { documentId: DOC_A, value: "2026-02-01", quote: "Due: 2026-02-01" },
        { documentId: DOC_B, value: null, quote: null },
        { documentId: DOC_C, value: null, quote: null },
      ],
    },
    {
      id: fid(7),
      scope: "cross_document",
      kind: "discrepancy",
      fieldKey: "total_amount",
      title: "Total amount differs between documents",
      detail: "2 different values across 2 documents.",
      sources: [
        { documentId: DOC_A, value: "$100", quote: "Total: $100" },
        { documentId: DOC_B, value: "$120", quote: "Total: $120" },
      ],
    },
    {
      id: fid(8),
      scope: "cross_document",
      kind: "missing_info",
      fieldKey: "due_date",
      title: "Due date is missing from 2 of 3 documents",
      detail: null,
      sources: [
        { documentId: DOC_B, value: null, quote: null },
        { documentId: DOC_C, value: null, quote: null },
      ],
    },
    {
      id: fid(9),
      scope: "cross_document",
      kind: "key_document",
      fieldKey: null,
      title: "Key document: invoice-a.pdf",
      detail: "Highest relevance (0.90); 2 of 2 requested fields found.",
      sources: [{ documentId: DOC_A, value: null, quote: null }],
    },
  ],
};

export const responseFixture: CreateAnalysisResponse = {
  analysis: analysisFixture,
  skipped: [
    {
      documentId: "00000000-0000-4000-8000-00000000000d",
      filename: null,
      reason: "not_found",
      message: "Document not found.",
    },
  ],
};
