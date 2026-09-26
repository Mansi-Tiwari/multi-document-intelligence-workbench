/**
 * Pure types and helpers for text extraction outcomes.
 * No I/O: detection and parsing live in adapters/extractors.
 */

/** Supported document kinds. (Not yet exported by @mdiw/shared; move there when the API needs it.) */
export const DOCUMENT_KINDS = ["pdf", "text", "csv"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** MIME types we report, always derived from the real bytes + extension, never from the client. */
export type ExtractedMimeType = "application/pdf" | "text/plain" | "text/markdown" | "text/csv";

export type ExtractionOutcome =
  | {
      status: "ok";
      kind: DocumentKind;
      mimeType: ExtractedMimeType;
      text: string;
      charCount: number;
      pageCount: number | null;
    }
  | { status: "empty"; kind: DocumentKind; mimeType: ExtractedMimeType; reason: string }
  | { status: "unreadable"; kind: DocumentKind; reason: string }
  | { status: "unsupported"; detectedMimeType: string | null; reason: string };

export type ExtractionStatus = ExtractionOutcome["status"];

export interface AllowedExtension {
  kind: DocumentKind;
  mimeType: ExtractedMimeType;
}

/** Allowed file extensions (lowercase, with leading dot). */
export const ALLOWED_EXTENSIONS: Readonly<Record<string, AllowedExtension>> = {
  ".pdf": { kind: "pdf", mimeType: "application/pdf" },
  ".txt": { kind: "text", mimeType: "text/plain" },
  ".md": { kind: "text", mimeType: "text/markdown" },
  ".csv": { kind: "csv", mimeType: "text/csv" },
};

/** Lowercased extension including the dot (".pdf"), or null if the name has none. */
export function fileExtension(filename: string): string | null {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot).toLowerCase();
}

export function allowedExtension(filename: string): AllowedExtension | null {
  const ext = fileExtension(filename);
  if (ext === null) return null;
  return Object.hasOwn(ALLOWED_EXTENSIONS, ext) ? (ALLOWED_EXTENSIONS[ext] ?? null) : null;
}

/** Normalizes line endings to "\n" and strips trailing whitespace from every line and the end. */
export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\s+$/u, "");
}

export function hasMeaningfulText(text: string): boolean {
  return /\S/u.test(text);
}

/** Thrown by a TextExtractor when content claims a supported type but cannot be read. */
export class UnreadableContentError extends Error {
  override readonly name = "UnreadableContentError";
  /** Short user-facing sentence. */
  readonly reason: string;
  constructor(reason: string, options?: { cause?: unknown }) {
    super(reason, options);
    this.reason = reason;
  }
}

/** Thrown by an extractor (or the timeout wrapper) when extraction takes too long. */
export class ExtractionTimeoutError extends Error {
  override readonly name = "ExtractionTimeoutError";
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Extraction timed out after ${timeoutMs} ms.`);
    this.timeoutMs = timeoutMs;
  }
}
