import multer from "multer";
import type { RequestHandler } from "express";
import { z } from "zod";
import { UPLOAD_LIMITS } from "@mdiw/shared";
import type { UploadLimits } from "@mdiw/shared";
import type { IncomingFile } from "../services/DocumentService";
import { ValidationError } from "../domain/errors";
import { parseInput } from "./parseInput";

type StoredInfo = Partial<Express.Multer.File>;

/**
 * Keeps files in memory, but stops buffering once a file passes `maxBytes`:
 * the rest of that file is drained and discarded, and it is reported with its real
 * size and no bytes, so the service can give it its own `too_large` status.
 * Multer's `limits.fileSize` still aborts anything above the hard cap.
 */
class BoundedMemoryStorage implements multer.StorageEngine {
  constructor(private readonly maxBytes: number) {}

  _handleFile(_req: unknown, file: Express.Multer.File, callback: (error: Error | null, info?: StoredInfo) => void): void {
    const chunks: Buffer[] = [];
    let size = 0;
    let overflow = false;

    file.stream.on("data", (chunk: unknown) => {
      if (!Buffer.isBuffer(chunk)) return;
      size += chunk.length;
      if (overflow) return;
      if (size > this.maxBytes) {
        overflow = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    file.stream.on("error", (error: Error) => callback(error));
    file.stream.on("end", () => {
      callback(null, { buffer: overflow ? Buffer.alloc(0) : Buffer.concat(chunks), size });
    });
  }

  _removeFile(_req: unknown, _file: Express.Multer.File, callback: (error: Error | null) => void): void {
    callback(null);
  }
}

/**
 * Multipart parsing for document uploads: memory only, bounded size and count.
 * Limit violations surface as MulterError (mapped by the error handler); any other
 * parser failure (missing boundary, truncated body, aborted stream) is the client's
 * fault and becomes a 400 instead of an unhandled 500.
 */
export function uploadFilesMiddleware(limits: UploadLimits = UPLOAD_LIMITS): RequestHandler {
  const parse = multer({
    storage: new BoundedMemoryStorage(limits.maxFileBytes),
    defParamCharset: "utf8",
    limits: {
      files: limits.maxFiles,
      fileSize: limits.hardMaxFileBytes,
      fields: 0,
      parts: limits.maxFiles,
      fieldNameSize: 100,
      headerPairs: 100,
    },
  }).array(limits.fieldName, limits.maxFiles);

  return (req, res, next) => {
    void parse(req, res, (err?: unknown) => {
      if (err === undefined || err instanceof multer.MulterError) {
        next(err);
        return;
      }
      next(new ValidationError("The upload is not a valid multipart/form-data body."));
    });
  };
}

const UploadedFileSchema = z.object({
  originalname: z.string(),
  size: z.number().int().nonnegative(),
  buffer: z.instanceof(Buffer),
});

/** Validates multer's `req.files` and turns each entry into an `IncomingFile`. */
export function readUploadedFiles(files: unknown, limits: UploadLimits = UPLOAD_LIMITS): IncomingFile[] {
  const parsed = parseInput(
    z
      .array(UploadedFileSchema)
      .min(1, `Attach at least one file in the '${limits.fieldName}' field.`)
      .max(limits.maxFiles, `Upload at most ${limits.maxFiles} files at once.`),
    files ?? [],
    "Invalid upload.",
  );
  return parsed.map((f) => ({
    filename: sanitizeFilename(f.originalname),
    bytes: new Uint8Array(f.buffer),
    sizeBytes: f.size,
  }));
}

/** Basename only, no control characters, at most 255 chars (keeping the extension). */
export function sanitizeFilename(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    .replace(/\p{Cc}/gu, "")
    .normalize("NFC")
    .trim();
  const name = base === "" || base === "." || base === ".." ? "unnamed" : base;
  if (name.length <= 255) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : "";
  return name.slice(0, 255 - ext.length) + ext;
}
