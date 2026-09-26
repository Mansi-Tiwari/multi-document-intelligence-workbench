import { describe, expect, it } from "vitest";
import type { Analysis, Finding, FindingSource } from "./analysis";
import { joinList, relevanceLevel, summarizeAnalysis } from "./analysisOverview";

const FORM = "11111111-1111-4111-8111-111111111111";
const BANK = "22222222-2222-4222-8222-222222222222";
const LICENCE = "33333333-3333-4333-8333-333333333333";

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const src = (documentId: string, value: string | null): FindingSource => ({ documentId, value, quote: value });

function comparison(fieldKey: string, detail: string, values: [string, string | null][]): Finding {
  return {
    id: id(),
    scope: "cross_document",
    kind: "comparison",
    fieldKey,
    title: fieldKey,
    detail,
    sources: values.map(([doc, v]) => src(doc, v)),
  };
}

function fieldValue(fieldKey: string, documentId: string, value: string): Finding {
  return { id: id(), scope: "document", kind: "field_value", fieldKey, title: fieldKey, detail: value, sources: [src(documentId, value)] };
}

/** A comparison plus the per-document field_value findings the server creates with it. */
function compared(fieldKey: string, detail: string, values: [string, string | null][]): Finding[] {
  return [
    ...values.flatMap(([doc, v]) => (v === null ? [] : [fieldValue(fieldKey, doc, v)])),
    comparison(fieldKey, detail, values),
  ];
}

const analysis: Analysis = {
  id: id(),
  instruction: "Compare name, email, date of birth, licence number and monthly income",
  provider: "mock",
  model: "mock",
  createdAt: "2026-09-26T12:00:00.000Z",
  fields: [
    { key: "name", description: "Name" },
    { key: "email", description: "Email" },
    { key: "date_of_birth", description: "Date of birth" },
    { key: "licence_number", description: "Licence number" },
    { key: "monthly_income", description: "Monthly income" },
    { key: "vat_number", description: "VAT number" },
  ],
  documents: [
    { documentId: FORM, filename: "application-form.txt", summary: "A rental application.", relevance: 0.9 },
    { documentId: BANK, filename: "bank-statement.csv", summary: "A bank statement.", relevance: 0.5 },
    { documentId: LICENCE, filename: "licence.pdf", summary: "A driving licence.", relevance: 0.2 },
  ],
  findings: [
    ...compared("name", "discrepancy", [[FORM, "Jane Doe"], [BANK, null], [LICENCE, "Jane A. Doe"]]),
    ...compared("email", "discrepancy", [[FORM, "jane.doe@example.com"], [BANK, "jane.doe@example.org"], [LICENCE, null]]),
    ...compared("date_of_birth", "partial", [[FORM, "1990-04-12"], [BANK, null], [LICENCE, "12 April 1990"]]),
    ...compared("licence_number", "consistent", [[FORM, "D1"], [BANK, "D1"], [LICENCE, "D1"]]),
    ...compared("monthly_income", "partial", [[FORM, "$4,200.00"], [BANK, null], [LICENCE, null]]),
    ...compared("vat_number", "missing", [[FORM, null], [BANK, null], [LICENCE, null]]),
    {
      id: id(),
      scope: "cross_document",
      kind: "key_document",
      fieldKey: null,
      title: "Key document",
      detail: "Most relevant to the instruction.",
      sources: [src(FORM, null)],
    },
  ],
};

describe("summarizeAnalysis", () => {
  const overview = summarizeAnalysis(analysis, [
    { documentId: id(), filename: "corrupt.pdf", reason: "not_found", message: "Document not found." },
  ]);

  it("writes a short plain-language headline", () => {
    expect(overview.headline).toBe(
      "Compared 3 documents on 6 points. Found 2 differences: name and email. " +
        "Name, email, date of birth and monthly income are missing from some documents. " +
        "No document mentions VAT number. 1 document could not be analysed.",
    );
  });

  it("lists each difference with the value in each file", () => {
    expect(overview.differences).toEqual([
      {
        fieldKey: "name",
        label: "Name",
        values: [
          { documentId: FORM, filename: "application-form.txt", value: "Jane Doe" },
          { documentId: LICENCE, filename: "licence.pdf", value: "Jane A. Doe" },
        ],
      },
      expect.objectContaining({ fieldKey: "email" }),
    ]);
  });

  it("lists missing points by file, points nobody mentions, and matches", () => {
    expect(overview.missing.map((m) => [m.label, m.missingFrom])).toEqual([
      ["Name", ["bank-statement.csv"]],
      ["Email", ["licence.pdf"]],
      ["Date of birth", ["bank-statement.csv"]],
      ["Monthly income", ["bank-statement.csv", "licence.pdf"]],
    ]);
    expect(overview.notFoundAnywhere).toEqual([{ fieldKey: "vat_number", label: "VAT number" }]);
    expect(overview.matches.map((m) => [m.label, m.value, m.foundIn])).toEqual([
      ["Date of birth", "1990-04-12", 2],
      ["Licence number", "D1", 3],
      ["Monthly income", "$4,200.00", 1],
    ]);
  });

  it("names the key document and describes each document", () => {
    expect(overview.keyDocument).toEqual({
      documentId: FORM,
      filename: "application-form.txt",
      reason: "Most relevant to the instruction.",
    });
    expect(overview.documents.map((d) => [d.filename, d.relevanceLevel, d.pointsFound, d.pointsTotal])).toEqual([
      ["application-form.txt", "high", 5, 6],
      ["bank-statement.csv", "medium", 2, 6],
      ["licence.pdf", "low", 3, 6],
    ]);
    expect(overview.skipped).toEqual([{ name: "corrupt.pdf", message: "Document not found." }]);
  });

  it("says so when documents agree", () => {
    const agreeing = summarizeAnalysis({
      ...analysis,
      findings: compared("licence_number", "consistent", [[FORM, "D1"], [BANK, "D1"], [LICENCE, "D1"]]),
      fields: [{ key: "licence_number", description: "Licence number" }],
    });
    expect(agreeing.headline).toBe(
      "Compared 3 documents on 1 point. No differences: the documents agree wherever they state the same point.",
    );
  });
});

describe("summarizeAnalysis with one document", () => {
  it("describes what was found and what is not in the file, without comparing", () => {
    const single = summarizeAnalysis({
      ...analysis,
      documents: [{ documentId: FORM, filename: "employees.csv", summary: "A table.", relevance: 1 }],
      fields: [
        { key: "name", description: "Name" },
        { key: "email", description: "Email" },
        { key: "date_of_birth", description: "Date of birth" },
      ],
      findings: [fieldValue("name", FORM, "Riya Kapoor"), fieldValue("email", FORM, "riya@example.com")],
    });
    expect(single.headline).toBe("Analysed employees.csv for 3 points. Found name and email. Not in the document: date of birth.");
    expect(single.differences).toEqual([]);
    expect(single.missing).toEqual([]);
    expect(single.keyDocument).toBeNull();
  });
});

describe("helpers", () => {
  it("joins lists and grades relevance", () => {
    expect([joinList([]), joinList(["a"]), joinList(["a", "b"]), joinList(["a", "b", "c"])]).toEqual(["", "a", "a and b", "a, b and c"]);
    expect([relevanceLevel(0.9), relevanceLevel(0.4), relevanceLevel(0.39)]).toEqual(["high", "medium", "low"]);
  });
});
