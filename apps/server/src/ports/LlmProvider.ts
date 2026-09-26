import type { DocumentKind, LlmProvider as LlmProviderName } from "@mdiw/shared";
import type { DocumentAnalysisOutput, PlannedField } from "../domain/llm";

/** The ONE document an `analyzeDocument` call may see. */
export type LlmDocument = {
  readonly id: string;
  readonly filename: string;
  readonly kind: DocumentKind;
  readonly text: string;
};

export type PlanFieldsInput = {
  /** Only the instruction: field planning never sees document text. */
  readonly instruction: string;
};

export type AnalyzeDocumentInput = {
  readonly instruction: string;
  readonly fields: readonly PlannedField[];
  /** Exactly one document. There is deliberately no API that accepts several. */
  readonly document: LlmDocument;
};

/**
 * Port for the AI. Implementations validate every reply (retrying once on invalid
 * output) and throw `LlmError` on failure; callers only ever receive validated data.
 */
export interface LlmProvider {
  readonly name: LlmProviderName;
  readonly model: string;
  planFields(input: PlanFieldsInput): Promise<PlannedField[]>;
  analyzeDocument(input: AnalyzeDocumentInput): Promise<DocumentAnalysisOutput>;
}
