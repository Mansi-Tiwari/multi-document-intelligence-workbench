import { AppError, LlmError } from "../../domain/errors";
import type { ValidationResult } from "../../domain/llm";

/**
 * Thrown by an `attempt` when the reply is unusable before validation even runs
 * (not JSON, cut off at max_tokens, ...). Counts as invalid output and is retried.
 */
export class InvalidLlmOutputError extends Error {
  override readonly name = "InvalidLlmOutputError";
  constructor(readonly issues: string[]) {
    super(`Invalid LLM output: ${issues.join("; ")}`);
  }
}

export type GenerateValidatedOptions<T> = {
  /** Calls the model. `feedback` is null on the first attempt, then lists the problems to fix. */
  attempt: (feedback: string | null) => Promise<unknown>;
  validate: (raw: unknown) => ValidationResult<T>;
  /** Extra attempts after an invalid reply. */
  maxRetries?: number;
};

const MAX_FEEDBACK_ISSUES = 20;

export function buildFeedback(issues: readonly string[]): string {
  const shown = issues.slice(0, MAX_FEEDBACK_ISSUES);
  const more = issues.length > shown.length ? [`...and ${issues.length - shown.length} more`] : [];
  return [
    "Your previous response was invalid and cannot be used. Problems:",
    ...[...shown, ...more].map((issue) => `- ${issue}`),
    "Return the complete corrected JSON object only, following the schema and rules exactly.",
  ].join("\n");
}

/**
 * Runs `attempt` → `validate`; on invalid output retries with feedback (once by default),
 * then throws `LlmError`. Transport/API errors are not retried here (the SDK already
 * retries 429/5xx): an `AppError` is rethrown as is, anything else becomes `LlmError`.
 */
export async function generateValidated<T>({
  attempt,
  validate,
  maxRetries = 1,
}: GenerateValidatedOptions<T>): Promise<T> {
  let feedback: string | null = null;
  const history: string[][] = [];

  for (let attemptNo = 0; attemptNo <= maxRetries; attemptNo++) {
    let issues: string[];
    try {
      const result = validate(await attempt(feedback));
      if (result.ok) return result.value;
      issues = result.issues;
    } catch (error) {
      if (error instanceof InvalidLlmOutputError) {
        issues = error.issues;
      } else if (error instanceof AppError) {
        throw error;
      } else {
        throw new LlmError("The AI provider request failed.", error);
      }
    }
    history.push(issues);
    feedback = buildFeedback(issues);
  }

  throw new LlmError(
    history.length > 1 ? "The AI returned an invalid response twice" : "The AI returned an invalid response",
    { attempts: history.length, issues: history },
  );
}
