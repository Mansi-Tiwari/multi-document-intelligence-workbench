import { useEffect, useState } from "react";
import { getHealth } from "./api/health";

type HealthState =
  | { kind: "checking" }
  | { kind: "online" }
  | { kind: "unreachable"; message: string };

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return "Unknown error.";
}

function StatusIndicator({ state, onRetry }: { state: HealthState; onRetry: () => void }) {
  switch (state.kind) {
    case "checking":
      return (
        <p className="status status--checking" role="status">
          <span className="status__dot" aria-hidden="true" />
          Checking API…
        </p>
      );
    case "online":
      return (
        <p className="status status--online" role="status">
          <span className="status__dot" aria-hidden="true" />
          API online
        </p>
      );
    case "unreachable":
      return (
        <div className="status status--unreachable" role="alert">
          <span className="status__dot" aria-hidden="true" />
          <span>
            API unreachable: <span className="status__message">{state.message}</span>
          </span>
          <button type="button" className="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      );
  }
}

export function App() {
  const [health, setHealth] = useState<HealthState>(() => ({ kind: "checking" }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal).then(
      () => {
        setHealth({ kind: "online" });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({ kind: "unreachable", message: describeError(error) });
      },
    );
    return () => {
      controller.abort();
    };
  }, [attempt]);

  const retry = () => {
    setHealth({ kind: "checking" });
    setAttempt((n) => n + 1);
  };

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">Multi-Document Intelligence Workbench</h1>
          <p className="app__tagline">
            Upload documents, give one instruction, get structured per-document and cross-document
            analysis.
          </p>
        </div>
        <StatusIndicator state={health} onRetry={retry} />
      </header>
    </div>
  );
}
