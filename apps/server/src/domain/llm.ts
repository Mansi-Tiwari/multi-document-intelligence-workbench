/**
 * Schemas and pure validation for LLM output (mock or real).
 *
 * Every AI reply is `unknown` until it passes through one of the validators here.
 * Validators never throw: they return a discriminated result so a caller can feed
 * the issues back to the model and retry.
 */
import { z } from "zod";
import { FieldKeySchema } from "@mdiw/shared";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

export const MAX_PLANNED_FIELDS = 12;
export const MAX_KEY_FACTS = 20;

/** Trims; a blank string becomes `null` (models often emit "" for "not found"). */
const NullableText = z
  .string()
  .nullable()
  .transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  });

export const PlannedFieldSchema = z.object({
  key: FieldKeySchema,
  description: z.string().trim().min(1).max(300),
});
export type PlannedField = z.infer<typeof PlannedFieldSchema>;

export const PlannedFieldsOutputSchema = z
  .object({
    fields: z.array(PlannedFieldSchema).min(1).max(MAX_PLANNED_FIELDS),
  })
  .superRefine((output, ctx) => {
    const seen = new Set<string>();
    output.fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({ code: "custom", path: ["fields", index, "key"], message: `Duplicate field key '${field.key}'` });
      }
      seen.add(field.key);
    });
  });
export type PlannedFieldsOutput = z.infer<typeof PlannedFieldsOutputSchema>;

export const FieldValueOutputSchema = z.object({
  key: FieldKeySchema,
  value: NullableText,
  quote: NullableText,
});
export type FieldValueOutput = z.infer<typeof FieldValueOutputSchema>;

export const KeyFactOutputSchema = z.object({
  fact: z.string().trim().min(1).max(1000),
  quote: NullableText,
});
export type KeyFactOutput = z.infer<typeof KeyFactOutputSchema>;

export const DocumentAnalysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  relevance: z.number().min(0).max(1),
  fields: z.array(FieldValueOutputSchema),
  keyFacts: z.array(KeyFactOutputSchema).max(MAX_KEY_FACTS),
});
export type DocumentAnalysisOutput = z.infer<typeof DocumentAnalysisOutputSchema>;

/** "path: message" lines, readable by both humans and the model. */
function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });
}

/** Collapses every whitespace run to one space and trims. Used for verbatim-quote checks. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function validatePlannedFields(raw: unknown): ValidationResult<PlannedField[]> {
  const parsed = PlannedFieldsOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: formatZodIssues(parsed.error) };
  return { ok: true, value: parsed.data.fields };
}

export type DocumentAnalysisContext = {
  readonly fields: readonly PlannedField[];
  readonly documentText: string;
};

/**
 * Schema validation plus checks that need context:
 * - returned field keys are exactly the requested keys (no missing, extra or duplicate keys);
 *   the result is reordered to the requested order;
 * - a field with `value: null` has `quote: null`;
 * - every non-null quote appears verbatim in the document (after whitespace normalization),
 *   so the model cannot cite text it made up.
 */
export function validateDocumentAnalysis(
  raw: unknown,
  ctx: DocumentAnalysisContext,
): ValidationResult<DocumentAnalysisOutput> {
  const parsed = DocumentAnalysisOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: formatZodIssues(parsed.error) };
  const output = parsed.data;
  const issues: string[] = [];

  const requested = new Set(ctx.fields.map((field) => field.key));
  const byKey = new Map<string, FieldValueOutput>();
  output.fields.forEach((field, index) => {
    if (!requested.has(field.key)) {
      issues.push(`fields.${index}.key: '${field.key}' was not requested`);
    } else if (byKey.has(field.key)) {
      issues.push(`fields.${index}.key: '${field.key}' is returned more than once`);
    } else {
      byKey.set(field.key, field);
    }
  });
  for (const key of requested) {
    if (!byKey.has(key)) issues.push(`fields: requested field '${key}' is missing (use value null if not found)`);
  }

  const documentText = normalizeWhitespace(ctx.documentText);
  const quoteFound = (quote: string): boolean => documentText.includes(normalizeWhitespace(quote));

  output.fields.forEach((field, index) => {
    if (field.value === null && field.quote !== null) {
      issues.push(`fields.${index}.quote: must be null when value is null`);
    }
    if (field.quote !== null && !quoteFound(field.quote)) {
      issues.push(`fields.${index}.quote: not found verbatim in the document (quote exact text only)`);
    }
  });
  output.keyFacts.forEach((fact, index) => {
    if (fact.quote !== null && !quoteFound(fact.quote)) {
      issues.push(`keyFacts.${index}.quote: not found verbatim in the document (quote exact text only)`);
    }
  });

  if (issues.length > 0) return { ok: false, issues };

  const fields = ctx.fields.flatMap((field) => {
    const found = byKey.get(field.key);
    return found === undefined ? [] : [found];
  });
  return { ok: true, value: { ...output, fields } };
}
