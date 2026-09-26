import { useEffect, useRef, useState } from "react";

interface CopyButtonProps {
  /** Performs the copy; resolves to whether it worked. */
  onCopy: () => Promise<boolean>;
  /** Accessible name, e.g. "Copy finding: Total amount". */
  label: string;
  text?: string;
}

/** A small button whose text briefly confirms the copy. Screen readers get the panel's live region. */
export function CopyButton({ onCopy, label, text = "Copy" }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const handleClick = async () => {
    const ok = await onCopy();
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState("idle");
    }, 2000);
  };

  return (
    <button type="button" className="button button--small button--ghost" onClick={() => void handleClick()} aria-label={label}>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : text}
    </button>
  );
}
