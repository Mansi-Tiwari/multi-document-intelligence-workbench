import { ApiErrorSchema } from "@mdiw/shared";
import type { ApiErrorIssue, ErrorCode } from "@mdiw/shared";
import type { z } from "zod";

export interface ApiRequestErrorInit {
  status: number;
  code: ErrorCode;
  message: string;
  issues?: readonly ApiErrorIssue[] | undefined;
}

/** An API call that returned a non-2xx status. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues: readonly ApiErrorIssue[] | undefined;

  constructor({ status, code, message, issues }: ApiRequestErrorInit) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
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

function toApiRequestError(response: Response, body: unknown): ApiRequestError {
  const parsed = ApiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, issues } = parsed.data.error;
    return new ApiRequestError({ status: response.status, code, message, issues });
  }
  return new ApiRequestError({
    status: response.status,
    code: "INTERNAL_ERROR",
    message: `Request failed with status ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
  });
}

/**
 * The only place in the web app that calls `fetch`.
 * Successful responses are validated with `schema`; failures become `ApiRequestError`.
 */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.output<S>> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = await readBody(response);
  if (!response.ok) {
    throw toApiRequestError(response, body);
  }
  return schema.parse(body);
}
