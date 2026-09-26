/**
 * Deterministic, regex-based entity extraction over a SINGLE document's text.
 *
 * Offsets are UTF-16 code-unit indices into the exact string passed in
 * (`start` inclusive, `end` exclusive), so `text.slice(start, end) === entity.text`
 * always holds. They are only meaningful against the stored, normalized text.
 */

export const ENTITY_TYPES = ["date", "money", "email", "licence_number"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface ExtractedEntity {
  readonly type: EntityType;
  /** Exact matched text; equals `source.slice(start, end)`. */
  readonly text: string;
  /** Start offset (inclusive), UTF-16 code units. */
  readonly start: number;
  /** End offset (exclusive), UTF-16 code units. */
  readonly end: number;
  /**
   * Canonical form, or null when the value is ambiguous:
   * date → `YYYY-MM-DD`, money → `USD 1234.56`, email → lowercase,
   * licence_number → uppercase id.
   */
  readonly normalized: string | null;
}

interface Candidate extends ExtractedEntity {
  readonly priority: number;
}

// Lower number wins when matches overlap.
const PRIORITY: Record<EntityType, number> = {
  email: 0,
  licence_number: 1,
  date: 2,
  money: 3,
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: ReadonlyMap<string, number> = new Map([
  ["january", 1], ["jan", 1],
  ["february", 2], ["feb", 2],
  ["march", 3], ["mar", 3],
  ["april", 4], ["apr", 4],
  ["may", 5],
  ["june", 6], ["jun", 6],
  ["july", 7], ["jul", 7],
  ["august", 8], ["aug", 8],
  ["september", 9], ["sept", 9], ["sep", 9],
  ["october", 10], ["oct", 10],
  ["november", 11], ["nov", 11],
  ["december", 12], ["dec", 12],
]);

// Longest alternatives first so "September" isn't matched as "Sep".
const MONTH_ALT = [...MONTHS.keys()].sort((a, b) => b.length - a.length).join("|");
const ORDINAL = "(?:st|nd|rd|th)?";

const ISO_DATE = /(?<![\w./-])(?<y>(?:19|20)\d{2})(?<sep>[-/.])(?<m>\d{1,2})\k<sep>(?<d>\d{1,2})(?![\w/-]|\.\d)/gd;
const NUMERIC_DATE = /(?<![\w./-])(?<a>\d{1,2})(?<sep>[-/.])(?<b>\d{1,2})\k<sep>(?<y>(?:19|20)\d{2})(?![\w/-]|\.\d)/gd;
const DAY_MONTH_YEAR = new RegExp(
  `(?<![\\w])(?<d>\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?(?<mon>${MONTH_ALT})\\.?,?\\s+(?<y>(?:19|20)\\d{2})(?!\\w)`,
  "gid",
);
const MONTH_DAY_YEAR = new RegExp(
  `(?<![\\w])(?<mon>${MONTH_ALT})\\.?\\s+(?<d>\\d{1,2})${ORDINAL},?\\s+(?<y>(?:19|20)\\d{2})(?!\\w)`,
  "gid",
);

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function* dateCandidates(text: string): Generator<Candidate> {
  for (const m of text.matchAll(ISO_DATE)) {
    const g = m.groups;
    if (!g?.y || !g.m || !g.d) continue;
    const normalized = isoDate(Number(g.y), Number(g.m), Number(g.d));
    if (normalized === null) continue; // not a real calendar date
    yield candidate("date", m, normalized);
  }

  for (const m of text.matchAll(NUMERIC_DATE)) {
    const g = m.groups;
    if (!g?.a || !g.b || !g.y) continue;
    const a = Number(g.a);
    const b = Number(g.b);
    const year = Number(g.y);
    // a/b could be day/month (EU) or month/day (US).
    const readings = new Set(
      [isoDate(year, b, a), isoDate(year, a, b)].filter((d): d is string => d !== null),
    );
    if (readings.size === 0) continue;
    const [only] = readings;
    yield candidate("date", m, readings.size === 1 && only !== undefined ? only : null);
  }

  for (const re of [DAY_MONTH_YEAR, MONTH_DAY_YEAR]) {
    for (const m of text.matchAll(re)) {
      const g = m.groups;
      if (!g?.mon || !g.d || !g.y) continue;
      const month = MONTHS.get(g.mon.toLowerCase());
      if (month === undefined) continue;
      const normalized = isoDate(Number(g.y), month, Number(g.d));
      if (normalized === null) continue;
      yield candidate("date", m, normalized);
    }
  }
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const CURRENCY_CODES = ["USD", "EUR", "GBP", "JPY", "INR", "CAD", "AUD", "CHF", "CNY"] as const;
const SYMBOLS: ReadonlyMap<string, string> = new Map([
  ["US$", "USD"],
  ["C$", "CAD"],
  ["A$", "AUD"],
  ["$", "USD"],
  ["€", "EUR"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["₹", "INR"],
]);
const CODE_ALT = CURRENCY_CODES.join("|");
const AMOUNT = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;
const AMOUNT_END = String.raw`(?!\d|[.,]\d)`;

// "$1,234.56", "-€50", "USD 1,200", "US$ 99.99"
const MONEY_PREFIX = new RegExp(
  String.raw`(?<![\w$€£¥₹])(?<sign>-)?(?<cur>US\$|C\$|A\$|[$€£¥₹]|(?:${CODE_ALT})(?=[\s\d]))\s?(?<amt>${AMOUNT})${AMOUNT_END}`,
  "gd",
);
// "1,234.56 EUR", "50 €"
const MONEY_SUFFIX = new RegExp(
  String.raw`(?<![\w.,$€£¥₹])(?<sign>-)?(?<amt>${AMOUNT})\s?(?<cur>${CODE_ALT}|[€£¥₹])(?![A-Za-z])`,
  "gd",
);

function currencyCode(raw: string): string | null {
  if ((CURRENCY_CODES as readonly string[]).includes(raw)) return raw;
  return SYMBOLS.get(raw) ?? null;
}

function* moneyCandidates(text: string): Generator<Candidate> {
  for (const re of [MONEY_PREFIX, MONEY_SUFFIX]) {
    for (const m of text.matchAll(re)) {
      const g = m.groups;
      if (!g?.cur || !g.amt) continue;
      const code = currencyCode(g.cur);
      if (code === null) continue;
      const amount = g.amt.replaceAll(",", "");
      yield candidate("money", m, `${code} ${g.sign ?? ""}${amount}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

const EMAIL = /(?<![\w.%+-])(?<local>[A-Za-z0-9._%+-]+)@(?<domain>[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,})(?![\w-]|\.[A-Za-z0-9])/gd;

function* emailCandidates(text: string): Generator<Candidate> {
  for (const m of text.matchAll(EMAIL)) {
    const local = m.groups?.local;
    if (!local || local.startsWith(".") || local.endsWith(".") || local.includes("..")) continue;
    yield candidate("email", m, m[0].toLowerCase());
  }
}

// ---------------------------------------------------------------------------
// Licence numbers
// ---------------------------------------------------------------------------

// Only labelled ids are extracted ("Licence No: AB-123456"); a bare alphanumeric
// string is too ambiguous. The entity's offsets cover the id, not the label.
const LICENCE = /\b(?:driver'?s\s+|driving\s+)?(?:licen[cs]e|lic\.)(?:\s+(?:no\.?|number|num\.?|id)|\s*#)?\s*[:#-]?\s*(?<id>[A-Z0-9][A-Z0-9-]{3,18}[A-Z0-9])(?![\w-])/gid;

function* licenceCandidates(text: string): Generator<Candidate> {
  for (const m of text.matchAll(LICENCE)) {
    const id = m.groups?.id;
    const span = m.indices?.groups?.id;
    if (!id || !span || !/\d/.test(id)) continue;
    const [start, end] = span;
    yield {
      type: "licence_number",
      text: text.slice(start, end),
      start,
      end,
      normalized: id.toUpperCase(),
      priority: PRIORITY.licence_number,
    };
  }
}

// ---------------------------------------------------------------------------

function candidate(type: EntityType, m: RegExpExecArray, normalized: string | null): Candidate {
  const start = m.index;
  const end = start + m[0].length;
  return { type, text: m[0], start, end, normalized, priority: PRIORITY[type] };
}

const EXTRACTORS: Record<EntityType, (text: string) => Generator<Candidate>> = {
  date: dateCandidates,
  money: moneyCandidates,
  email: emailCandidates,
  licence_number: licenceCandidates,
};

/**
 * Extract dates, money amounts, emails and licence numbers with character offsets.
 * Overlapping matches are resolved by priority (email > licence > date > money),
 * then by longer match. Results are sorted by `start`.
 */
export function extractEntities(
  text: string,
  types: readonly EntityType[] = ENTITY_TYPES,
): ExtractedEntity[] {
  const candidates = types.flatMap((type) => [...EXTRACTORS[type](text)]);
  candidates.sort(
    (a, b) => a.priority - b.priority || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );

  const kept: Candidate[] = [];
  for (const c of candidates) {
    if (kept.every((k) => c.end <= k.start || c.start >= k.end)) kept.push(c);
  }

  return kept
    .sort((a, b) => a.start - b.start)
    .map(({ type, text: matched, start, end, normalized }) => ({ type, text: matched, start, end, normalized }));
}
