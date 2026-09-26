import { HealthResponseSchema } from "@mdiw/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiRequest, toApiRequestError } from "./client";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function stubFetch(response: Response) {
  const fetchMock = vi.fn((..._args: FetchArgs) => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubFetchRejecting(error: Error) {
  const fetchMock = vi.fn((..._args: FetchArgs) => Promise.reject(error));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function captureError(promise: Promise<unknown>): Promise<ApiRequestError> {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof ApiRequestError)) {
    throw new Error(`Expected ApiRequestError, got ${String(error)}`);
  }
  return error;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("returns the parsed body for an ok response and asks for JSON", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { status: "ok" }));

    await expect(apiRequest("/api/health", HealthResponseSchema)).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBe("/api/health");
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
  });

  it("keeps the server's code, message, issues and requestId for an error response", async () => {
    stubFetch(
      jsonResponse(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request.",
          issues: [{ path: "files", message: "Too many files" }],
          requestId: "req-123",
        },
      }),
    );

    const error = await captureError(apiRequest("/api/documents", HealthResponseSchema));
    expect(error).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid request.",
      issues: [{ path: "files", message: "Too many files" }],
      requestId: "req-123",
    });
  });

  it("falls back to the X-Request-Id header when the body has no requestId", async () => {
    stubFetch(jsonResponse(429, { error: { code: "RATE_LIMITED", message: "Slow down." } }, { "X-Request-Id": "hdr-1" }));

    const error = await captureError(apiRequest("/api/documents", HealthResponseSchema));
    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED", requestId: "hdr-1", issues: undefined });
  });

  it("derives a code from the status when the error body is not an ApiError", async () => {
    stubFetch(new Response("<html>Payload Too Large</html>", { status: 413 }));

    const error = await captureError(apiRequest("/api/documents", HealthResponseSchema));
    expect(error).toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
  });

  it("uses INTERNAL_ERROR for unknown statuses without an ApiError body", async () => {
    stubFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const error = await captureError(apiRequest("/api/health", HealthResponseSchema));
    expect(error).toMatchObject({ status: 502, code: "INTERNAL_ERROR" });
  });

  it("turns a rejected fetch (server down) into NETWORK_ERROR with a friendly message", async () => {
    stubFetchRejecting(new TypeError("Failed to fetch"));

    const error = await captureError(apiRequest("/api/health", HealthResponseSchema));
    expect(error.status).toBe(0);
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.message).toMatch(/could not reach the server/i);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it("reports ABORTED when the request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    stubFetchRejecting(new DOMException("The operation was aborted.", "AbortError"));

    const error = await captureError(apiRequest("/api/health", HealthResponseSchema, { signal: controller.signal }));
    expect(error.code).toBe("ABORTED");
  });

  it("throws INVALID_RESPONSE (not a ZodError) when an ok response does not match the schema", async () => {
    stubFetch(jsonResponse(200, { status: "degraded" }, { "X-Request-Id": "req-9" }));

    const error = await captureError(apiRequest("/api/health", HealthResponseSchema));
    expect(error.code).toBe("INVALID_RESPONSE");
    expect(error.status).toBe(200);
    expect(error.requestId).toBe("req-9");
    expect(error.issues?.[0]?.path).toBe("status");
  });

  it("sends FormData untouched and never sets Content-Type itself", async () => {
    const fetchMock = stubFetch(jsonResponse(200, { status: "ok" }));
    const body = new FormData();
    body.append("files", new File(["hello"], "a.txt", { type: "text/plain" }));

    await apiRequest("/api/health", HealthResponseSchema, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe(body);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });
});

describe("toApiRequestError", () => {
  it("returns ApiRequestError instances unchanged", () => {
    const original = new ApiRequestError({ status: 404, code: "NOT_FOUND", message: "Nope." });
    expect(toApiRequestError(original)).toBe(original);
  });

  it("wraps unknown errors as UNEXPECTED_ERROR", () => {
    expect(toApiRequestError(new Error("boom"))).toMatchObject({ status: 0, code: "UNEXPECTED_ERROR" });
  });
});
