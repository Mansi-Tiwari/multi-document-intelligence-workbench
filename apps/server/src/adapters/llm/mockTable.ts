/**
 * Table understanding for the offline mock provider. Works on the text produced by
 * the CSV extractor ("Columns: a, b" + "Row N: a=v; b=v"), i.e. ONE document.
 *
 * - profiles every column (numbers → range/average, dates → earliest/latest,
 *   categories → top values, identifiers → count), so a table is summarised as a
 *   whole instead of by its first row;
 * - when the instruction is about one subject ("… of riya with other employees"),
 *   finds that subject's row and compares it with the other rows.
 */
import { joinList } from "@mdiw/shared";

export interface TableRow {
  /** The exact "Row N: …" line (quotable verbatim). */
  line: string;
  index: number;
  cells: ReadonlyMap<string, string>;
}

export interface ParsedTable {
  columns: readonly string[];
  rows: readonly TableRow[];
}

/** Parses the CSV extractor's rendering. Returns null for non-table text. */
export function parseRenderedTable(text: string): ParsedTable | null {
  const lines = text.split("\n");
  const header = lines.find((line) => line.startsWith("Columns: "));
  if (header === undefined) return null;
  const columns = header.slice("Columns: ".length).split(", ");
  const rows: TableRow[] = [];
  for (const line of lines) {
    const m = /^Row (\d+): (.*)$/u.exec(line);
    if (!m?.[1] || m[2] === undefined) continue;
    rows.push({ line, index: Number(m[1]), cells: parseCells(m[2], columns) });
  }
  return { columns, rows };
}

/** Splits "a=1; b=x; y" knowing the column order, so values may contain "; ". */
function parseCells(body: string, columns: readonly string[]): Map<string, string> {
  const cells = new Map<string, string>();
  let rest = body;
  columns.forEach((column, i) => {
    const prefix = `${column}=`;
    if (!rest.startsWith(prefix)) return;
    rest = rest.slice(prefix.length);
    const next = columns[i + 1];
    const end = next === undefined ? -1 : rest.indexOf(`; ${next}=`);
    const value = end === -1 ? rest : rest.slice(0, end);
    cells.set(column, value.trim());
    rest = end === -1 ? "" : rest.slice(end + 2);
  });
  return cells;
}

/** The verbatim "col=value" segment of a row, usable as a quote. */
export function cellQuote(row: TableRow, column: string): string | null {
  const value = row.cells.get(column);
  return value === undefined || value === "" ? null : `${column}=${value}`;
}

// ---------------------------------------------------------------------------
// Column profiles
// ---------------------------------------------------------------------------

export type ColumnProfile =
  | { column: string; kind: "empty" }
  | { column: string; kind: "constant"; value: string; count: number }
  | { column: string; kind: "number"; min: number; max: number; average: number; count: number }
  | { column: string; kind: "date"; earliest: string; latest: string; count: number }
  | { column: string; kind: "category"; top: { value: string; count: number }[]; distinct: number; count: number }
  | { column: string; kind: "unique"; examples: string[]; count: number };

export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s,$€£¥₹]|INR|USD|EUR|GBP/giu, "");
  if (!/^-?\d+(\.\d+)?$/u.test(cleaned)) return null;
  return Number(cleaned);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export function profileColumn(table: ParsedTable, column: string): ColumnProfile {
  const values = table.rows.map((r) => r.cells.get(column) ?? "").filter((v) => v !== "");
  if (values.length === 0) return { column, kind: "empty" };
  const distinct = new Map<string, number>();
  for (const v of values) distinct.set(v, (distinct.get(v) ?? 0) + 1);
  const [only] = distinct.keys();
  if (distinct.size === 1 && only !== undefined) return { column, kind: "constant", value: only, count: values.length };

  const numbers = values.map(parseNumber);
  if (numbers.every((n): n is number => n !== null)) {
    const sum = numbers.reduce((a, b) => a + b, 0);
    return { column, kind: "number", min: Math.min(...numbers), max: Math.max(...numbers), average: sum / numbers.length, count: values.length };
  }
  if (values.every((v) => ISO_DATE.test(v))) {
    const sorted = [...values].sort();
    return { column, kind: "date", earliest: sorted[0] ?? "", latest: sorted[sorted.length - 1] ?? "", count: values.length };
  }
  if (distinct.size === values.length) return { column, kind: "unique", examples: values.slice(0, 2), count: values.length };
  const top = [...distinct.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
  return { column, kind: "category", top, distinct: distinct.size, count: values.length };
}

/** Whole numbers for anything ≥ 100 (salaries, amounts); one decimal for small values (ratings). */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : 1 });
}

/** e.g. "from 450,000 to 2,400,000 (average 1,120,000)". */
export function describeProfile(p: ColumnProfile): string {
  switch (p.kind) {
    case "empty":
      return "empty";
    case "constant":
      return `always ${p.value}`;
    case "number":
      return `from ${formatNumber(p.min)} to ${formatNumber(p.max)} (average ${formatNumber(p.average)})`;
    case "date":
      return `from ${p.earliest} to ${p.latest}`;
    case "unique":
      return `${p.count} different values (e.g. ${p.examples.join(", ")})`;
    case "category": {
      const shown = p.top.slice(0, 3).map((t) => `${t.value} (${t.count})`);
      const more = p.distinct - shown.length;
      return more > 0 ? `${shown.join(", ")} and ${more} more` : joinList(shown);
    }
  }
}

