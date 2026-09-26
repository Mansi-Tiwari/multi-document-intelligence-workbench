import { UPLOAD_LIMITS } from "@mdiw/shared";
import { formatBytes } from "../../lib/format";

/** The parts of a `File` the pre-checks need (keeps this module testable without the DOM). */
export interface FileLike {
  readonly name: string;
  readonly size: number;
}

export interface RejectedFile<F extends FileLike> {
  readonly file: F;
  readonly reason: string;
}

export interface SelectionCheck<F extends FileLike> {
  /** Files that pass the per-file checks and would be sent. */
  readonly accepted: readonly F[];
  /** Files that would certainly be rejected, with a reason. They are not sent. */
  readonly rejected: readonly RejectedFile<F>[];
  /** A problem with the batch as a whole that blocks uploading (e.g. too many files). */
  readonly batchError: string | null;
  readonly canUpload: boolean;
}

const MAX_FILENAME_LENGTH = 255;

export const ACCEPT_ATTRIBUTE = UPLOAD_LIMITS.allowedExtensions.join(",");

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

function isAllowedExtension(extension: string): boolean {
  return UPLOAD_LIMITS.allowedExtensions.some((allowed) => allowed === extension);
}

/** Returns why a single file would be rejected, or `null` if it looks acceptable. */
export function checkFile(file: FileLike): string | null {
  if (file.name.length === 0 || file.name.length > MAX_FILENAME_LENGTH) {
    return `File names must be 1–${MAX_FILENAME_LENGTH} characters long.`;
  }
  const extension = extensionOf(file.name);
  if (!isAllowedExtension(extension)) {
    const allowed = UPLOAD_LIMITS.allowedExtensions.join(", ");
    return extension === ""
      ? `Files need an extension. Allowed: ${allowed}.`
      : `${extension} files are not supported. Allowed: ${allowed}.`;
  }
  if (file.size === 0) {
    return "The file is empty.";
  }
  if (file.size > UPLOAD_LIMITS.maxFileBytes) {
    return `The file is ${formatBytes(file.size)}; the limit is ${formatBytes(UPLOAD_LIMITS.maxFileBytes)} per file.`;
  }
  return null;
}

/**
 * Client-side pre-checks against the shared `UPLOAD_LIMITS`. The server remains the authority:
 * files that pass here can still be rejected (e.g. a PDF without a text layer).
 */
export function validateSelection<F extends FileLike>(files: readonly F[]): SelectionCheck<F> {
  const accepted: F[] = [];
  const rejected: RejectedFile<F>[] = [];
  for (const file of files) {
    const reason = checkFile(file);
    if (reason === null) accepted.push(file);
    else rejected.push({ file, reason });
  }

  let batchError: string | null = null;
  if (accepted.length > UPLOAD_LIMITS.maxFiles) {
    const excess = accepted.length - UPLOAD_LIMITS.maxFiles;
    batchError = `You can upload at most ${UPLOAD_LIMITS.maxFiles} files at a time. Remove ${excess} ${excess === 1 ? "file" : "files"} to continue.`;
  }

  return { accepted, rejected, batchError, canUpload: accepted.length > 0 && batchError === null };
}

/** Identity used to avoid adding the same file twice (browsers give no stable id). */
export function fileIdentity(file: FileLike & { readonly lastModified: number }): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

/** Appends `incoming` to `current`, skipping files that are already present. */
export function mergeFiles<F extends FileLike & { readonly lastModified: number }>(
  current: readonly F[],
  incoming: readonly F[],
): F[] {
  const seen = new Set(current.map(fileIdentity));
  const merged = [...current];
  for (const file of incoming) {
    const key = fileIdentity(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return merged;
}
