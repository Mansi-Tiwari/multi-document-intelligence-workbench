import { z } from "zod";
import { DocumentSummarySchema, type DocumentSummary } from "@mdiw/shared";

/** A document as persisted: the public summary plus its full extracted text. */
export const StoredDocumentSchema = DocumentSummarySchema.extend({
  text: z.string().min(1),
});
export type StoredDocument = z.infer<typeof StoredDocumentSchema>;

/** Everything known about an uploaded document before it gets an id and timestamp. */
export type NewDocument = Omit<StoredDocument, "id" | "createdAt" | "charCount">;

/** Number of Unicode code points, matching SQLite's `length()` on TEXT. */
export const countChars = (text: string): number => [...text].length;

/**
 * Builds a `StoredDocument` from upload data. Pure: the id and timestamp are injected.
 * Throws a ZodError if the result would violate the document invariants.
 */
export const createStoredDocument = (input: NewDocument, id: string, createdAt: Date): StoredDocument =>
  StoredDocumentSchema.parse({
    ...input,
    id,
    charCount: countChars(input.text),
    createdAt: createdAt.toISOString(),
  });

/** Drops the full text, leaving the public summary. */
export const toDocumentSummary = ({ text: _text, ...summary }: StoredDocument): DocumentSummary => summary;
