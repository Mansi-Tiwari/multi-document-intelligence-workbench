import type { Analysis, AnalysisSummary } from "@mdiw/shared";

/**
 * Persistence for analyses and their fields, documents, findings and sources.
 * Synchronous for the same reason as `DocumentRepository`.
 */
export interface AnalysisRepository {
  /** Validates, then writes the whole analysis in one transaction. Array order is persisted. */
  save(analysis: Analysis): void;
  /** Reassembles the analysis with every collection in its saved order. */
  findById(id: string): Analysis | null;
  /** Newest first. */
  list(): AnalysisSummary[];
}
