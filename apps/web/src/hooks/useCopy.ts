import { useCallback, useEffect, useRef, useState } from "react";
import { copyToClipboard } from "../lib/clipboard";

/**
 * Copy-to-clipboard with a short-lived status message for an aria-live region.
 * `copy` resolves to whether it worked.
 */
export function useCopy(resetAfterMs = 2500) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string, what: string): Promise<boolean> => {
      const ok = await copyToClipboard(text);
      setMessage(ok ? `Copied ${what}.` : `Couldn't copy ${what}. Select the text and copy it manually.`);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setMessage("");
      }, resetAfterMs);
      return ok;
    },
    [resetAfterMs],
  );

  return { copy, message };
}
