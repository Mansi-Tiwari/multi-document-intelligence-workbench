import { CreateAnalysisResponseSchema } from "@mdiw/shared";
import type { CreateAnalysisRequest, CreateAnalysisResponse } from "@mdiw/shared";
import { apiRequest } from "./client";

/**
 * `POST /api/analyses`: runs the analysis synchronously and returns it with any skipped documents.
 * A 422 `NOTHING_TO_ANALYZE` (every document skipped) throws `ApiRequestError` whose `issues` hold the reasons.
 */
export function createAnalysis(request: CreateAnalysisRequest, signal?: AbortSignal): Promise<CreateAnalysisResponse> {
  return apiRequest("/api/analyses", CreateAnalysisResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  });
}
