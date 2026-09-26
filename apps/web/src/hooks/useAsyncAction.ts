import { useCallback, useEffect, useRef, useState } from "react";
import { toApiRequestError } from "../api/client";
import type { ApiRequestError } from "../api/client";

export type AsyncActionState<R> =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; data: R }
  | { status: "error"; error: ApiRequestError };

/**
 * Runs an API call on demand (e.g. from a button). Starting a new run aborts the previous one,
 * and unmounting aborts whatever is in flight. `action` must be stable (e.g. module-level).
 * `run` resolves to the data, or `undefined` when the call failed or was superseded.
 */
export function useAsyncAction<A extends readonly unknown[], R>(action: (signal: AbortSignal, ...args: A) => Promise<R>) {
  const [state, setState] = useState<AsyncActionState<R>>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: "pending" });
      try {
        const data = await action(controller.signal, ...args);
        if (controller.signal.aborted) return undefined;
        setState({ status: "success", data });
        return data;
      } catch (error: unknown) {
        if (controller.signal.aborted) return undefined;
        setState({ status: "error", error: toApiRequestError(error) });
        return undefined;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [action],
  );

  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, run, reset };
}
