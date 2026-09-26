import { CsvError, parse } from "csv-parse/sync";
import { z } from "zod";
import { UnreadableContentError } from "../../domain/extraction";
import type { ExtractedText, TextExtractor } from "../../ports/TextExtractor";
import { decodeUtf8TextOrThrow } from "./utf8";

/** csv-parse's return type is not trustworthy; validate the shape we asked for. */
const CsvRowsSchema = z.array(z.array(z.string()));

const isBlank = (value: string): boolean => value.trim() === "";
/** Keeps each record on one line so later analysis can quote rows. */
const oneLine = (value: string): string => value.replace(/\s*\r?\n\s*/g, " ").trim();

/**
 * Renders a CSV as readable text:
 *   Columns: name, amount
 *   Row 1: name=Acme; amount=42
 * A header row is required. Header-only (or blank) CSVs yield empty text.
 */
export class CsvExtractor implements TextExtractor {
  readonly kind = "csv";

  extract(bytes: Uint8Array, signal: AbortSignal): Promise<ExtractedText> {
    // The Promise executor turns synchronous throws into rejections.
    return new Promise((resolve) => {
      signal.throwIfAborted();
      resolve(renderCsv(bytes));
    });
  }
}

function renderCsv(bytes: Uint8Array): ExtractedText {
  const input = decodeUtf8TextOrThrow(bytes);

  let raw: unknown;
  try {
    raw = parse(input, { relax_column_count: false, skip_empty_lines: true, bom: true });
  } catch (error) {
    throw new UnreadableContentError(csvErrorReason(error), { cause: error });
  }

  const parsed = CsvRowsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UnreadableContentError("The CSV file could not be parsed.");
  }

  const [header, ...records] = parsed.data;
  if (header === undefined) return { text: "", pageCount: null };
  if (header.every(isBlank)) {
    throw new UnreadableContentError("The CSV file must start with a header row.");
  }

  const columns = header.map((name, i) => (isBlank(name) ? `column ${i + 1}` : oneLine(name)));
  const rows = records.filter((record) => !record.every(isBlank));
  if (rows.length === 0) return { text: "", pageCount: null };

  const lines = [`Columns: ${columns.join(", ")}`];
  rows.forEach((record, index) => {
    const cells = record.map((value, i) => `${columns[i] ?? `column ${i + 1}`}=${oneLine(value)}`);
    lines.push(`Row ${index + 1}: ${cells.join("; ")}`);
  });
  return { text: lines.join("\n"), pageCount: null };
}

function csvErrorReason(error: unknown): string {
  if (error instanceof CsvError) {
    const line = typeof error["lines"] === "number" ? ` near line ${error["lines"]}` : "";
    if (error.code === "CSV_RECORD_INCONSISTENT_FIELDS_LENGTH" || error.code === "CSV_RECORD_INCONSISTENT_COLUMNS") {
      return `The CSV file is malformed: rows have different numbers of columns${line}.`;
    }
    if (error.code === "CSV_QUOTE_NOT_CLOSED") {
      return `The CSV file is malformed: a quoted value is never closed${line}.`;
    }
    return `The CSV file is malformed${line}.`;
  }
  return "The CSV file could not be parsed.";
}