// ---------------------------------------------------------------------------
// Subject ("of riya with other employees")
// ---------------------------------------------------------------------------

const SUBJECT_CLAUSE =
  /\b(?:of|for|about)\s+([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*)?)\s+(?:with|against|to|versus|vs\.?)\s+(?:the\s+)?(?:other|rest|all|remaining|everyone|others)\b.*$/iu;
const TRAILING_OTHERS = /\s+(?:with|against|compared\s+to|versus|vs\.?)\s+(?:the\s+)?(?:other|rest|all|remaining|everyone|others)\b.*$/iu;

/**
 * Splits "Compare name and salary of riya with other employees" into the subject
 * ("riya") and the instruction without the subject clause ("Compare name and salary").
 */
export function detectSubject(instruction: string): { subject: string | null; fieldsPart: string } {
  const m = SUBJECT_CLAUSE.exec(instruction);
  if (m?.[1] && m.index !== undefined) {
    return { subject: m[1].trim(), fieldsPart: instruction.slice(0, m.index).trim() };
  }
  return { subject: null, fieldsPart: instruction.replace(TRAILING_OTHERS, "").trim() };
}

/** Rows where some cell contains every word of the subject (case-insensitive, whole words). */
export function findSubjectRows(table: ParsedTable, subject: string): TableRow[] {
  const words = subject.toLowerCase().split(/\s+/u).filter((w) => w !== "");
  const matches = (cell: string) => {
    const tokens = new Set(cell.toLowerCase().split(/[^\p{L}\p{N}]+/u));
    return words.every((w) => tokens.has(w));
  };
  return table.rows.filter((row) => [...row.cells.values()].some(matches));
}

/** A readable name for the subject row: its name-like cell, else the subject as typed. */
export function subjectName(row: TableRow, subject: string): string {
  for (const [column, value] of row.cells) {
    if (/name/iu.test(column) && value.toLowerCase().includes(subject.toLowerCase())) return value;
  }
  return subject.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** One sentence comparing the subject's value in `column` with the other rows. */
export function compareWithOthers(table: ParsedTable, row: TableRow, column: string, name: string): string | null {
  const value = row.cells.get(column);
  if (value === undefined || value === "") return null;
  const others = table.rows.filter((r) => r !== row);
  if (others.length === 0) return null;
  const label = column.replaceAll("_", " ");

  const own = parseNumber(value);
  const otherNumbers = others.map((r) => parseNumber(r.cells.get(column) ?? ""));
  if (own !== null && otherNumbers.every((n): n is number => n !== null)) {
    const average = otherNumbers.reduce((a, b) => a + b, 0) / otherNumbers.length;
    const rank = otherNumbers.filter((n) => n > own).length + 1;
    const relation = own > average ? "above" : own < average ? "below" : "equal to";
    return `${name}'s ${label} is ${formatNumber(own)}, ${relation} the average of the other ${others.length} rows (${formatNumber(average)}); ranked ${rank} of ${table.rows.length} from highest.`;
  }

  if (ISO_DATE.test(value)) {
    const earlier = others.filter((r) => (r.cells.get(column) ?? "") < value).length;
    return `${name}'s ${label} is ${value}; ${earlier} of the other ${others.length} rows are earlier.`;
  }

  const same = others.filter((r) => r.cells.get(column) === value).length;
  const profile = profileColumn(table, column);
  if (profile.kind === "unique" || profile.kind === "empty") return null;
  return same === 0
    ? `${name} is the only row with ${label} ${value}.`
    : `${name}'s ${label} is ${value}, shared with ${same} of the other ${others.length} rows.`;
}

// ---------------------------------------------------------------------------
// Matching requested fields to columns
// ---------------------------------------------------------------------------

const SYNONYMS: readonly (readonly string[])[] = [
  ["income", "salary", "pay", "wage", "earnings", "ctc"],
  ["email", "mail", "e_mail"],
  ["name", "full_name", "employee_name", "account_holder", "holder"],
  ["dob", "birth", "birthday", "date_of_birth"],
  ["licence", "license"],
];

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
}

function related(a: string, b: string): boolean {
  return SYNONYMS.some((group) => group.some((w) => a.includes(w)) && group.some((w) => b.includes(w)));
}

/** Column names too generic to answer a more specific key ("date" is not "date of birth"). */
const GENERIC_COLUMNS = new Set(["date", "number", "no", "amount", "value", "total", "id", "type", "description", "notes"]);

/** The column that answers a field key, if any. */
export function columnForKey(table: ParsedTable, key: string): string | null {
  const scored = table.columns.map((column) => {
    const c = slug(column);
    const contains = c.includes(key) || (c.length >= 4 && !GENERIC_COLUMNS.has(c) && key.includes(c));
    const score = c === key ? 3 : contains ? 2 : !GENERIC_COLUMNS.has(c) && related(c, key) ? 1 : 0;
    return { column, score };
  });
  const best = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)[0];
  return best?.column ?? null;
}

/**
 * A monthly figure asked for, but the table holds an annual one ("monthly income" vs
 * "annual_salary_inr"): returns the divisor to convert, else 1.
 */
export function periodDivisor(key: string, column: string): number {
  const c = slug(column);
  return key.includes("monthly") && (c.includes("annual") || c.includes("yearly") || c.includes("per_year")) ? 12 : 1;
}
