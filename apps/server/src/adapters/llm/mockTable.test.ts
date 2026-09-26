import { describe, expect, it } from "vitest";
import {
  columnForKey,
  describeProfile,
  detectSubject,
  findSubjectRows,
  parseRenderedTable,
  periodDivisor,
  profileColumn,
} from "./mockTable";

const TEXT = [
  "Columns: name, email, dept, date, salary",
  "Row 1: name=Ananya Sharma; email=a@x.com; dept=Eng; date=2020-01-01; salary=100",
  "Row 2: name=Riya Kapoor; email=r@x.com; dept=Eng; date=2021-05-05; salary=300",
  "Row 3: name=Rahul; email=h@x.com; dept=Sales; notes; date=2019-02-02; salary=200",
].join("\n");

describe("mockTable", () => {
  const table = parseRenderedTable(TEXT);
  if (table === null) throw new Error("expected a table");

  it("parses rows by column order, even when a value contains '; '", () => {
    expect(table.rows).toHaveLength(3);
    expect(table.rows[2]?.cells.get("dept")).toBe("Sales; notes");
    expect(parseRenderedTable("just text")).toBeNull();
  });

  it("profiles numbers, dates, categories and unique columns", () => {
    expect(describeProfile(profileColumn(table, "salary"))).toBe("from 100 to 300 (average 200)");
    expect(describeProfile(profileColumn(table, "date"))).toBe("from 2019-02-02 to 2021-05-05");
    expect(profileColumn(table, "email").kind).toBe("unique");
  });

  it("detects a subject clause and keeps the fields part", () => {
    expect(detectSubject("Compare name and salary of riya with other employees")).toEqual({
      subject: "riya",
      fieldsPart: "Compare name and salary",
    });
    expect(detectSubject("Compare date of birth and email").subject).toBeNull();
    expect(detectSubject("Compare salary for Riya Kapoor against the rest").subject).toBe("Riya Kapoor");
  });

  it("finds the subject's row by whole words", () => {
    expect(findSubjectRows(table, "riya").map((r) => r.index)).toEqual([2]);
    expect(findSubjectRows(table, "ri")).toEqual([]);
  });

  it("maps fields to columns without generic false matches", () => {
    expect(columnForKey(table, "salary")).toBe("salary");
    expect(columnForKey(table, "monthly_income")).toBe("salary");
    expect(columnForKey(table, "date_birth")).toBeNull();
    expect(periodDivisor("monthly_income", "annual_salary_inr")).toBe(12);
    expect(periodDivisor("monthly_income", "salary")).toBe(1);
  });
});
