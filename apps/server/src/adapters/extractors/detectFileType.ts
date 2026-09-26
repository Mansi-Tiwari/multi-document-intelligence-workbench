import { fileTypeFromBuffer } from "file-type";
import type { DocumentKind, ExtractedMimeType, ExtractionOutcome } from "../../domain/extraction";
import { allowedExtension } from "../../domain/extraction";
import { decodeUtf8Text } from "./utf8";

export type DetectionResult =
  | { status: "detected"; kind: DocumentKind; mimeType: ExtractedMimeType }
  | Extract<ExtractionOutcome, { status: "unsupported" | "unreadable" }>;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, i) => bytes[i] === byte);
}

const UNSUPPORTED_EXTENSION =
  "This file type is not supported. Upload a PDF, plain text (.txt, .md) or CSV file.";

/**
 * Decides the document kind from the real bytes (never the client MIME type)
 * and checks that the file extension agrees with the content.
 */
export async function detectFileType(filename: string, bytes: Uint8Array): Promise<DetectionResult> {
  const allowed = allowedExtension(filename);
  if (allowed === null) {
    return { status: "unsupported", detectedMimeType: null, reason: UNSUPPORTED_EXTENSION };
  }

  const detected = await fileTypeFromBuffer(bytes);

  if (detected !== undefined) {
    const isPdf = detected.mime === "application/pdf" && startsWithPdfMagic(bytes);
    if (!isPdf) {
      return {
        status: "unsupported",
        detectedMimeType: detected.mime,
        reason: `The file content is ${detected.ext.toUpperCase()} (${detected.mime}), which is not supported.`,
      };
    }
    if (allowed.kind !== "pdf") {
      return {
        status: "unsupported",
        detectedMimeType: "application/pdf",
        reason: "The file content is a PDF but its extension says otherwise. Rename it to .pdf.",
      };
    }
    return { status: "detected", kind: "pdf", mimeType: "application/pdf" };
  }

  // No binary signature: a text candidate.
  const decoded = decodeUtf8Text(bytes);
  if (allowed.kind === "pdf") {
    return {
      status: "unsupported",
      detectedMimeType: decoded.ok ? "text/plain" : null,
      reason: "The file has a .pdf extension but its content is not a PDF.",
    };
  }
  if (!decoded.ok) {
    return { status: "unreadable", kind: allowed.kind, reason: decoded.reason };
  }
  return { status: "detected", kind: allowed.kind, mimeType: allowed.mimeType };
}
