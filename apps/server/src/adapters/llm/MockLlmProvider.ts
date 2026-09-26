import {
  validateDocumentAnalysis,
  validatePlannedFields,
  type DocumentAnalysisOutput,
  type PlannedField,
} from "../../domain/llm";
import { joinList } from "@mdiw/shared";
import { extractEntities, type EntityType, type ExtractedEntity } from "../../domain/regexEntities";
import type { AnalyzeDocumentInput, LlmDocument, LlmProvider, PlanFieldsInput } from "../../ports/LlmProvider";
import {
  cellQuote,
  columnForKey,
  compareWithOthers,
  describeProfile,
  detectSubject,
  findSubjectRows,
  formatNumber,
  parseNumber,
  parseRenderedTable,
  periodDivisor,
  profileColumn,
  subjectName,
  type ParsedTable,
} from "./mockTable";
import { generateValidated } from "./withValidationRetry";

/**
 * Deterministic, offline provider used when no API key is configured.
 * Its raw output is `unknown` and goes through the same validation as Claude's,
 * so mock bugs surface as validation errors too.
 */

const MAX_MOCK_FIELDS = 8;
const MAX_KEY_FACTS = 5;
const MAX_SUMMARY_CHARS = 600;

const LEADING_VERBS = new Set([
  "compare", "extract", "find", "list", "check", "identify", "get", "show", "summarize", "summarise",
  "pull", "determine", "review", "analyze", "analyse", "give", "tell", "report", "collect", "gather",
  "locate", "verify", "what", "which", "are", "is", "me", "us",
]);
const STOP_WORDS = new Set([
  "the", "a", "an", "all", "any", "each", "every", "their", "its", "these", "those", "this", "that",
  "of", "in", "from", "for", "across", "between", "document", "documents", "file", "files", "doc", "docs",
]);

export const GENERIC_FIELDS: readonly PlannedField[] = [
  { key: "date", description: "Date" },
  { key: "total_amount", description: "Total amount" },
  { key: "email", description: "Email" },
  { key: "licence_number", description: "Licence number" },
  { key: "parties", description: "Parties" },
];

