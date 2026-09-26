import { z } from "zod";
import { DocumentIdSchema, IsoDateTimeSchema } from "./documents";

export const AnalysisIdSchema = z.uuid();
export type AnalysisId = z.infer<typeof AnalysisIdSchema>;

export const FindingIdSchema = z.uuid();
export type FindingId = z.infer<typeof FindingIdSchema>;

export const LlmProviderSchema = z.enum(["mock", "anthropic"]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const FieldKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, "Field keys must be snake_case");
export type FieldKey = z.infer<typeof FieldKeySchema>;

export const AnalysisFieldSchema = z.object({
  key: FieldKeySchema,
  description: z.string().min(1),
});
export type AnalysisField = z.infer<typeof AnalysisFieldSchema>;

export const FindingScopeSchema = z.enum(["document", "cross_document"]);
export type FindingScope = z.infer<typeof FindingScopeSchema>;

export const DocumentFindingKindSchema = z.enum(["field_value", "key_fact"]);
export const CrossDocumentFindingKindSchema = z.enum(["comparison", "discrepancy", "missing_info", "key_document"]);
export const FindingKindSchema = z.enum([...DocumentFindingKindSchema.options, ...CrossDocumentFindingKindSchema.options]);
export type FindingKind = z.infer<typeof FindingKindSchema>;

/** Kinds that describe one planned field and therefore must carry a `fieldKey`. */
export const FIELD_FINDING_KINDS: readonly FindingKind[] = ["field_value", "comparison", "discrepancy", "missing_info"];

export const FindingSourceSchema = z.object({
  documentId: DocumentIdSchema,
  /** The value in this document; `null` = not found. */
  value: z.string().nullable(),
  /** Supporting excerpt from this document. */
  quote: z.string().nullable(),
});
export type FindingSource = z.infer<typeof FindingSourceSchema>;

const findingBase = {
  id: FindingIdSchema,
  fieldKey: FieldKeySchema.nullable(),
  title: z.string().min(1),
  detail: z.string().nullable(),
};

/** A finding about a single document: exactly one source. */
export const DocumentFindingSchema = z.object({
  ...findingBase,
  scope: z.literal("document"),
  kind: DocumentFindingKindSchema,
  sources: z.array(FindingSourceSchema).length(1),
});

/** A finding across documents: one source per document involved. */
export const CrossDocumentFindingSchema = z.object({
  ...findingBase,
  scope: z.literal("cross_document"),
  kind: CrossDocumentFindingKindSchema,
  sources: z.array(FindingSourceSchema).min(1),
});

export const FindingSchema = z
  .discriminatedUnion("scope", [DocumentFindingSchema, CrossDocumentFindingSchema])
  .superRefine((finding, ctx) => {
    const needsField = FIELD_FINDING_KINDS.includes(finding.kind);
    if (needsField && finding.fieldKey === null) {
      ctx.addIssue({ code: "custom", path: ["fieldKey"], message: `fieldKey is required for kind '${finding.kind}'` });
    }
    if (!needsField && finding.fieldKey !== null) {
      ctx.addIssue({ code: "custom", path: ["fieldKey"], message: `fieldKey must be null for kind '${finding.kind}'` });
    }
    const seen = new Set<string>();
    finding.sources.forEach((source, index) => {
      if (seen.has(source.documentId)) {
        ctx.addIssue({ code: "custom", path: ["sources", index, "documentId"], message: "Duplicate source document" });
      }
      seen.add(source.documentId);
    });
  });
export type Finding = z.infer<typeof FindingSchema>;

export const AnalysisDocumentSchema = z.object({
  documentId: DocumentIdSchema,
  filename: z.string().min(1).max(255),
  summary: z.string(),
  relevance: z.number().min(0).max(1),
});
export type AnalysisDocument = z.infer<typeof AnalysisDocumentSchema>;

export const InstructionSchema = z.string().trim().min(3).max(2000);

export const AnalysisSchema = z
  .object({
    id: AnalysisIdSchema,
    instruction: InstructionSchema,
    provider: LlmProviderSchema,
    model: z.string().min(1),
    createdAt: IsoDateTimeSchema,
    fields: z.array(AnalysisFieldSchema),
    documents: z.array(AnalysisDocumentSchema).min(1),
    findings: z.array(FindingSchema),
  })
  .superRefine((analysis, ctx) => {
    const fieldKeys = new Set<string>();
    analysis.fields.forEach((field, index) => {
      if (fieldKeys.has(field.key)) {
        ctx.addIssue({ code: "custom", path: ["fields", index, "key"], message: `Duplicate field key '${field.key}'` });
      }
      fieldKeys.add(field.key);
    });

    const documentIds = new Set<string>();
    analysis.documents.forEach((doc, index) => {
      if (documentIds.has(doc.documentId)) {
        ctx.addIssue({ code: "custom", path: ["documents", index, "documentId"], message: "Duplicate analysis document" });
      }
      documentIds.add(doc.documentId);
    });

    const findingIds = new Set<string>();
    analysis.findings.forEach((finding, index) => {
      if (findingIds.has(finding.id)) {
        ctx.addIssue({ code: "custom", path: ["findings", index, "id"], message: "Duplicate finding id" });
      }
      findingIds.add(finding.id);
      if (finding.fieldKey !== null && !fieldKeys.has(finding.fieldKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["findings", index, "fieldKey"],
          message: `Unknown field key '${finding.fieldKey}'`,
        });
      }
      finding.sources.forEach((source, sourceIndex) => {
        if (!documentIds.has(source.documentId)) {
          ctx.addIssue({
            code: "custom",
            path: ["findings", index, "sources", sourceIndex, "documentId"],
            message: "Source document is not part of this analysis",
          });
        }
      });
    });
  });
export type Analysis = z.infer<typeof AnalysisSchema>;

export const AnalysisSummarySchema = z.object({
  id: AnalysisIdSchema,
  instruction: z.string(),
  provider: LlmProviderSchema,
  model: z.string().min(1),
  documentCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
});
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>;
