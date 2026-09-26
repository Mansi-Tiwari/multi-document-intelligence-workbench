import { CsvExtractor } from "./CsvExtractor";
import { ExtractionService } from "./ExtractionService";
import { PdfExtractor } from "./PdfExtractor";
import { PlainTextExtractor } from "./PlainTextExtractor";

export { CsvExtractor } from "./CsvExtractor";
export { detectFileType } from "./detectFileType";
export type { DetectionResult } from "./detectFileType";
export { ExtractionService } from "./ExtractionService";
export type { ExtractionServiceOptions } from "./ExtractionService";
export { PdfExtractor } from "./PdfExtractor";
export { PlainTextExtractor } from "./PlainTextExtractor";
export { withTimeout } from "./withTimeout";

export function createDefaultExtractionService({ timeoutMs }: { timeoutMs: number }): ExtractionService {
  return new ExtractionService({
    extractors: [new PdfExtractor(), new PlainTextExtractor(), new CsvExtractor()],
    timeoutMs,
  });
}
