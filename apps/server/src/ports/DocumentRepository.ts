import type { DocumentSummary } from "@mdiw/shared";
import type { StoredDocument } from "../domain/document";

/**
 * Persistence for uploaded documents.
 *
 * Methods are synchronous: the only adapter is `node:sqlite`, which is synchronous,
 * and a synchronous port lets a service compose several calls inside one transaction.
 */
export interface DocumentRepository {
  insert(doc: StoredDocument): void;
  findById(id: string): StoredDocument | null;
  /** Returns the documents in the requested order; unknown ids are omitted. */
  findManyByIds(ids: readonly string[]): StoredDocument[];
  /** Newest first, without text. */
  list(): DocumentSummary[];
  /** Returns `true` if a document was deleted. */
  delete(id: string): boolean;
  findBySha256(sha256: string): DocumentSummary | null;
}
