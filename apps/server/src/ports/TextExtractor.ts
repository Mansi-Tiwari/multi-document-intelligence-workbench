import type { DocumentKind, ExtractionOutcome } from "../domain/extraction";

export interface ExtractedText {
  text: string;
  /** Number of pages for paginated formats (PDF), otherwise null. */
  pageCount: number | null;
}

/**
 * Extracts text from bytes already identified as `kind`.
 * Throws `UnreadableContentError` (domain/extraction) for content it cannot read;
 * any other thrown error is also treated as unreadable by the caller.
 * Should stop work when `signal` is aborted where the underlying library allows it.
 */
export interface TextExtractor {
  readonly kind: DocumentKind;
  extract(bytes: Uint8Array, signal: AbortSignal): Promise<ExtractedText>;
}

export interface FileToExtract {
  filename: string;
  bytes: Uint8Array;
}

/**
 * Single entry point for upload handling. Never throws for bad input:
 * every failure maps to an `ExtractionOutcome`.
 */
export interface FileExtractor {
  extract(file: FileToExtract): Promise<ExtractionOutcome>;
}
