import { HealthResponseSchema } from "@mdiw/shared";
import type { HealthResponse } from "@mdiw/shared";
import { apiRequest } from "./client";

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest("/api/health", HealthResponseSchema, signal ? { signal } : undefined);
}
