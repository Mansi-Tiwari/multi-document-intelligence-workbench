import { ApiErrorSchema } from "@mdiw/shared";
import type { ApiErrorIssue, ErrorCode } from "@mdiw/shared";
import type { z } from "zod";

/** Codes that only the client produces (no HTTP response, or an unusable one). */
export type ClientOnlyErrorCode = "NETWORK_ERROR" | "INVALID_RESPONSE" | "ABORTED" | "UNEXPECTED_ERROR";
export type ClientErrorCode = ErrorCode | ClientOnlyErrorCode;

export interface ApiRequestErrorInit {
  /** HTTP status, or `0` when no response was received. */
  status: number;
  code: ClientErrorCode;
  message: string;
  issues?: readonly ApiErrorIssue[] | undefined;
  requestId?: string | undefined;
  cause?: unknown;
}

/** Every failure of `apiRequest` — HTTP error, network failure, abort or invalid response. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly issues: readonly ApiErrorIssue[] | undefined;
  readonly requestId: string | undefined;

  constructor({ status, code, message, issues, requestId, cause }: ApiRequestErrorInit) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.requestId = requestId;
  }
}

/** Normalizes anything thrown into an `ApiRequestError` (for UI code that catches `unknown`). */
export function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (isAbortError(error)) {
    return new ApiRequestError({ status: 0, code: "ABORTED", message: "The request was cancelled.", cause: error });
  }
  return new ApiRequestError({
    status: 0,
    code: "UNEXPECTED_ERROR",
    message: "Something went wrong. Please try again.",
    cause: error,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Reads the body as `unknown`: `undefined` when empty (e.g. 204), raw text when not JSON. */
async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (text.trim() === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return text;
  }
}

/** Best guess for error responses that don't carry an `ApiError` body (e.g. from a proxy). */
function fallbackCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 404:
      return "NOT_FOUND";
    case 413:
      return "FILE_TOO_LARGE";
    case 415:
      return "UNSUPPORTED_FILE";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_ERROR";
  }
}

function responseRequestId(response: Response): string | undefined {
  return response.headers.get("X-Request-Id") ?? undefined;
}

function toHttpError(response: Response, body: unknown): ApiRequestError {
  const parsed = ApiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, issues, requestId } = parsed.data.error;
    return new ApiRequestError({
      status: response.status,
      code,
      message,
      issues,
      requestId: requestId ?? responseRequestId(response),
    });
  }
  return new ApiRequestError({
    status: response.status,
    code: fallbackCode(response.status),
    message: `Request failed with status ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
    requestId: responseRequestId(response),
  });
}

function networkError(cause: unknown): ApiRequestError {
  return new ApiRequestError({
    status: 0,
    code: "NETWORK_ERROR",
    message: "Could not reach the server. Check that the API is running and your connection is working, then try again.",
    cause,
  });
}

/**
 * The only place in the web app that calls `fetch`.
 * Successful responses are validated with `schema`. Every failure is thrown as an `ApiRequestError`:
 * HTTP errors keep the server's code, message, issues and request id; network failures become
 * `NETWORK_ERROR`, aborts `ABORTED`, and bodies that fail validation `INVALID_RESPONSE`.
 * `FormData` bodies are sent as-is so the browser sets the multipart boundary.
 */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.output<S>> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init?.body instanceof FormData) headers.delete("Content-Type");

  let response: Response;
  let body: unknown;
  try {
    response = await fetch(path, { ...init, headers });
    body = await readBody(response);
  } catch (error: unknown) {
    if (isAbortError(error) || init?.signal?.aborted === true) {
      throw new ApiRequestError({ status: 0, code: "ABORTED", message: "The request was cancelled.", cause: error });
    }
    throw networkError(error);
  }

  if (!response.ok) {
    throw toHttpError(response, body);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiRequestError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "The server sent a response the app did not understand. Please try again or report the request id.",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
      requestId: responseRequestId(response),
      cause: parsed.error,
    });
  }
  return parsed.data;
}
