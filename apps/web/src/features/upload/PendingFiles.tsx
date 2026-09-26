import { formatBytes } from "../../lib/format";
import type { SelectionCheck } from "./validateSelection";
import { fileIdentity } from "./validateSelection";

interface PendingFilesProps {
  check: SelectionCheck<File>;
  disabled: boolean;
  onRemove: (file: File) => void;
}

/** Files chosen but not uploaded yet, with client-side pre-check problems. */
export function PendingFiles({ check, disabled, onRemove }: PendingFilesProps) {
  const rows = [
    ...check.accepted.map((file) => ({ file, reason: null })),
    ...check.rejected.map(({ file, reason }) => ({ file, reason })),
  ];
  if (rows.length === 0) return null;

  return (
    <div className="pending">
      <h3 className="subheading">Ready to upload</h3>
      {check.batchError !== null && (
        <p className="inline-error" role="alert">
          {check.batchError}
        </p>
      )}
      <ul className="file-list">
        {rows.map(({ file, reason }) => (
          <li key={fileIdentity(file)} className="file-row">
            <div className="file-row__main">
              <span className="file-row__name">{file.name}</span>
              <span className="file-row__meta">
                {formatBytes(file.size)}
                {reason !== null && <> · <span className="file-row__reason">Won't be uploaded: {reason}</span></>}
              </span>
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => {
                onRemove(file);
              }}
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
