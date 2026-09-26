import { HealthResponseSchema } from "@mdiw/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiRequest } from "./client";

function stubFetch(response: Response) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("returns the parsed body for an ok response", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { status: "ok" }));

    await expect(apiRequest("/api/health", HealthResponseSchema)).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/health");
  });

  it("throws ApiRequestError with the server's code for an error response", async () => {
    stubFetch(
      jsonResponse(404, {
        error: { code: "NOT_FOUND", message: "Document not found.", issues: [{ path: "id", message: "unknown" }] },
      }),
    );

    const error: unknown = await apiRequest("/api/documents/x", HealthResponseSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Document not found.",
      issues: [{ path: "id", message: "unknown" }],
    });
  });

  it("falls back to INTERNAL_ERROR when the error body is not an ApiError", async () => {
    stubFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const error: unknown = await apiRequest("/api/health", HealthResponseSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 502, code: "INTERNAL_ERROR" });
  });

  it("throws when an ok response does not match the schema", async () => {
    stubFetch(jsonResponse(200, { status: "degraded" }));

    await expect(apiRequest("/api/health", HealthResponseSchema)).rejects.toThrow();
  });
});
