import type { DocumentKind, ExtractionOutcome } from "../../domain/extraction";
import {
  ExtractionTimeoutError,
  UnreadableContentError,
  hasMeaningfulText,
  normalizeExtractedText,
} from "../../domain/extraction";
import type { ExtractedText, FileExtractor, FileToExtract, TextExtractor } from "../../ports/TextExtractor";
import { detectFileType } from "./detectFileType";
import { withTimeout } from "./withTimeout";

export interface ExtractionServiceOptions {
  extractors: readonly TextExtractor[];
  timeoutMs: number;
}

const EMPTY_REASONS: Record<DocumentKind, string> = {
  pdf: "The PDF has no extractable text (it may be scanned; OCR is not supported).",
  text: "The file contains no text.",
  csv: "The CSV file has no data rows.",
};

/** Detects, extracts and classifies one file. Never throws for bad input. */
export class ExtractionService implements FileExtractor {
  private readonly extractors: ReadonlyMap<DocumentKind, TextExtractor>;
  private readonly timeoutMs: number;

  constructor({ extractors, timeoutMs }: ExtractionServiceOptions) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("timeoutMs must be a positive number.");
    }
    const byKind = new Map<DocumentKind, TextExtractor>();
    for (const extractor of extractors) {
      if (byKind.has(extractor.kind)) {
        throw new Error(`Duplicate extractor for kind "${extractor.kind}".`);
      }
      byKind.set(extractor.kind, extractor);
    }
    this.extractors = byKind;
    this.timeoutMs = timeoutMs;
  }

  async extract(file: FileToExtract): Promise<ExtractionOutcome> {
    let detection;
    try {
      detection = await detectFileType(file.filename, file.bytes);
    } catch {
      return { status: "unsupported", detectedMimeType: null, reason: "The file type could not be determined." };
    }
    if (detection.status !== "detected") return detection;

    const { kind, mimeType } = detection;
    const extractor = this.extractors.get(kind);
    if (extractor === undefined) {
      return { status: "unsupported", detectedMimeType: mimeType, reason: "This file type is not supported by the server." };
    }

    let extracted: ExtractedText;
    try {
      extracted = await withTimeout((signal) => extractor.extract(file.bytes, signal), this.timeoutMs);
    } catch (error) {
      return { status: "unreadable", kind, reason: unreadableReason(error) };
    }

    const text = normalizeExtractedText(extracted.text);
    if (!hasMeaningfulText(text)) {
      return { status: "empty", kind, mimeType, reason: EMPTY_REASONS[kind] };
    }
    return { status: "ok", kind, mimeType, text, charCount: text.length, pageCount: extracted.pageCount };
  }
}

function unreadableReason(error: unknown): string {
  if (error instanceof ExtractionTimeoutError) return "Reading the file took too long and was stopped.";
  if (error instanceof UnreadableContentError) return error.reason;
  return "The file could not be read.";
}
