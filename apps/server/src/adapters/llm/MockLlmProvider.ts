import {
  validateDocumentAnalysis,
  validatePlannedFields,
  type DocumentAnalysisOutput,
  type PlannedField,
} from "../../domain/llm";
import { extractEntities, type EntityType, type ExtractedEntity } from "../../domain/regexEntities";
import type { AnalyzeDocumentInput, LlmDocument, LlmProvider, PlanFieldsInput } from "../../ports/LlmProvider";
import { generateValidated } from "./withValidationRetry";

/**
 * Deterministic, offline provider used when no API key is configured.
 * Its raw output is `unknown` and goes through the same validation as Claude's,
 * so mock bugs surface as validation errors too.
 */

const MAX_MOCK_FIELDS = 8;
const MAX_KEY_FACTS = 5;
const MAX_SUMMARY_CHARS = 300;

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
  { key: "date", description: "The main date stated in the document." },
  { key: "total_amount", description: "The total amount of money stated in the document." },
  { key: "email", description: "The contact email address in the document." },
  { key: "licence_number", description: "The licence number stated in the document." },
  { key: "parties", description: "The people or organisations the document is between." },
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
  const phrases = instruction.split(/[,;&]|\band\b|\n/iu);
  const fields: PlannedField[] = [];
  for (const phrase of phrases) {
    const words = phraseWords(phrase);
    if (words.length === 0 || words.length > 6) continue;
    const key = slugify(words.join(" "));
    if (key === "" || fields.some((field) => field.key === key)) continue;
    fields.push({ key, description: `The ${words.join(" ")} as stated in the document.` });
    if (fields.length === MAX_MOCK_FIELDS) break;
  }
  return fields.length > 0 ? fields : [...GENERIC_FIELDS];
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

function lineOf(text: string, entity: ExtractedEntity): string {
  const start = text.lastIndexOf("\n", entity.start - 1) + 1;
  const end = text.indexOf("\n", entity.end);
  return text.slice(start, end === -1 ? text.length : end).toLowerCase();
}

function matchEntity(key: string, text: string, entities: readonly ExtractedEntity[]): FieldMatch | null {
  const hint = ENTITY_HINTS.find(({ pattern }) => pattern.test(key));
  if (hint === undefined) return null;
  const ofType = entities.filter((entity) => entity.type === hint.type);
  // Prefer an entity on a line that mentions the field's words ("Total: $5" for total_amount).
  const words = key
    .split("_")
    .filter((word) => word.length > 2)
    .map((word) => new RegExp(`\\b${word}\\b`, "u"));
  const preferred = ofType.find((entity) => words.some((word) => word.test(lineOf(text, entity))));
  const entity = preferred ?? ofType[0];
  if (entity === undefined) return null;
  return { value: entity.normalized ?? entity.text, quote: entity.text };
}

function summarize(text: string): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  const sentences = flat.match(/[^.!?]+[.!?]+/gu) ?? [];
  const firstTwo = sentences.slice(0, 2).join("").trim();
  const summary = firstTwo === "" ? flat : firstTwo;
  if (summary === "") return "The document has no readable text.";
  return summary.length <= MAX_SUMMARY_CHARS ? summary : `${summary.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…`;
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

/** Raw (unvalidated) mock analysis of ONE document. */
export function analyzeMockDocument(
  instruction: string,
  fields: readonly PlannedField[],
  document: LlmDocument,
): unknown {
  const lines = document.text.split(/\r?\n/u);
  const entities = extractEntities(document.text);
  return {
    summary: summarize(document.text),
    relevance: relevance(instruction, document.text),
    fields: fields.map(({ key }) => {
      const match = matchLabelLine(key, lines) ?? matchEntity(key, document.text, entities);
      return { key, value: match?.value ?? null, quote: match?.quote ?? null };
    }),
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
