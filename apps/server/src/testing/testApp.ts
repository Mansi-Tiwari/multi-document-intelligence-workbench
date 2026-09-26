import { randomUUID } from "node:crypto";
import type { UploadLimits } from "@mdiw/shared";
import { createApp } from "../app";
import type { AppOptions } from "../app";
import { createDefaultExtractionService } from "../adapters/extractors";
import { IN_MEMORY, openDatabase } from "../adapters/sqlite/database";
import { SqliteDocumentRepository } from "../adapters/sqlite/SqliteDocumentRepository";
import { DocumentService } from "../services/DocumentService";

export const TEST_ORIGIN = "http://localhost:5173";

/** Real adapters over an in-memory database; no rate limiting. */
export function buildTestApp(overrides: Partial<Omit<AppOptions, "services">> & { uploadLimits?: UploadLimits } = {}) {
  const db = openDatabase(IN_MEMORY);
  const documents = new SqliteDocumentRepository(db);
  const documentService = new DocumentService({
    repository: documents,
    extractor: createDefaultExtractionService({ timeoutMs: 5_000 }),
    newId: randomUUID,
    now: () => new Date(),
    ...(overrides.uploadLimits === undefined ? {} : { limits: overrides.uploadLimits }),
  });
  const app = createApp({
    cors: { origins: [TEST_ORIGIN] },
    rateLimit: false,
    ...overrides,
    services: { documents: documentService },
  });
  return { app, db, documents };
}
