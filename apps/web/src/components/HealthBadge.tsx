import type { HealthState } from "../hooks/useHealth";

const LABEL: Record<HealthState["kind"], string> = {
  checking: "Checking API…",
  online: "API online",
  unreachable: "API unreachable",
};

export function HealthBadge({ state }: { state: HealthState }) {
  return (
    <p className={`health health--${state.kind}`} role="status">
      <span className="health__dot" aria-hidden="true" />
      {LABEL[state.kind]}
    </p>
  );
}
