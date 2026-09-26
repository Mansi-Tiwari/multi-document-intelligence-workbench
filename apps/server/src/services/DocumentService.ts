import { createHash } from "node:crypto";
import { UPLOAD_LIMITS } from "@mdiw/shared";
import type { FileUploadResult, UploadDocumentsResponse, UploadLimits } from "@mdiw/shared";
import { countChars, createStoredDocument, toDocumentSummary } from "../domain/document";
import type { DocumentRepository } from "../ports/DocumentRepository";
import type { FileExtractor } from "../ports/TextExtractor";

/** A file received by the HTTP layer, still in memory. */
export interface IncomingFile {
  filename: string;
  /** Empty when the file exceeded `maxFileBytes` (its bytes were not kept). */
  bytes: Uint8Array;
  /** Real size as streamed, even when the bytes were discarded. */
  sizeBytes: number;
}

export interface DocumentServiceDeps {
  repository: DocumentRepository;
  extractor: FileExtractor;
  newId: () => string;
  now: () => Date;
  limits?: UploadLimits;
}

const MB = 1024 * 1024;

export class DocumentService {
  private readonly limits: UploadLimits;

  constructor(private readonly deps: DocumentServiceDeps) {
    this.limits = deps.limits ?? UPLOAD_LIMITS;
  }

  /**
   * Processes every file independently: one bad file never fails the batch.
   * Only files that end up `ok` are stored.
   */
  async upload(files: readonly IncomingFile[]): Promise<UploadDocumentsResponse> {
    const results = await Promise.all(files.map((file) => this.processFile(file)));
    const acceptedCount = results.filter((r) => r.status === "ok").length;
    return { results, acceptedCount, rejectedCount: results.length - acceptedCount };
  }

  private async processFile(file: IncomingFile): Promise<FileUploadResult> {
    const base = { filename: file.filename, sizeBytes: file.sizeBytes };

    if (file.sizeBytes > this.limits.maxFileBytes) {
      return {
        status: "too_large",
        ...base,
        reason: `File is larger than the ${formatMb(this.limits.maxFileBytes)} MB limit.`,
      };
    }

    const outcome = await this.deps.extractor.extract({ filename: file.filename, bytes: file.bytes });
    switch (outcome.status) {
      case "empty":
      case "unreadable":
        return { status: outcome.status, ...base, reason: outcome.reason };
      case "unsupported":
        return { status: "unsupported", ...base, reason: outcome.reason, detectedMimeType: outcome.detectedMimeType };
      case "ok": {
        const chars = countChars(outcome.text);
        if (chars > this.limits.maxTextChars) {
          return {
            status: "too_large",
            ...base,
            reason: `Extracted text has ${chars.toLocaleString("en-US")} characters; the limit is ${this.limits.maxTextChars.toLocaleString("en-US")}.`,
          };
        }
        const document = createStoredDocument(
          {
            filename: file.filename,
            kind: outcome.kind,
            mimeType: outcome.mimeType,
            sizeBytes: file.sizeBytes,
            sha256: createHash("sha256").update(file.bytes).digest("hex"),
            pageCount: outcome.pageCount,
            text: outcome.text,
          },
          this.deps.newId(),
          this.deps.now(),
        );
        this.deps.repository.insert(document);
        return { status: "ok", ...base, document: toDocumentSummary(document) };
      }
    }
  }
}

function formatMb(bytes: number): string {
  return (bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1);
}
