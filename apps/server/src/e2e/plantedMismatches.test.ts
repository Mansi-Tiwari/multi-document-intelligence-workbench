/**
 * End-to-end over HTTP with the offline mock provider: upload the samples
 * (testing/samples/README.md lists the planted mismatches) and check the analysis
 * finds exactly those, with every quote present in its own document.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { AnalysisSchema, CreateAnalysisResponseSchema, findingBasis } from "@mdiw/shared";
import type { CreateAnalysisResponse, Finding } from "@mdiw/shared";
import { locateQuote } from "../domain/crossDocument";
import { uploadSamples } from "../testing/samples";
import type { SampleFile } from "../testing/samples";
import { buildTestApp } from "../testing/testApp";

const INSTRUCTION = "Compare name, email, date of birth, licence number and monthly income";

describe("planted mismatches in the sample documents", () => {
  const ctx = buildTestApp();
  let ids: Record<SampleFile, string>;
  let body: CreateAnalysisResponse;
  const byKind = (kind: Finding["kind"]) => body.analysis.findings.filter((f) => f.kind === kind);
  const valueIn = (finding: Finding | undefined, file: SampleFile) =>
    finding?.sources.find((s) => s.documentId === ids[file])?.value;

  beforeAll(async () => {
    ids = await uploadSamples(ctx.app);
    const res = await request(ctx.app)
      .post("/api/analyses")
      .send({
        instruction: INSTRUCTION,
        documentIds: [ids["application-form.txt"], ids["bank-statement.csv"], ids["licence.pdf"]],
      });
    expect(res.status).toBe(201);
    body = CreateAnalysisResponseSchema.parse(res.body);
  });

  it("analyses all three documents and skips none", () => {
    expect(body.skipped).toEqual([]);
    expect(body.analysis.documents.map((d) => d.filename)).toEqual([
      "application-form.txt",
      "bank-statement.csv",
      "licence.pdf",
    ]);
  });

  it("flags exactly the planted name, email and licence number discrepancies", () => {
    const discrepancies = byKind("discrepancy");
    const byField = (key: string) => discrepancies.find((f) => f.fieldKey === key);
    expect(discrepancies.map((f) => f.fieldKey).sort()).toEqual(["email", "licence_number", "name"]);

    expect(valueIn(byField("name"), "licence.pdf")).toBe("Jane A. Doe");
    expect(valueIn(byField("email"), "bank-statement.csv")).toBe("jane.doe@example.org");
    expect(valueIn(byField("licence_number"), "application-form.txt")).toBe("D1234-5678-90");
    expect(valueIn(byField("licence_number"), "licence.pdf")).toBe("D1234-5678-91");
  });

  it("does not flag the date of birth written in two formats", () => {
    const dob = byKind("comparison").find((f) => f.fieldKey?.includes("birth"));
    expect(dob?.sources.filter((s) => s.value !== null).map((s) => s.value)).toEqual(["1990-04-12", "1990-04-12"]);
    expect(byKind("discrepancy").some((f) => f.fieldKey?.includes("birth"))).toBe(false);
  });

  it("reports fields missing from specific documents", () => {
    const missing = byKind("missing_info");
    const income = missing.find((f) => f.fieldKey === "monthly_income");
    expect(income?.sources.map((s) => s.documentId)).toEqual([ids["bank-statement.csv"], ids["licence.pdf"]]);
    const dob = missing.find((f) => f.fieldKey?.includes("birth"));
    expect(dob?.sources.map((s) => s.documentId)).toEqual([ids["bank-statement.csv"]]);
  });

  it("picks one key document and gives every comparison one source per document", () => {
    expect(byKind("key_document")).toHaveLength(1);
    for (const comparison of byKind("comparison")) expect(comparison.sources).toHaveLength(3);
  });

  it("every quote really exists in its own source document", () => {
    let checked = 0;
    for (const finding of body.analysis.findings) {
      for (const source of finding.sources) {
        if (source.quote === null) continue;
        const text = ctx.documents.findById(source.documentId)?.text ?? "";
        expect(locateQuote(text, source.quote), `${finding.kind}: ${source.quote}`).not.toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("labels quoted values as fact and judgement calls as AI", () => {
    expect(byKind("field_value").every((f) => findingBasis(f) === "fact")).toBe(true);
    expect(byKind("key_document").every((f) => findingBasis(f) === "ai")).toBe(true);
    expect(byKind("missing_info").every((f) => findingBasis(f) === "ai")).toBe(true);
  });

  it("saves the analysis so it can be read back", async () => {
    const res = await request(ctx.app).get(`/api/analyses/${body.analysis.id}`);
    expect(res.status).toBe(200);
    expect(AnalysisSchema.parse(res.body)).toEqual(body.analysis);
  });
});
