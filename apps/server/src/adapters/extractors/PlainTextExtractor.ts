import type { ExtractedText, TextExtractor } from "../../ports/TextExtractor";
import { decodeUtf8TextOrThrow } from "./utf8";

/** Plain text and Markdown: strict UTF-8 decode, returned as-is (normalization happens in the service). */
export class PlainTextExtractor implements TextExtractor {
  readonly kind = "text";

  extract(bytes: Uint8Array, signal: AbortSignal): Promise<ExtractedText> {
    // The Promise executor turns synchronous throws into rejections.
    return new Promise((resolve) => {
      signal.throwIfAborted();
      resolve({ text: decodeUtf8TextOrThrow(bytes), pageCount: null });
    });
  }
}
