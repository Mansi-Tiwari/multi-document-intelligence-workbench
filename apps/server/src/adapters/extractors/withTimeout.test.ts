import { describe, expect, it, vi } from "vitest";
import { ExtractionTimeoutError } from "../../domain/extraction";
import { withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  it("resolves with the task result and clears the timer", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    await expect(withTimeout(() => Promise.resolve(7), 1_000)).resolves.toBe(7);
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });

  it("propagates task rejection, including synchronous throws", async () => {
    await expect(withTimeout(() => Promise.reject(new Error("boom")), 1_000)).rejects.toThrow("boom");
    await expect(
      withTimeout(() => {
        throw new Error("sync");
      }, 1_000),
    ).rejects.toThrow("sync");
  });

  it("rejects with ExtractionTimeoutError and aborts the signal", async () => {
    let captured: AbortSignal | undefined;
    const pending = withTimeout((signal) => {
      captured = signal;
      return new Promise<never>(() => undefined);
    }, 20);
    await expect(pending).rejects.toBeInstanceOf(ExtractionTimeoutError);
    expect(captured?.aborted).toBe(true);
    expect(captured?.reason).toBeInstanceOf(ExtractionTimeoutError);
  });
});
