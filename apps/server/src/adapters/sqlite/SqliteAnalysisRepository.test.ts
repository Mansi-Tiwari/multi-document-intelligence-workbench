import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Analysis } from "@mdiw/shared";
import { IN_MEMORY, openDatabase } from "./database";
import { SqliteAnalysisRepository } from "./SqliteAnalysisRepository";

const DOC_A = "11111111-1111-4111-8111-111111111111";
const DOC_B = "22222222-2222-4222-8222-222222222222";
const DOC_C = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "55555555-5555-4555-8555-555555555555";

const uuid = (n: number, prefix = "a"): string =>
  `${prefix.repeat(8)}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const buildAnalysis = (id: string, createdAt: string): Analysis => ({
  id,
  instruction: "Compare payment terms and totals",
  provider: "mock",
  model: "mock-1",
  createdAt,
  fields: [
    { key: "total_amount", description: "Invoice total" },
    { key: "payment_terms", description: "Payment terms" },
  ],
  // Deliberately not sorted by id, to prove order comes from `position`.
  documents: [
    { documentId: DOC_C, filename: "c.pdf", summary: "Invoice C", relevance: 0.9 },
    { documentId: DOC_A, filename: "a.txt", summary: "Invoice A", relevance: 0.25 },
    { documentId: DOC_B, filename: "b.csv", summary: "Invoice B", relevance: 0 },
  ],
  findings: [
    {
      id: uuid(9, id.slice(0, 1)),
      scope: "cross_document",
      kind: "discrepancy",
      fieldKey: "total_amount",
      title: "Totals differ",
      detail: "C and A disagree",
      sources: [
        { documentId: DOC_C, value: "100", quote: "Total: 100" },
        { documentId: DOC_A, value: "120", quote: "Total: 120" },
        { documentId: DOC_B, value: null, quote: null },
      ],
    },
    {
      id: uuid(1, id.slice(0, 1)),
      scope: "document",
      kind: "field_value",
      fieldKey: "payment_terms",
      title: "Payment terms",
      detail: null,
      sources: [{ documentId: DOC_A, value: "30 days", quote: "Net 30" }],
    },
    {
      id: uuid(5, id.slice(0, 1)),
      scope: "document",
      kind: "key_fact",
      fieldKey: null,
      title: "Signed by Jane",
      detail: null,
      sources: [{ documentId: DOC_B, value: null, quote: "Signed: Jane" }],
    },
    {
      id: uuid(3, id.slice(0, 1)),
      scope: "cross_document",
      kind: "key_document",
      fieldKey: null,
      title: "c.pdf is the key document",
      detail: "Highest relevance",
      sources: [{ documentId: DOC_C, value: null, quote: null }],
    },
  ],
});

const CountSchema = z.object({ n: z.number() });
const count = (db: DatabaseSync, table: string): number =>
  CountSchema.parse(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n;
const CHILD_TABLES = ["analysis_fields", "analysis_documents", "findings", "finding_sources"];

describe("SqliteAnalysisRepository", () => {
  let db: DatabaseSync;
  let repo: SqliteAnalysisRepository;
  beforeEach(() => {
    db = openDatabase(IN_MEMORY);
    repo = new SqliteAnalysisRepository(db);
  });
  afterEach(() => {
    db.close();
  });

  it("round-trips an analysis with every collection in its original order", () => {
    const analysis = buildAnalysis(uuid(1), "2026-01-01T00:00:00.000Z");
    repo.save(analysis);
    expect(repo.findById(analysis.id)).toEqual(analysis);
    expect(repo.findById(uuid(2))).toBeNull();
  });

  it("lists summaries newest first with counts", () => {
    const older = buildAnalysis(uuid(1), "2026-01-01T00:00:00.000Z");
    const newer = buildAnalysis(uuid(1, "b"), "2026-02-01T00:00:00.000Z");
    repo.save(older);
    repo.save(newer);
    expect(repo.list()).toEqual([
      {
        id: newer.id,
        instruction: newer.instruction,
        provider: "mock",
        model: "mock-1",
        documentCount: 3,
        findingCount: 4,
        createdAt: newer.createdAt,
      },
      expect.objectContaining({ id: older.id }),
    ]);
  });

  it("cascades deletion of an analysis to its findings and sources", () => {
    const analysis = buildAnalysis(uuid(1), "2026-01-01T00:00:00.000Z");
    repo.save(analysis);
    db.prepare("DELETE FROM analyses WHERE id = ?").run(analysis.id);
    for (const table of CHILD_TABLES) expect(count(db, table)).toBe(0);
  });

  it("rejects a finding source that references a document outside the analysis, writing nothing", () => {
    const analysis = buildAnalysis(uuid(1), "2026-01-01T00:00:00.000Z");
    const [first, ...rest] = analysis.findings;
    if (first === undefined) throw new Error("fixture has findings");
    const bad: Analysis = {
      ...analysis,
      findings: [{ ...first, sources: [...first.sources, { documentId: OUTSIDER, value: null, quote: null }] }, ...rest],
    };
    expect(() => repo.save(bad)).toThrow(/not part of this analysis/);
    expect(count(db, "analyses")).toBe(0);
    for (const table of CHILD_TABLES) expect(count(db, table)).toBe(0);
  });

  it("rolls back every row when a database constraint fails mid-save", () => {
    const first = buildAnalysis(uuid(1), "2026-01-01T00:00:00.000Z");
    repo.save(first);
    // Valid on its own, but its last finding id collides with one already stored:
    // the analysis, fields, documents and earlier findings are inserted before the failure.
    const second = buildAnalysis(uuid(2), "2026-01-02T00:00:00.000Z");
    const lastExisting = first.findings.at(-1);
    if (lastExisting === undefined) throw new Error("fixture has findings");
    const clashing: Analysis = {
      ...second,
      findings: [...second.findings.slice(0, -1), { ...lastExisting }],
    };
    expect(() => repo.save(clashing)).toThrow(/UNIQUE constraint failed: findings.id/);
    expect(repo.findById(second.id)).toBeNull();
    expect(repo.list().map((a) => a.id)).toEqual([first.id]);
    expect(count(db, "findings")).toBe(first.findings.length);
    expect(count(db, "analysis_documents")).toBe(first.documents.length);
    expect(db.isTransaction).toBe(false);
  });

  it("validates the analysis before saving (document finding with two sources)", () => {
    const analysis = buildAnalysis(uuid(1), "2026-01-01T00:00:00.000Z");
    const docFinding = analysis.findings[1];
    if (docFinding === undefined) throw new Error("fixture has findings");
    const raw: unknown = {
      ...analysis,
      findings: [{ ...docFinding, sources: [...docFinding.sources, { documentId: DOC_B, value: null, quote: null }] }],
    };
    // Simulate a caller that bypassed the type system: save() must still reject it.
    const parsed = z.custom<Analysis>(() => true).parse(raw);
    expect(() => repo.save(parsed)).toThrow();
    expect(count(db, "analyses")).toBe(0);
  });
});
