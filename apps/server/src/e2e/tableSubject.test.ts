/**
 * One table, one subject: "… of riya with other employee". The analysis must answer
 * from Riya's row (never row 1), compare her with the other rows, derive monthly
 * income from the annual salary, and say what the table does not contain.
 */
import { readFileSync } from "node:fs";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { CreateAnalysisResponseSchema, summarizeAnalysis } from "@mdiw/shared";
import type { CreateAnalysisResponse } from "@mdiw/shared";
import { uploadFiles } from "../testing/samples";
import { buildTestApp } from "../testing/testApp";

const INSTRUCTION = "Compare name, email, date of birth, licence number and monthly income of riya with other employee";

describe("employees.csv: Riya compared with the other employees", () => {
  const { app } = buildTestApp();
  let body: CreateAnalysisResponse;
  const value = (key: string) =>
    body.analysis.findings.find((f) => f.kind === "field_value" && f.fieldKey === key)?.sources[0]?.value ?? null;

  beforeAll(async () => {
    const upload = await uploadFiles(app, [
      { name: "employees.csv", bytes: readFileSync(new URL("../testing/samples/employees.csv", import.meta.url)) },
    ]);
    const first = upload.results[0];
    if (first?.status !== "ok") throw new Error("employees.csv was rejected");
    const res = await request(app).post("/api/analyses").send({ instruction: INSTRUCTION, documentIds: [first.document.id] });
    expect(res.status).toBe(201);
    body = CreateAnalysisResponseSchema.parse(res.body);
  });

  it("plans the attributes, not the subject clause, as fields", () => {
    expect(body.analysis.fields.map((f) => f.description)).toEqual([
      "Name",
      "Email",
      "Date of birth",
      "Licence number",
      "Monthly income",
    ]);
  });

  it("answers from Riya's row, not the first row", () => {
    expect(value("name")).toBe("Riya Kapoor");
    expect(value("email")).toBe("riya.kapoor@example.com");
    expect(value("monthly_income")).toBe("118,333 (derived: annual_salary_inr 1,420,000 ÷ 12)");
    expect(JSON.stringify(body.analysis)).not.toContain("Ananya");
  });

  it("compares Riya with the other employees in key facts and the summary", () => {
    const facts = body.analysis.findings.filter((f) => f.kind === "key_fact").map((f) => f.title);
    expect(facts[0]).toBe(
      "Riya Kapoor's annual salary inr is 1,420,000, above the average of the other 7 rows (1,327,143); ranked 4 of 8 from highest.",
    );
    expect(facts).toContain("Riya Kapoor's department is Engineering, shared with 3 of the other 7 rows.");
    const summary = body.analysis.documents[0]?.summary ?? "";
    expect(summary).toContain("Riya Kapoor is row 3");
    expect(summary).toContain("Compared with the other 7 rows");
    expect(summary).toContain("The table has no column for date of birth or licence number.");
  });

  it("does not compare a single document with itself", () => {
    const kinds = new Set(body.analysis.findings.map((f) => f.kind));
    expect(kinds.has("comparison")).toBe(false);
    expect(kinds.has("key_document")).toBe(false);
    expect(kinds.has("discrepancy")).toBe(false);
    expect(
      body.analysis.findings.filter((f) => f.kind === "missing_info").map((f) => f.title),
    ).toEqual(["Date of birth is not in employees.csv", "Licence number is not in employees.csv"]);
  });

  it("gives a clear one-document headline", () => {
    expect(summarizeAnalysis(body.analysis, body.skipped).headline).toBe(
      "Analysed employees.csv for 5 points. Found name, email and monthly income. Not in the document: date of birth and licence number.",
    );
  });

  it("says so when the subject is not in the table", async () => {
    const upload = await uploadFiles(app, [
      { name: "employees.csv", bytes: readFileSync(new URL("../testing/samples/employees.csv", import.meta.url)) },
    ]);
    const first = upload.results[0];
    if (first?.status !== "ok") throw new Error("rejected");
    const res = await request(app)
      .post("/api/analyses")
      .send({ instruction: "Compare salary of zara with other employees", documentIds: [first.document.id] });
    const result = CreateAnalysisResponseSchema.parse(res.body);
    expect(result.analysis.documents[0]?.summary).toContain("Zara does not appear in this table.");
    expect(result.analysis.findings.some((f) => f.kind === "field_value")).toBe(false);
  });
});
