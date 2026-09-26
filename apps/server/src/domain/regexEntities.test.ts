import { describe, expect, it } from "vitest";
import { extractEntities } from "./regexEntities";
import type { EntityType, ExtractedEntity } from "./regexEntities";

function only(text: string, type: EntityType): ExtractedEntity[] {
  return extractEntities(text, [type]);
}

function expectOffsetsMatch(source: string, entities: readonly ExtractedEntity[]): void {
  for (const e of entities) {
    expect(source.slice(e.start, e.end)).toBe(e.text);
    expect(e.end).toBeGreaterThan(e.start);
  }
}

describe("extractEntities: dates", () => {
  it("extracts ISO dates with exact offsets", () => {
    const text = "Invoice issued 2024-03-15 and due 2024/04/01.";
    const dates = only(text, "date");
    expect(dates).toEqual([
      { type: "date", text: "2024-03-15", start: 15, end: 25, normalized: "2024-03-15" },
      { type: "date", text: "2024/04/01", start: 34, end: 44, normalized: "2024-04-01" },
    ]);
  });

  it("extracts written dates in both day-month and month-day order", () => {
    const text = "Signed 5th March 2024; effective March 15, 2024; ends 1 Sept. 2025.";
    const dates = only(text, "date");
    expect(dates.map((d) => [d.text, d.normalized])).toEqual([
      ["5th March 2024", "2024-03-05"],
      ["March 15, 2024", "2024-03-15"],
      ["1 Sept. 2025", "2025-09-01"],
    ]);
    expectOffsetsMatch(text, dates);
  });

  it("normalizes unambiguous numeric dates and leaves ambiguous ones null", () => {
    const text = "Due 25/12/2024, paid 12/25/2024, reviewed 03/04/2024, same 07/07/2024.";
    expect(only(text, "date").map((d) => [d.text, d.normalized])).toEqual([
      ["25/12/2024", "2024-12-25"],
      ["12/25/2024", "2024-12-25"],
      ["03/04/2024", null],
      ["07/07/2024", "2024-07-07"],
    ]);
  });

  it("rejects impossible calendar dates", () => {
    expect(only("2023-02-29 and 2024-13-01 and 31 April 2024", "date")).toEqual([]);
    expect(only("Leap day 2024-02-29", "date").map((d) => d.normalized)).toEqual(["2024-02-29"]);
  });

  it("ignores version numbers, bare years and phone-like numbers", () => {
    expect(only("v1.2.3 in 2024, call 555-12-2024x, build 2024.03.15.7", "date")).toEqual([]);
  });
});

describe("extractEntities: money", () => {
  it("extracts symbol-prefixed amounts with thousands separators", () => {
    const text = "Total: $1,234.56 (deposit £500)";
    expect(only(text, "money")).toEqual([
      { type: "money", text: "$1,234.56", start: 7, end: 16, normalized: "USD 1234.56" },
      { type: "money", text: "£500", start: 26, end: 30, normalized: "GBP 500" },
    ]);
  });

  it("extracts currency codes before or after the amount", () => {
    const text = "Fee USD 1,200.00, refund 350.5 EUR, credit 99 €, rebate C$ 20";
    const money = only(text, "money");
    expect(money.map((m) => [m.text, m.normalized])).toEqual([
      ["USD 1,200.00", "USD 1200.00"],
      ["350.5 EUR", "EUR 350.5"],
      ["99 €", "EUR 99"],
      ["C$ 20", "CAD 20"],
    ]);
    expectOffsetsMatch(text, money);
  });

  it("keeps a leading minus sign", () => {
    expect(only("Adjustment -$45.00", "money").map((m) => m.normalized)).toEqual(["USD -45.00"]);
  });

  it("does not treat plain numbers or lowercase words as money", () => {
    expect(only("Qty 1,000 units, usd 5, ref 12345", "money")).toEqual([]);
  });
});

describe("extractEntities: emails", () => {
  it("extracts emails with offsets and excludes trailing punctuation", () => {
    const text = "Contact Jane.Doe+billing@Example.co.uk. Or ops@acme.io!";
    const emails = only(text, "email");
    expect(emails).toEqual([
      { type: "email", text: "Jane.Doe+billing@Example.co.uk", start: 8, end: 38, normalized: "jane.doe+billing@example.co.uk" },
      { type: "email", text: "ops@acme.io", start: 43, end: 54, normalized: "ops@acme.io" },
    ]);
  });

  it("rejects malformed addresses", () => {
    expect(only("a..b@x.com .a@x.com user@localhost user@-bad.com @x.com", "email")).toEqual([]);
  });
});

describe("extractEntities: licence numbers", () => {
  it("extracts labelled licence ids; offsets cover the id only", () => {
    const text = "Driver's Licence No: D1234-5678-90 issued.";
    expect(only(text, "licence_number")).toEqual([
      { type: "licence_number", text: "D1234-5678-90", start: 21, end: 34, normalized: "D1234-5678-90" },
    ]);
  });

  it("accepts US and UK spellings and common label forms", () => {
    const text = "license # ab123456; LICENCE NUMBER X9Y8Z7; Lic. No. 77-4412; licence id: q12w3";
    const ids = only(text, "licence_number");
    expect(ids.map((l) => l.normalized)).toEqual(["AB123456", "X9Y8Z7", "77-4412", "Q12W3"]);
    expectOffsetsMatch(text, ids);
  });

  it("requires a digit so ordinary words after 'licence' are not ids", () => {
    expect(only("This licence agreement grants a license holder rights.", "licence_number")).toEqual([]);
  });
});

describe("extractEntities: combined", () => {
  it("returns all types sorted by position with valid offsets", () => {
    const text = [
      "Contract dated 1 February 2024 between Acme (billing@acme.com) and Bob.",
      "Driving licence no. B77-001234. Amount due: €2,500.00 by 2024-03-01.",
    ].join("\n");
    const entities = extractEntities(text);
    expect(entities.map((e) => e.type)).toEqual(["date", "email", "licence_number", "money", "date"]);
    expectOffsetsMatch(text, entities);
    const starts = entities.map((e) => e.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("resolves overlaps: email wins over a date-like local part", () => {
    const text = "Send to 2024-03-15@reports.example.com today";
    expect(extractEntities(text).map((e) => e.type)).toEqual(["email"]);
  });

  it("uses UTF-16 offsets that stay correct after non-ASCII text", () => {
    const text = "Café 🚀 — total ₹1,499 on 2 Jan 2025 → ops@café-x.io is invalid, ops@cafe-x.io ok";
    const entities = extractEntities(text);
    expect(entities.map((e) => e.text)).toEqual(["₹1,499", "2 Jan 2025", "ops@cafe-x.io"]);
    expectOffsetsMatch(text, entities);
  });

  it("filters by requested types and handles empty input", () => {
    expect(extractEntities("", ["date"])).toEqual([]);
    expect(extractEntities("$5 on 2024-01-01", ["money"]).map((e) => e.type)).toEqual(["money"]);
  });
});
