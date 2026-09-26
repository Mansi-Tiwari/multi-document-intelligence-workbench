import { CreateAnalysisRequestSchema, InstructionSchema, MAX_DOCUMENTS_PER_ANALYSIS } from "@mdiw/shared";
import type { CreateAnalysisRequest } from "@mdiw/shared";

export const INSTRUCTION_MIN = InstructionSchema.minLength ?? 3;
export const INSTRUCTION_MAX = InstructionSchema.maxLength ?? 2000;

/** Validates with the shared `InstructionSchema`; returns a user-facing message or `null`. */
export function validateInstruction(value: string): string | null {
  const result = InstructionSchema.safeParse(value);
  if (result.success) return null;
  const issue = result.error.issues[0];
  if (issue?.code === "too_small") {
    return value.trim() === ""
      ? "Write an instruction describing what to extract or compare."
      : `The instruction must be at least ${INSTRUCTION_MIN} characters.`;
  }
  if (issue?.code === "too_big") {
    return `The instruction must be at most ${INSTRUCTION_MAX} characters (it has ${value.trim().length}).`;
  }
  return issue?.message ?? "The instruction is not valid.";
}

export type AnalysisRequestCheck =
  | { ok: true; request: CreateAnalysisRequest }
  | { ok: false; reason: string };

/**
 * Builds the request for `POST /api/analyses`, or explains why the Analyze button is disabled.
 * Document problems are reported first because they are fixed in the other column.
 */
export function checkAnalysisRequest(instruction: string, documentIds: readonly string[]): AnalysisRequestCheck {
  if (documentIds.length === 0) return { ok: false, reason: "Select at least one document in the Documents list." };
  if (documentIds.length > MAX_DOCUMENTS_PER_ANALYSIS) {
    return { ok: false, reason: `Select at most ${MAX_DOCUMENTS_PER_ANALYSIS} documents (${documentIds.length} selected).` };
  }
  const instructionError = validateInstruction(instruction);
  if (instructionError !== null) return { ok: false, reason: instructionError };

  const parsed = CreateAnalysisRequestSchema.safeParse({ instruction, documentIds });
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "The request is not valid." };
  }
  return { ok: true, request: parsed.data };
}
