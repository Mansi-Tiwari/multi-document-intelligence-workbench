import { z } from "zod";
import {
  AnalysisSummarySchema,
  DocumentSummarySchema,
  FindingKindSchema,
  FindingScopeSchema,
} from "@mdiw/shared";
import { StoredDocumentSchema } from "../../domain/document";

/*
 * Row schemas for every table read. node:sqlite returns `Record<string, SQLOutputValue>`
 * (INTEGER → number, REAL → number, TEXT → string, NULL → null). Each schema validates the
 * raw snake_case row, maps it to camelCase and, where a domain/shared schema exists,
 * pipes the result through it so persisted data must satisfy the same invariants as the API.
 */

const documentSummaryColumns = {
  id: z.string(),
  filename: z.string(),
  kind: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  sha256: z.string(),
  page_count: z.number().nullable(),
  char_count: z.number(),
  created_at: z.string(),
};

export const DocumentSummaryRowSchema = z
  .object(documentSummaryColumns)
  .transform((row) => ({
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    pageCount: row.page_count,
    charCount: row.char_count,
    createdAt: row.created_at,
  }))
  .pipe(DocumentSummarySchema);

export const StoredDocumentRowSchema = z
  .object({ ...documentSummaryColumns, text: z.string() })
  .transform((row) => ({
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    pageCount: row.page_count,
    charCount: row.char_count,
    createdAt: row.created_at,
    text: row.text,
  }))
  .pipe(StoredDocumentSchema);

/*
 * Analysis child rows are only mapped here; the reassembled `Analysis` is validated as a
 * whole with `AnalysisSchema` (which checks the cross-row invariants too).
 */

export const AnalysisRowSchema = z
  .object({
    id: z.string(),
    instruction: z.string(),
    provider: z.string(),
    model: z.string(),
    created_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    instruction: row.instruction,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
  }));

export const AnalysisSummaryRowSchema = z
  .object({
    id: z.string(),
    instruction: z.string(),
    provider: z.string(),
    model: z.string(),
    document_count: z.number(),
    finding_count: z.number(),
    created_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    instruction: row.instruction,
    provider: row.provider,
    model: row.model,
    documentCount: row.document_count,
    findingCount: row.finding_count,
    createdAt: row.created_at,
  }))
  .pipe(AnalysisSummarySchema);

export const AnalysisFieldRowSchema = z
  .object({ key: z.string(), description: z.string() })
  .transform((row) => ({ key: row.key, description: row.description }));

export const AnalysisDocumentRowSchema = z
  .object({
    document_id: z.string(),
    filename: z.string(),
    summary: z.string(),
    relevance: z.number(),
  })
  .transform((row) => ({
    documentId: row.document_id,
    filename: row.filename,
    summary: row.summary,
    relevance: row.relevance,
  }));

export const FindingRowSchema = z
  .object({
    id: z.string(),
    scope: FindingScopeSchema,
    kind: FindingKindSchema,
    field_key: z.string().nullable(),
    title: z.string(),
    detail: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    scope: row.scope,
    kind: row.kind,
    fieldKey: row.field_key,
    title: row.title,
    detail: row.detail,
  }));

export const FindingSourceRowSchema = z
  .object({
    finding_id: z.string(),
    document_id: z.string(),
    value: z.string().nullable(),
    quote: z.string().nullable(),
  })
  .transform((row) => ({
    findingId: row.finding_id,
    source: { documentId: row.document_id, value: row.value, quote: row.quote },
  }));
