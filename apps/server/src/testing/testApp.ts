import { randomUUID } from "node:crypto";
import type { UploadLimits } from "@mdiw/shared";
import { createApp } from "../app";
import type { AppOptions } from "../app";
import { createDefaultExtractionService } from "../adapters/extractors";
import { MockLlmProvider } from "../adapters/llm/MockLlmProvider";
import { IN_MEMORY, openDatabase } from "../adapters/sqlite/database";
import { SqliteAnalysisRepository } from "../adapters/sqlite/SqliteAnalysisRepository";
import { SqliteDocumentRepository } from "../adapters/sqlite/SqliteDocumentRepository";
import type { LlmProvider } from "../ports/LlmProvider";
import { AnalysisService } from "../services/AnalysisService";
import { DocumentService } from "../services/DocumentService";

export const TEST_ORIGIN = "http://localhost:5173";

export type TestAppOverrides = Partial<Omit<AppOptions, "services">> & {
  uploadLimits?: UploadLimits;
  /** Defaults to the offline mock provider. */
  llm?: LlmProvider;
};

/** Real adapters over an in-memory database; no rate limiting. */
export function buildTestApp(overrides: TestAppOverrides = {}) {
  const { llm = new MockLlmProvider(), ...appOverrides } = overrides;
  const db = openDatabase(IN_MEMORY);
  const documents = new SqliteDocumentRepository(db);
  const analyses = new SqliteAnalysisRepository(db);
  const documentService = new DocumentService({
    repository: documents,
    extractor: createDefaultExtractionService({ timeoutMs: 5_000 }),
    newId: randomUUID,
    now: () => new Date(),
    ...(overrides.uploadLimits === undefined ? {} : { limits: overrides.uploadLimits }),
  });
  const analysisService = new AnalysisService({
    documents,
    analyses,
    llm,
    newId: randomUUID,
    now: () => new Date(),
    concurrency: 3,
  });
  const app = createApp({
    cors: { origins: [TEST_ORIGIN] },
    rateLimit: false,
    ...appOverrides,
    services: { documents: documentService, analyses: analysisService },
  });
  return { app, db, documents, analyses };
}
