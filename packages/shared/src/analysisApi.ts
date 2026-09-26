import { z } from "zod";
import { AnalysisSchema, InstructionSchema } from "./analysis";
import type { Finding } from "./analysis";
import { DocumentIdSchema } from "./documents";
import { UPLOAD_LIMITS } from "./uploads";

export const MAX_DOCUMENTS_PER_ANALYSIS = UPLOAD_LIMITS.maxFiles;

export const CreateAnalysisRequestSchema = z.object({
  instruction: InstructionSchema,
  documentIds: z
    .array(DocumentIdSchema)
    .min(1, "Select at least one document.")
    .max(MAX_DOCUMENTS_PER_ANALYSIS, `Select at most ${MAX_DOCUMENTS_PER_ANALYSIS} documents.`)
    .refine((ids) => new Set(ids).size === ids.length, "Each document can be selected only once."),
});
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>;

/**
 * A requested document that is not part of the analysis:
 * - `not_found`: unknown id (never uploaded, deleted, or its upload wasn't ok);
 * - `analysis_failed`: its own AI call failed or returned invalid output twice
 *   (e.g. quotes that don't exist in the document).
 */
export const SkippedDocumentSchema = z.object({
  documentId: DocumentIdSchema,
  filename: z.string().nullable(),
  reason: z.enum(["not_found", "analysis_failed"]),
  message: z.string().min(1),
});
export type SkippedDocument = z.infer<typeof SkippedDocumentSchema>;

export const CreateAnalysisResponseSchema = z.object({
  analysis: AnalysisSchema,
  skipped: z.array(SkippedDocumentSchema),
});
export type CreateAnalysisResponse = z.infer<typeof CreateAnalysisResponseSchema>;

/** Example instructions shown as chips under the prompt box. */
export const EXAMPLE_INSTRUCTIONS = [
  "Compare name, email, date of birth, licence number and monthly income",
  "Compare total amount, due date and payment terms",
  "Find dates, money amounts, emails and licence numbers",
  "Which document is the most recent contract, and what are its parties?",
  "Check invoice numbers, vendors and totals for discrepancies",
] as const;

/**
 * "fact": every stated value is backed by a quote that the server verified exists
 * verbatim in its source document. "ai": the claim relies on model judgement
 * (no quote, an absence claim, or the key-document choice).
 */
export const FindingBasisSchema = z.enum(["fact", "ai"]);
export type FindingBasis = z.infer<typeof FindingBasisSchema>;

export function findingBasis(finding: Finding): FindingBasis {
  if (finding.kind === "key_document" || finding.kind === "missing_info") return "ai";
  if (finding.kind === "key_fact") return finding.sources.every((s) => s.quote !== null) ? "fact" : "ai";
  const withValues = finding.sources.filter((s) => s.value !== null);
  return withValues.length > 0 && withValues.every((s) => s.quote !== null) ? "fact" : "ai";
}
