import { useId } from "react";
import type { ApiRequestError } from "../api/client";
import { errorTitle } from "../lib/errors";

interface ErrorBannerProps {
  error: ApiRequestError;
  /** Overrides the default heading derived from the error code. */
  title?: string;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}

/** Renders an API failure: message, field-level issues, and the request id for bug reports. */
export function ErrorBanner({ error, title, onDismiss, action }: ErrorBannerProps) {
  const headingId = useId();
  const issues = error.issues ?? [];
  return (
    <div className="error-banner" role="alert" aria-labelledby={headingId}>
      <div className="error-banner__body">
        <p className="error-banner__title" id={headingId}>
          {title ?? errorTitle(error.code)}
        </p>
        <p className="error-banner__message">{error.message}</p>
        {issues.length > 0 && (
          <ul className="error-banner__issues">
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                {issue.path !== "" && <code className="error-banner__path">{issue.path}</code>}
                {issue.path !== "" && ": "}
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        {error.requestId !== undefined && (
          <p className="error-banner__meta">
            Request ID: <code>{error.requestId}</code>
          </p>
        )}
      </div>
      {(action !== undefined || onDismiss !== undefined) && (
        <div className="error-banner__actions">
          {action !== undefined && (
            <button type="button" className="button" onClick={action.onClick}>
              {action.label}
            </button>
          )}
          {onDismiss !== undefined && (
            <button type="button" className="button button--ghost" onClick={onDismiss} aria-label="Dismiss error">
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
