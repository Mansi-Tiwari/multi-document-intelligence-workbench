import { ExtractionTimeoutError } from "../../domain/extraction";

/**
 * Runs `task` with an AbortSignal and rejects with `ExtractionTimeoutError` after `timeoutMs`.
 * On timeout the signal is aborted. The timer is cleared on every path.
 * Note: tasks that cannot be cancelled (e.g. PDF.js mid-parse) keep running in the background,
 * but this promise still settles promptly.
 */
export async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new ExtractionTimeoutError(timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    // Promise.resolve().then(...) turns a synchronous throw from `task` into a rejection.
    return await Promise.race([Promise.resolve().then(() => task(controller.signal)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
