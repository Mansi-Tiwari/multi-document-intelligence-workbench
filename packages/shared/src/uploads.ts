import { z } from "zod";
import { DocumentSummarySchema } from "./documents";

/** Upload limits shared by the server (enforcement) and the web client (pre-checks). */
export const UPLOAD_LIMITS = {
  /** Multipart field that carries the files. */
  fieldName: "files",
  maxFiles: 10,
  /** Files above this get their own `too_large` status; the rest of the batch still runs. */
  maxFileBytes: 10 * 1024 * 1024,
  /** A single file above this aborts the whole request with 413 (stops unbounded uploads). */
  hardMaxFileBytes: 50 * 1024 * 1024,
  /** Extracted text above this is rejected as `too_large`; text is never truncated. */
  maxTextChars: 500_000,
  allowedExtensions: [".pdf", ".txt", ".md", ".csv"],
} as const;
export type UploadLimits = {
  fieldName: string;
  maxFiles: number;
  maxFileBytes: number;
  hardMaxFileBytes: number;
  maxTextChars: number;
};

export const FileUploadStatusSchema = z.enum(["ok", "empty", "unreadable", "unsupported", "too_large"]);
export type FileUploadStatus = z.infer<typeof FileUploadStatusSchema>;

const fileBase = {
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
};
const reason = z.string().min(1);

/** One entry per uploaded file, in upload order. Only `ok` files are stored. */
export const FileUploadResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), ...fileBase, document: DocumentSummarySchema }),
  z.object({ status: z.literal("empty"), ...fileBase, reason }),
  z.object({ status: z.literal("unreadable"), ...fileBase, reason }),
  z.object({ status: z.literal("unsupported"), ...fileBase, reason, detectedMimeType: z.string().nullable() }),
  z.object({ status: z.literal("too_large"), ...fileBase, reason }),
]);
export type FileUploadResult = z.infer<typeof FileUploadResultSchema>;

export const UploadDocumentsResponseSchema = z
  .object({
    results: z.array(FileUploadResultSchema).min(1).max(UPLOAD_LIMITS.maxFiles),
    acceptedCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
  })
  .refine(
    (r) =>
      r.acceptedCount === r.results.filter((f) => f.status === "ok").length &&
      r.acceptedCount + r.rejectedCount === r.results.length,
    { message: "acceptedCount/rejectedCount must match results" },
  );
export type UploadDocumentsResponse = z.infer<typeof UploadDocumentsResponseSchema>;
