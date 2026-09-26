import { z } from "zod";

export const DocumentIdSchema = z.uuid();
export type DocumentId = z.infer<typeof DocumentIdSchema>;

export const DocumentKindSchema = z.enum(["pdf", "text", "csv"]);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

/** ISO-8601 UTC timestamp, e.g. `2026-01-31T12:00:00.000Z`. */
export const IsoDateTimeSchema = z.iso.datetime();

export const DocumentSummarySchema = z.object({
  id: DocumentIdSchema,
  filename: z.string().min(1).max(255),
  kind: DocumentKindSchema,
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "Expected a lowercase hex SHA-256 digest"),
  pageCount: z.number().int().positive().nullable(),
  charCount: z.number().int().positive(),
  createdAt: IsoDateTimeSchema,
});
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

export const DocumentDetailSchema = DocumentSummarySchema.extend({
  textPreview: z.string(),
});
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>;
