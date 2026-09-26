import type { DatabaseSync } from "node:sqlite";
import type { DocumentSummary } from "@mdiw/shared";
import { StoredDocumentSchema, type StoredDocument } from "../../domain/document";
import type { DocumentRepository } from "../../ports/DocumentRepository";
import { DocumentSummaryRowSchema, StoredDocumentRowSchema } from "./rows";

const SUMMARY_COLUMNS = "id, filename, kind, mime_type, size_bytes, sha256, page_count, char_count, created_at";
const ALL_COLUMNS = `${SUMMARY_COLUMNS}, text`;

export class SqliteDocumentRepository implements DocumentRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(doc: StoredDocument): void {
    const d = StoredDocumentSchema.parse(doc);
    this.db
      .prepare(
        `INSERT INTO documents (${ALL_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.id, d.filename, d.kind, d.mimeType, d.sizeBytes, d.sha256, d.pageCount, d.charCount, d.createdAt, d.text);
  }

  findById(id: string): StoredDocument | null {
    const row = this.db.prepare(`SELECT ${ALL_COLUMNS} FROM documents WHERE id = ?`).get(id);
    return row === undefined ? null : StoredDocumentRowSchema.parse(row);
  }

  findManyByIds(ids: readonly string[]): StoredDocument[] {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    // One `?` per id: still a fully parameterized statement.
    const placeholders = unique.map(() => "?").join(", ");
    const rows = this.db.prepare(`SELECT ${ALL_COLUMNS} FROM documents WHERE id IN (${placeholders})`).all(...unique);
    const byId = new Map(rows.map((row) => StoredDocumentRowSchema.parse(row)).map((doc) => [doc.id, doc]));
    return ids.flatMap((id) => {
      const doc = byId.get(id);
      return doc === undefined ? [] : [doc];
    });
  }

  list(): DocumentSummary[] {
    return this.db
      .prepare(`SELECT ${SUMMARY_COLUMNS} FROM documents ORDER BY created_at DESC, rowid DESC`)
      .all()
      .map((row) => DocumentSummaryRowSchema.parse(row));
  }

  delete(id: string): boolean {
    const { changes } = this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
    return Number(changes) > 0;
  }

  findBySha256(sha256: string): DocumentSummary | null {
    const row = this.db
      .prepare(`SELECT ${SUMMARY_COLUMNS} FROM documents WHERE sha256 = ? ORDER BY created_at ASC, rowid ASC LIMIT 1`)
      .get(sha256);
    return row === undefined ? null : DocumentSummaryRowSchema.parse(row);
  }
}
