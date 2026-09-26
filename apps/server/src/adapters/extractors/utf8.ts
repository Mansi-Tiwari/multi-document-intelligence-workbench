import { UnreadableContentError } from "../../domain/extraction";

export type Utf8DecodeResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * Strictly decodes UTF-8 (a leading BOM is stripped). Rejects invalid sequences
 * and NUL bytes, which indicate binary content rather than text.
 */
export function decodeUtf8Text(bytes: Uint8Array): Utf8DecodeResult {
  if (bytes.includes(0)) {
    return { ok: false, reason: "The file contains NUL bytes, so it is not a plain text file." };
  }
  try {
    // ignoreBOM: false (default) strips a leading UTF-8 BOM.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "The file is not valid UTF-8 text." };
  }
}

/** Same as `decodeUtf8Text` but throws `UnreadableContentError` on failure. */
export function decodeUtf8TextOrThrow(bytes: Uint8Array): string {
  const result = decodeUtf8Text(bytes);
  if (!result.ok) throw new UnreadableContentError(result.reason);
  return result.text;
}
