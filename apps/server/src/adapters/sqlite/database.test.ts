import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { IN_MEMORY, openDatabase, withTransaction } from "./database";
import { MIGRATIONS } from "./schema";

const CountSchema = z.object({ n: z.number() });
const count = (db: DatabaseSync, table: string): number =>
  CountSchema.parse(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n;

const ANALYSIS = "44444444-4444-4444-8444-444444444444";
const DOC = "11111111-1111-4111-8111-111111111111";
const FINDING = "33333333-3333-4333-8333-333333333333";

const insertDocument = (db: DatabaseSync, overrides: { kind?: string } = {}) =>
  db
    .prepare(
      `INSERT INTO documents (id, filename, kind, mime_type, size_bytes, sha256, page_count, text, char_count, created_at)
       VALUES (?, 'a.txt', ?, 'text/plain', 5, ?, NULL, 'hello', 5, '2026-01-01T00:00:00.000Z')`,
    )
    .run(DOC, overrides.kind ?? "text", "a".repeat(64));

const insertAnalysisGraph = (db: DatabaseSync, opts: { relevance?: number; findingKind?: string } = {}) => {
  db.prepare(
    "INSERT INTO analyses (id, instruction, provider, model, created_at) VALUES (?, 'Compare', 'mock', 'm', '2026-01-01T00:00:00.000Z')",
  ).run(ANALYSIS);
  db.prepare("INSERT INTO analysis_fields (analysis_id, position, key, description) VALUES (?, 0, 'total', 'Total')").run(
    ANALYSIS,
  );
  db.prepare(
    "INSERT INTO analysis_documents (analysis_id, document_id, position, filename, summary, relevance) VALUES (?, ?, 0, 'a.txt', 's', ?)",
  ).run(ANALYSIS, DOC, opts.relevance ?? 0.5);
  db.prepare(
    "INSERT INTO findings (id, analysis_id, position, scope, kind, field_key, title, detail) VALUES (?, ?, 0, 'document', ?, 'total', 'T', NULL)",
  ).run(FINDING, ANALYSIS, opts.findingKind ?? "field_value");
  db.prepare(
    "INSERT INTO finding_sources (finding_id, analysis_id, document_id, position, value, quote) VALUES (?, ?, ?, 0, '1', 'q')",
  ).run(FINDING, ANALYSIS, DOC);
};

describe("openDatabase", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mdiw-db-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates parent directories, enables WAL and applies migrations idempotently", () => {
    const path = join(dir, "nested", "deeper", "app.db");
    const first = openDatabase(path);
    first.close();
    const second = openDatabase(path);
    const versions = second.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    expect(versions).toEqual(MIGRATIONS.map((m) => ({ version: m.version })));
    expect(second.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(second.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    second.close();
  });

  it("creates every table in memory", () => {
    const db = openDatabase(IN_MEMORY);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => z.object({ name: z.string() }).parse(row).name);
    expect(tables).toEqual([
      "analyses",
      "analysis_documents",
      "analysis_fields",
      "documents",
      "finding_sources",
      "findings",
      "schema_migrations",
    ]);
    db.close();
  });
});

describe("schema constraints", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = openDatabase(IN_MEMORY);
  });
  afterEach(() => {
    db.close();
  });

  it("rejects an unknown document kind", () => {
    expect(() => insertDocument(db, { kind: "docx" })).toThrow(/CHECK constraint failed/);
  });

  it("rejects relevance outside 0..1", () => {
    expect(() => insertAnalysisGraph(db, { relevance: 1.5 })).toThrow(/CHECK constraint failed/);
  });

  it("rejects a document-scope finding with a cross-document kind", () => {
    expect(() => insertAnalysisGraph(db, { findingKind: "discrepancy" })).toThrow(/CHECK constraint failed/);
  });

  it("rejects a finding source for a document outside the analysis", () => {
    insertAnalysisGraph(db);
    expect(() =>
      db
        .prepare(
          "INSERT INTO finding_sources (finding_id, analysis_id, document_id, position, value, quote) VALUES (?, ?, ?, 1, NULL, NULL)",
        )
        .run(FINDING, ANALYSIS, "55555555-5555-4555-8555-555555555555"),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("cascades analysis deletion to fields, documents, findings and sources", () => {
    insertAnalysisGraph(db);
    expect(count(db, "finding_sources")).toBe(1);
    db.prepare("DELETE FROM analyses WHERE id = ?").run(ANALYSIS);
    for (const table of ["analysis_fields", "analysis_documents", "findings", "finding_sources"]) {
      expect(count(db, table)).toBe(0);
    }
  });
});

describe("withTransaction", () => {
  it("commits on success and rolls back on error", () => {
    const db = openDatabase(IN_MEMORY);
    expect(
      withTransaction(db, () => {
        insertDocument(db);
        return "ok";
      }),
    ).toBe("ok");
    expect(count(db, "documents")).toBe(1);

    db.prepare("DELETE FROM documents").run();
    expect(() =>
      withTransaction(db, () => {
        insertDocument(db);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(count(db, "documents")).toBe(0);
    expect(db.isTransaction).toBe(false);
    db.close();
  });
});
