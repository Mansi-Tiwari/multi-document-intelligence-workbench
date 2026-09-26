import { UPLOAD_LIMITS, UploadDocumentsResponseSchema } from "@mdiw/shared";
import type { UploadDocumentsResponse } from "@mdiw/shared";
import { apiRequest } from "./client";

/**
 * Uploads files as one multipart request (field `UPLOAD_LIMITS.fieldName`).
 * Per-file outcomes (ok / empty / unreadable / unsupported / too_large) are in `results`;
 * request-level failures (400/413/429/500, network) throw `ApiRequestError`.
 */
export function uploadDocuments(files: readonly File[], signal?: AbortSignal): Promise<UploadDocumentsResponse> {
  const body = new FormData();
  for (const file of files) {
    body.append(UPLOAD_LIMITS.fieldName, file, file.name);
  }
  return apiRequest("/api/documents", UploadDocumentsResponseSchema, {
    method: "POST",
    body,
    ...(signal ? { signal } : {}),
  });
}
