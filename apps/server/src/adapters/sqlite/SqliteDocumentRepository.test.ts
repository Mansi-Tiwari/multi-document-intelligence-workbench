import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStoredDocument, toDocumentSummary, type StoredDocument } from "../../domain/document";
import { IN_MEMORY, openDatabase } from "./database";
import { SqliteDocumentRepository } from "./SqliteDocumentRepository";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const MISSING = "99999999-9999-4999-8999-999999999999";

const makeDoc = (id: string, minute: number, overrides: Partial<StoredDocument> = {}): StoredDocument => ({
  ...createStoredDocument(
    {
      filename: `${id.slice(0, 4)}.txt`,
      kind: "text",
      mimeType: "text/plain",
      sizeBytes: 12,
      sha256: id.slice(0, 1).repeat(64),
      pageCount: null,
      text: "Total: 100 €",
    },
    id,
    new Date(Date.UTC(2026, 0, 1, 0, minute)),
  ),
  ...overrides,
});

describe("SqliteDocumentRepository", () => {
  let db: DatabaseSync;
  let repo: SqliteDocumentRepository;
  beforeEach(() => {
    db = openDatabase(IN_MEMORY);
    repo = new SqliteDocumentRepository(db);
  });
  afterEach(() => {
    db.close();
  });

  it("inserts and finds a document by id", () => {
    const doc = makeDoc(ID_A, 0, { kind: "pdf", mimeType: "application/pdf", pageCount: 3 });
    repo.insert(doc);
    expect(repo.findById(ID_A)).toEqual(doc);
    expect(repo.findById(MISSING)).toBeNull();
  });

  it("counts characters as code points", () => {
    expect(makeDoc(ID_A, 0).charCount).toBe(12);
  });

  it("rejects an invalid document before touching the database", () => {
    expect(() => repo.insert({ ...makeDoc(ID_A, 0), sha256: "short" })).toThrow();
    expect(repo.list()).toEqual([]);
  });

  it("findManyByIds preserves the requested order and omits unknown ids", () => {
    const [a, b, c] = [makeDoc(ID_A, 0), makeDoc(ID_B, 1), makeDoc(ID_C, 2)];
    [a, b, c].forEach((d) => repo.insert(d));
    expect(repo.findManyByIds([ID_C, MISSING, ID_A, ID_B])).toEqual([c, a, b]);
    expect(repo.findManyByIds([])).toEqual([]);
  });

  it("lists summaries newest first without text", () => {
    const [a, b, c] = [makeDoc(ID_A, 5), makeDoc(ID_B, 1), makeDoc(ID_C, 9)];
    [a, b, c].forEach((d) => repo.insert(d));
    const list = repo.list();
    expect(list).toEqual([c, a, b].map(toDocumentSummary));
    expect(list[0]).not.toHaveProperty("text");
  });

  it("finds by sha256", () => {
    const doc = makeDoc(ID_A, 0);
    repo.insert(doc);
    expect(repo.findBySha256(doc.sha256)).toEqual(toDocumentSummary(doc));
    expect(repo.findBySha256("f".repeat(64))).toBeNull();
  });

  it("deletes and reports whether a row was removed", () => {
    repo.insert(makeDoc(ID_A, 0));
    expect(repo.delete(ID_A)).toBe(true);
    expect(repo.delete(ID_A)).toBe(false);
    expect(repo.findById(ID_A)).toBeNull();
  });

  it("rejects corrupt rows on read instead of returning them", () => {
    db.prepare(
      `INSERT INTO documents (id, filename, kind, mime_type, size_bytes, sha256, page_count, text, char_count, created_at)
       VALUES ('not-a-uuid', 'x.txt', 'text', 'text/plain', 1, ?, NULL, 'x', 1, 'not-a-date')`,
    ).run("a".repeat(64));
    expect(() => repo.findById("not-a-uuid")).toThrow();
  });
});