/** Lowercase snake_case, starting with a letter, at most 64 characters. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^[^a-z]+/u, "")
    .slice(0, 64)
    .replace(/_+$/u, "");
}

function phraseWords(phrase: string): string[] {
  const words = phrase.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "");
  let start = 0;
  while (start < words.length && LEADING_VERBS.has(words[start] ?? "")) start++;
  return words.slice(start).filter((word) => !STOP_WORDS.has(word));
}

export function planMockFields(instruction: string): PlannedField[] {
  // "… of riya with other employees" names a subject, not a field.
  const phrases = detectSubject(instruction).fieldsPart.split(/[,;&]|\band\b|\n/iu);
  const fields: PlannedField[] = [];
  for (const phrase of phrases) {
    const words = phraseWords(phrase);
    if (words.length === 0 || words.length > 6) continue;
    const key = slugify(words.join(" "));
    if (key === "" || fields.some((field) => field.key === key)) continue;
    fields.push({ key, description: labelFromPhrase(phrase) });
    if (fields.length === MAX_MOCK_FIELDS) break;
  }
  return fields.length > 0 ? fields : [...GENERIC_FIELDS];
}

/** The phrase as the user wrote it, minus leading verbs: " date of birth" → "Date of birth". */
function labelFromPhrase(phrase: string): string {
  const words = phrase.trim().split(/\s+/u).filter((word) => word !== "");
  let start = 0;
  const skip = (word: string) => LEADING_VERBS.has(word) || word === "the" || word === "a" || word === "an";
  while (start < words.length && skip((words[start] ?? "").toLowerCase())) start++;
  const label = words.slice(start).join(" ").replace(/[?.!:]+$/u, "");
  return capitalize(label).slice(0, 300);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type FieldMatch = { value: string; quote: string };

const LABEL_LINE = /^\s*([^:\n]{1,80}?)\s*:\s*(\S.*?)\s*$/u;

function matchLabelLine(key: string, lines: readonly string[]): FieldMatch | null {
  const candidates: { rank: number; match: FieldMatch }[] = [];
  for (const line of lines) {
    const m = LABEL_LINE.exec(line);
    const label = m?.[1];
    const value = m?.[2];
    if (label === undefined || value === undefined) continue;
    const slug = slugify(label);
    if (slug === "") continue;
    const rank = slug === key ? 0 : slug.includes(key) ? 1 : slug.length >= 3 && key.includes(slug) ? 2 : -1;
    if (rank >= 0) candidates.push({ rank, match: { value, quote: line.trim() } });
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.match ?? null;
}

const ENTITY_HINTS: readonly { pattern: RegExp; type: EntityType }[] = [
  { pattern: /email|e_mail/u, type: "email" },
  { pattern: /licen[cs]e/u, type: "licence_number" },
  { pattern: /date|dated|due|expir|issued/u, type: "date" },
  { pattern: /amount|total|price|cost|fee|sum|balance|payment/u, type: "money" },
];

/** Key words that only name the entity type, not which one ("date", "amount"). */
const GENERIC_KEY_WORDS: ReadonlySet<string> = new Set([
  "email", "mail", "licence", "license", "number", "date", "dated",
  "amount", "total", "price", "cost", "fee", "sum", "value",
]);

function lineOf(text: string, entity: ExtractedEntity): string {
  const start = text.lastIndexOf("\n", entity.start - 1) + 1;
  const end = text.indexOf("\n", entity.end);
  return text.slice(start, end === -1 ? text.length : end).toLowerCase();
}

function matchEntity(key: string, text: string, entities: readonly ExtractedEntity[]): FieldMatch | null {
  const hint = ENTITY_HINTS.find(({ pattern }) => pattern.test(key));
  if (hint === undefined) return null;
  const ofType = entities.filter((entity) => entity.type === hint.type);
  const toPatterns = (words: readonly string[]) => words.map((word) => new RegExp(`\\b${word}\\b`, "u"));
  const words = key.split("_").filter((word) => word.length > 2);
  // Words that pin down WHICH date/amount is meant ("birth" in date_birth). When a key
  // has any, an entity only counts on a line that mentions one: a statement's first
  // transaction date is not a date of birth.
  const specific = toPatterns(words.filter((word) => !GENERIC_KEY_WORDS.has(word)));
  if (specific.length > 0) {
    const entity = ofType.find((e) => specific.some((word) => word.test(lineOf(text, e))));
    return entity === undefined ? null : { value: entity.normalized ?? entity.text, quote: entity.text };
  }
  // Otherwise prefer an entity on a line that mentions the field's words ("Total: $5" for total_amount).
  const all = toPatterns(words);
  const preferred = ofType.find((entity) => all.some((word) => word.test(lineOf(text, entity))));
  const entity = preferred ?? ofType[0];
  if (entity === undefined) return null;
  return { value: entity.normalized ?? entity.text, quote: entity.text };
}

const KIND_LABEL: Record<LlmDocument["kind"], string> = { pdf: "PDF", text: "text file", csv: "CSV table" };

/** What the document is: its title line (sentence-cased) or, for CSV, its shape. */
function describeDocument(document: LlmDocument, lines: readonly string[]): string {
  if (document.kind === "csv") {
    const rows = lines.filter((line) => line.startsWith("Row ")).length;
    const columns = lines.find((line) => line.startsWith("Columns: "))?.slice("Columns: ".length) ?? "";
    return `A table with ${rows} ${rows === 1 ? "row" : "rows"}${columns === "" ? "" : ` (columns: ${columns})`}`;
  }
  const first = (lines.map((line) => line.replace(/^#+\s*/u, "").trim()).find((line) => line !== "") ?? "").replace(/[.!]+$/u, "");
  // Only a short heading-like first line counts as a title, not a sentence or a "Label: value" line.
  if (first === "" || first.length > 60 || first.includes(":") || /[.!?]\s/u.test(first)) return `A ${KIND_LABEL[document.kind]}`;
  const title = first === first.toUpperCase() ? capitalize(first.toLowerCase()) : first;
  return `${title} (${KIND_LABEL[document.kind]})`;
}

/**
 * Plain-language summary built from what was actually found:
 * "Rental application form (text file). It states name Jane Doe and email …. It does not mention …"
 */
function summarize(
  document: LlmDocument,
  lines: readonly string[],
  fields: readonly PlannedField[],
  values: readonly (string | null)[],
): string {
  const lower = (label: string) => (label === label.toUpperCase() ? label : label.charAt(0).toLowerCase() + label.slice(1));
  const found: string[] = [];
  const missing: string[] = [];
  fields.forEach((field, index) => {
    const value = values[index] ?? null;
    if (value === null) missing.push(lower(field.description));
    else found.push(`${lower(field.description)} ${value}`);
  });

  const parts = [`${describeDocument(document, lines)}.`];
  if (document.text.trim() === "") return "The document has no readable text.";
  if (found.length > 0) parts.push(`It states ${joinList(found)}.`);
  if (missing.length > 0) {
    parts.push(found.length > 0 ? `It does not mention ${joinList(missing, "or")}.` : "It does not state any of the requested points.");
  }
  const summary = parts.join(" ");
  if (summary.length <= MAX_SUMMARY_CHARS) return summary;
  const cut = summary.slice(0, MAX_SUMMARY_CHARS - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

function keyFacts(lines: readonly string[]): { fact: string; quote: string }[] {
  const facts: { fact: string; quote: string }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.length > 500) continue;
    if (!/\d/u.test(line) && extractEntities(line).length === 0) continue;
    facts.push({ fact: line, quote: line });
    if (facts.length === MAX_KEY_FACTS) break;
  }
  return facts;
}

function relevance(instruction: string, text: string): number {
  const words = [...new Set(instruction.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3))];
  if (words.length === 0) return 0;
  const lowerText = text.toLowerCase();
  const found = words.filter((word) => lowerText.includes(word)).length;
  return Math.min(1, Math.max(0, Math.round((found / words.length) * 100) / 100));
}

const MAX_TABLE_FACTS = 8;
const MAX_TABLE_SUMMARY_CHARS = 1500;

/**
 * A CSV table is analysed as a whole: requested fields map to columns. With a
 * subject in the instruction ("of riya with other employees") the values come from
 * that subject's row and key facts compare it with the other rows; without one,
 * each field describes its whole column (never just the first row).
 */
function analyzeMockTable(
  instruction: string,
  fields: readonly PlannedField[],
  document: LlmDocument,
  table: ParsedTable,
): unknown {
  const { subject } = detectSubject(instruction);
  const subjectRows = subject === null ? [] : findSubjectRows(table, subject);
  const focus = subjectRows[0] ?? (subject === null && table.rows.length === 1 ? table.rows[0] : undefined);
  const name = focus !== undefined && subject !== null ? subjectName(focus, subject) : null;

  const matched = fields.map(({ key }) => {
    const none = { key, value: null, quote: null };
    const column = columnForKey(table, key);
    if (column === null || (subject !== null && focus === undefined)) return none;

    if (focus !== undefined) {
      const raw = focus.cells.get(column) ?? "";
      const quote = cellQuote(focus, column);
      if (raw === "" || quote === null) return none;
      const divisor = periodDivisor(key, column);
      const n = parseNumber(raw);
      const value =
        divisor > 1 && n !== null ? `${formatNumber(n / divisor)} (derived: ${column} ${formatNumber(n)} ÷ ${divisor})` : raw;
      return { key, value, quote };
    }

    const profile = profileColumn(table, column);
    if (profile.kind === "empty") return none;
    if (profile.kind === "constant") {
      const row = table.rows.find((r) => cellQuote(r, column) !== null);
      return { key, value: profile.value, quote: row === undefined ? null : cellQuote(row, column) };
    }
    // An aggregate across rows is our judgement, not a quote: no quote → labelled "AI".
    return { key, value: `${column}: ${describeProfile(profile)}`, quote: null };
  });

  const lower = (label: string) => (label === label.toUpperCase() ? label : label.charAt(0).toLowerCase() + label.slice(1));
  const found = fields.flatMap((f, i) => {
    const value = matched[i]?.value ?? null;
    return value === null ? [] : [`${lower(f.description)} ${value}`];
  });
  const missing = fields.filter((_, i) => matched[i]?.value === null).map((f) => lower(f.description));
  const profiles = table.columns.map((column) => profileColumn(table, column));

  const parts = [`A table of ${table.rows.length} ${table.rows.length === 1 ? "row" : "rows"} and ${table.columns.length} columns (${table.columns.join(", ")}).`];
  const facts: { fact: string; quote: string | null }[] = [];

  if (subject !== null && focus === undefined) {
    parts.push(`${capitalize(subject)} does not appear in this table.`);
  } else if (focus !== undefined && name !== null) {
    parts.push(`${name} is row ${focus.index}${found.length > 0 ? `: ${joinList(found)}` : ""}.`);
    // Numbers first (salary, rating), then dates, then categories: the most telling comparisons lead.
    const order = { number: 0, date: 1, category: 2, constant: 3, unique: 4, empty: 5 };
    const columns = [...table.columns].sort(
      (a, b) => order[profileColumn(table, a).kind] - order[profileColumn(table, b).kind],
    );
    for (const column of columns) {
      const sentence = compareWithOthers(table, focus, column, name);
      if (sentence !== null && facts.length < MAX_TABLE_FACTS) facts.push({ fact: sentence, quote: focus.line });
    }
    const comparisons = facts.slice(0, 3).map((f) => f.fact);
    if (comparisons.length > 0) parts.push(`Compared with the other ${table.rows.length - 1} rows: ${comparisons.join(" ")}`);
  } else {
    const described = profiles.filter((p) => p.kind !== "empty" && p.kind !== "unique");
    for (const p of described) {
      if (facts.length < MAX_TABLE_FACTS) facts.push({ fact: `${p.column}: ${describeProfile(p)}.`, quote: null });
    }
    if (described.length > 0) parts.push(described.slice(0, 5).map((p) => `${p.column}: ${describeProfile(p)}`).join("; ") + ".");
  }

  if (missing.length > 0 && !(subject !== null && focus === undefined)) {
    parts.push(`The table has no column for ${joinList(missing, "or")}.`);
  }

  let summary = parts.join(" ");
  if (summary.length > MAX_TABLE_SUMMARY_CHARS) {
    const cut = summary.slice(0, MAX_TABLE_SUMMARY_CHARS - 1);
    summary = `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
  }

  return {
    summary,
    relevance: subject !== null ? (focus !== undefined ? 1 : 0.1) : relevance(instruction, document.text),
    fields: matched,
    keyFacts: facts,
  };
}

/** Raw (unvalidated) mock analysis of ONE document. */
export function analyzeMockDocument(
  instruction: string,
  fields: readonly PlannedField[],
  document: LlmDocument,
): unknown {
  const table = document.kind === "csv" ? parseRenderedTable(document.text) : null;
  if (table !== null && table.rows.length > 0) return analyzeMockTable(instruction, fields, document, table);

  const lines = document.text.split(/\r?\n/u);
  const entities = extractEntities(document.text);
  const matched = fields.map(({ key }) => {
    const match = matchLabelLine(key, lines) ?? matchEntity(key, document.text, entities);
    return { key, value: match?.value ?? null, quote: match?.quote ?? null };
  });
  return {
    summary: summarize(document, lines, fields, matched.map((m) => m.value)),
    relevance: relevance(instruction, document.text),
    fields: matched,
    keyFacts: keyFacts(lines),
  };
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock";

  planFields({ instruction }: PlanFieldsInput): Promise<PlannedField[]> {
    return generateValidated({
      attempt: () => Promise.resolve<unknown>({ fields: planMockFields(instruction) }),
      validate: validatePlannedFields,
    });
  }

  analyzeDocument({ instruction, fields, document }: AnalyzeDocumentInput): Promise<DocumentAnalysisOutput> {
    return generateValidated({
      attempt: () => Promise.resolve(analyzeMockDocument(instruction, fields, document)),
      validate: (raw) => validateDocumentAnalysis(raw, { fields, documentText: document.text }),
    });
  }
}
