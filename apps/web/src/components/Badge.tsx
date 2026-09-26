import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "error" | "info" | "neutral";

/** A small pill. Always carries text so meaning never depends on colour alone. */
export function Badge({ tone, children, title }: { tone: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}
