import { describe, expect, it } from "vitest";
import { normalizeWhitespace, validateDocumentAnalysis } from "../../domain/llm";
import type { LlmDocument } from "../../ports/LlmProvider";
import { analyzeMockDocument, GENERIC_FIELDS, MockLlmProvider, planMockFields, slugify } from "./MockLlmProvider";

const invoiceText = [
  "ACME Supplies Ltd. Invoice for office equipment.",
  "Thank you for your business! Please pay on time.",
  "",
  "Invoice Number: INV-2026-0042",
  "Invoice Date: 12 March 2026",
  "Payment Terms: Net 30",
  "Contact: billing@acme.example",
  "Subtotal: $1,000.00",
  "Tax: $250.00",
  "Grand Total: $1,250.00",
  "Contractor licence no: LIC-778899",
].join("\n");

const invoice: LlmDocument = {
  id: "7b1f2a4e-0c1d-4e8a-9f00-1234567890ab",
  filename: "invoice.txt",
  kind: "text",
  text: invoiceText,
};

describe("planMockFields", () => {
  it("strips leading verbs and splits on commas, semicolons and 'and'", () => {
    expect(planMockFields("Compare payment terms, invoice date; totals and contact email").map((f) => f.key)).toEqual([
      "payment_terms",
      "invoice_date",
      "totals",
      "contact_email",
    ]);
  });

  it("caps the plan at 8 fields and drops duplicates", () => {
    const keys = planMockFields("a1, b, c, d, e, f, g, h, i, j, b").map((f) => f.key);
    expect(keys).toHaveLength(8);
    expect(new Set(keys).size).toBe(8);
  });

  it("falls back to generic fields when nothing usable remains", () => {
    expect(planMockFields("Summarize these documents")).toEqual(GENERIC_FIELDS);
    expect(planMockFields("!!!")).toEqual(GENERIC_FIELDS);
  });

  it("slugifies to valid field keys", () => {
    expect(slugify("  2nd Grand-Total (USD) ")).toBe("nd_grand_total_usd");
  });
});

describe("MockLlmProvider", () => {
  const provider = new MockLlmProvider();

  it("reports its name and model", () => {
    expect(provider.name).toBe("mock");
    expect(provider.model).toBe("mock");
  });

  it("plans fields through validation", async () => {
    await expect(provider.planFields({ instruction: "Extract the total and due date" })).resolves.toEqual([
      { key: "total", description: "Total" },
      { key: "due_date", description: "Due date" },
    ]);
  });

  it("analyzes a sample invoice deterministically", async () => {
    const instruction = "Compare payment terms, invoice date, total amount and email";
    const fields = await provider.planFields({ instruction });
    const first = await provider.analyzeDocument({ instruction, fields, document: invoice });
    const second = await provider.analyzeDocument({ instruction, fields, document: invoice });
    expect(second).toEqual(first);

    expect(first.fields).toEqual([
      { key: "payment_terms", value: "Net 30", quote: "Payment Terms: Net 30" },
      { key: "invoice_date", value: "12 March 2026", quote: "Invoice Date: 12 March 2026" },
      { key: "total_amount", value: "USD 1250.00", quote: "$1,250.00" },
      { key: "email", value: "billing@acme.example", quote: "billing@acme.example" },
    ]);
    expect(first.summary).toBe(
      "A text file. It states payment terms Net 30, invoice date 12 March 2026, total amount USD 1250.00 and email billing@acme.example.",
    );
    expect(first.relevance).toBeGreaterThan(0);
    expect(first.relevance).toBeLessThanOrEqual(1);
    expect(first.keyFacts.length).toBeGreaterThan(0);
    expect(first.keyFacts.length).toBeLessThanOrEqual(5);
  });

  it("only quotes text that is in the document", async () => {
    const result = await provider.analyzeDocument({ instruction: "Check totals", fields: GENERIC_FIELDS, document: invoice });
    const quotes = [...result.fields.map((f) => f.quote), ...result.keyFacts.map((f) => f.quote)];
    for (const quote of quotes) {
      if (quote !== null) expect(normalizeWhitespace(invoiceText)).toContain(normalizeWhitespace(quote));
    }
    expect(result.fields.find((f) => f.key === "licence_number")).toMatchObject({ value: "LIC-778899" });
    expect(result.fields.find((f) => f.key === "parties")).toEqual({ key: "parties", value: null, quote: null });
  });

  it("produces raw output that passes the shared validation", () => {
    const raw = analyzeMockDocument("Check totals", GENERIC_FIELDS, invoice);
    expect(validateDocumentAnalysis(raw, { fields: GENERIC_FIELDS, documentText: invoiceText }).ok).toBe(true);
  });

  it("writes a plain-language summary naming what it found and what is missing", async () => {
    const document = { ...invoice, text: "DRIVING LICENCE\nName: Jane A. Doe\nValid until: 2031-06-30" };
    const fields = [
      { key: "name", description: "Name" },
      { key: "monthly_income", description: "Monthly income" },
      { key: "email", description: "Email" },
    ];
    const result = await provider.analyzeDocument({ instruction: "Compare name, monthly income and email", fields, document });
    expect(result.summary).toBe(
      "Driving licence (text file). It states name Jane A. Doe. It does not mention monthly income or email.",
    );
  });

  it("uses the user's own words as field labels", async () => {
    const fields = await provider.planFields({ instruction: "Compare name, date of birth and monthly income?" });
    expect(fields.map((f) => f.description)).toEqual(["Name", "Date of birth", "Monthly income"]);
  });

  it("handles a document with no matches", async () => {
    const document = { ...invoice, kind: "csv" as const, text: "name,age\nbob,4" };
    const result = await provider.analyzeDocument({ instruction: "Payment terms", fields: GENERIC_FIELDS, document });
    expect(result.fields.every((f) => f.value === null && f.quote === null)).toBe(true);
    expect(result.relevance).toBe(0);
  });
});
