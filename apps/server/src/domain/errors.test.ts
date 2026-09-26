import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AppError,
  ExtractionError,
  FileTooLargeError,
  LlmError,
  NotFoundError,
  RateLimitedError,
  UnsupportedFileError,
  ValidationError,
  zodIssuesToApiIssues,
} from "./errors";

describe("domain errors", () => {
  it.each([
    [new ValidationError("bad"), 400, "VALIDATION_ERROR"],
    [new NotFoundError("missing"), 404, "NOT_FOUND"],
    [new FileTooLargeError("big"), 413, "FILE_TOO_LARGE"],
    [new UnsupportedFileError("nope"), 415, "UNSUPPORTED_FILE"],
    [new ExtractionError("no text"), 422, "EXTRACTION_FAILED"],
    [new RateLimitedError(), 429, "RATE_LIMITED"],
    [new LlmError("llm down"), 502, "LLM_ERROR"],
  ])("%s has the right status and code", (error, status, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });

  it("keeps the cause", () => {
    const cause = new Error("root");
    expect(new LlmError("failed", cause).cause).toBe(cause);
  });

  it("converts Zod issues with dot-joined paths", () => {
    const result = z.object({ a: z.object({ b: z.array(z.string()) }), c: z.number() }).safeParse({
      a: { b: ["ok", 1] },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = zodIssuesToApiIssues(result.error);
    expect(issues.map((issue) => issue.path)).toEqual(["a.b.1", "c"]);
    expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
  });
});
