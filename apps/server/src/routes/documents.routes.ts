import { Router } from "express";
import { UPLOAD_LIMITS, UploadDocumentsResponseSchema } from "@mdiw/shared";
import type { UploadLimits } from "@mdiw/shared";
import type { DocumentService } from "../services/DocumentService";
import { readUploadedFiles, uploadFilesMiddleware } from "../http/upload";
import { sendJson } from "../http/sendJson";

export function documentsRouter(service: DocumentService, limits: UploadLimits = UPLOAD_LIMITS): Router {
  const router = Router();

  // multipart/form-data, field `files` (repeatable). Each file gets its own status;
  // 201 when at least one document was stored, otherwise 200.
  router.post("/", uploadFilesMiddleware(limits), async (req, res) => {
    const files = readUploadedFiles(req.files, limits);
    const response = await service.upload(files);
    sendJson(res, response.acceptedCount > 0 ? 201 : 200, UploadDocumentsResponseSchema, response);
  });

  return router;
}
