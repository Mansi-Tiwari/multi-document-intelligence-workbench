import { extractText, getDocumentProxy } from "unpdf";
import { UnreadableContentError } from "../../domain/extraction";
import type { ExtractedText, TextExtractor } from "../../ports/TextExtractor";

/**
 * PDF text layer extraction via unpdf (PDF.js). No OCR: a scanned PDF yields empty text.
 * PDF.js cannot be interrupted mid-parse; on abort we destroy the document so
 * pending page work stops as soon as PDF.js yields, and the timeout race returns promptly.
 */
export class PdfExtractor implements TextExtractor {
  readonly kind = "pdf";

  async extract(bytes: Uint8Array, signal: AbortSignal): Promise<ExtractedText> {
    signal.throwIfAborted();
    let pdf;
    try {
      // PDF.js may transfer/detach the buffer it is given, so pass a copy.
      pdf = await getDocumentProxy(bytes.slice());
    } catch (error) {
      throw new UnreadableContentError(pdfErrorReason(error), { cause: error });
    }

    const onAbort = (): void => void pdf.loadingTask.destroy();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      signal.throwIfAborted();
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      return { text, pageCount: totalPages };
    } catch (error) {
      if (signal.aborted) throw error;
      throw new UnreadableContentError("The PDF text could not be extracted.", { cause: error });
    } finally {
      signal.removeEventListener("abort", onAbort);
      await pdf.loadingTask.destroy();
    }
  }
}

function pdfErrorReason(error: unknown): string {
  if (error instanceof Error && error.name === "PasswordException") {
    return "The PDF is password-protected or encrypted.";
  }
  return "The PDF file is corrupt or cannot be read.";
}
