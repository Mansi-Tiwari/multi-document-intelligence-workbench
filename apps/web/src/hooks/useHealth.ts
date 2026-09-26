import { useCallback, useEffect, useState } from "react";
import { toApiRequestError } from "../api/client";
import type { ApiRequestError } from "../api/client";
import { getHealth } from "../api/health";

export type HealthState =
  | { kind: "checking" }
  | { kind: "online" }
  | { kind: "unreachable"; error: ApiRequestError };

/** Checks `GET /api/health` on mount and whenever `retry` is called. */
export function useHealth() {
  const [state, setState] = useState<HealthState>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal).then(
      () => {
        setState({ kind: "online" });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "unreachable", error: toApiRequestError(error) });
      },
    );
    return () => {
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ kind: "checking" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
