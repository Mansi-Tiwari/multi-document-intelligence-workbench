import { describe, expect, it, vi } from "vitest";
import { LlmError, NotFoundError } from "../../domain/errors";
import type { ValidationResult } from "../../domain/llm";
import { generateValidated, InvalidLlmOutputError } from "./withValidationRetry";

const validateNumber = (raw: unknown): ValidationResult<number> =>
  typeof raw === "number" ? { ok: true, value: raw } : { ok: false, issues: ["value: expected a number"] };

describe("generateValidated", () => {
  it("returns the first valid reply with a single call", async () => {
    const attempt = vi.fn((_feedback: string | null) => Promise.resolve<unknown>(42));
    await expect(generateValidated({ attempt, validate: validateNumber })).resolves.toBe(42);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(null);
  });

  it("retries once with feedback listing the issues, then succeeds", async () => {
    const replies: unknown[] = ["nope", 7];
    const attempt = vi.fn((_feedback: string | null) => Promise.resolve(replies.shift()));
    await expect(generateValidated({ attempt, validate: validateNumber })).resolves.toBe(7);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(attempt.mock.calls[0]?.[0]).toBeNull();
    expect(attempt.mock.calls[1]?.[0]).toContain("value: expected a number");
  });

  it("throws LlmError after exactly two invalid replies", async () => {
    const attempt = vi.fn((_feedback: string | null) => Promise.resolve<unknown>("bad"));
    const error = await generateValidated({ attempt, validate: validateNumber }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ message: "The AI returned an invalid response twice", status: 502 });
    expect(error).toMatchObject({ cause: { attempts: 2 } });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("counts InvalidLlmOutputError (e.g. bad JSON) as invalid output", async () => {
    const attempt = vi
      .fn<(feedback: string | null) => Promise<unknown>>()
      .mockRejectedValueOnce(new InvalidLlmOutputError(["The response was not valid JSON."]))
      .mockResolvedValueOnce(1);
    await expect(generateValidated({ attempt, validate: validateNumber })).resolves.toBe(1);
    expect(attempt.mock.calls[1]?.[0]).toContain("not valid JSON");
  });

  it("does not retry transport errors and wraps them in LlmError", async () => {
    const attempt = vi.fn((_feedback: string | null) => Promise.reject(new TypeError("fetch failed")));
    const error = await generateValidated({ attempt, validate: validateNumber }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error instanceof LlmError && error.cause).toBeInstanceOf(TypeError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("rethrows AppErrors unchanged without retrying", async () => {
    const original = new NotFoundError("gone");
    const attempt = vi.fn((_feedback: string | null) => Promise.reject(original));
    await expect(generateValidated({ attempt, validate: validateNumber })).rejects.toBe(original);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("honours maxRetries = 0", async () => {
    const attempt = vi.fn((_feedback: string | null) => Promise.resolve<unknown>("bad"));
    await expect(generateValidated({ attempt, validate: validateNumber, maxRetries: 0 })).rejects.toThrow(
      "The AI returned an invalid response",
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
