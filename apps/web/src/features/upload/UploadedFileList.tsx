import type { FileUploadResult } from "@mdiw/shared";
import { MAX_DOCUMENTS_PER_ANALYSIS } from "@mdiw/shared";
import { Badge } from "../../components/Badge";
import { formatBytes, formatCount, pluralize } from "../../lib/format";
import type { UploadedEntry } from "./uploadedFiles";
import { DOCUMENT_KIND_LABEL, UPLOAD_STATUS_META } from "./uploadedFiles";

interface UploadedFileListProps {
  entries: readonly UploadedEntry[];
  selectedIds: readonly string[];
  selectableCount: number;
  onToggle: (documentId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

function EntryMeta({ result }: { result: FileUploadResult }) {
  if (result.status === "ok") {
    const doc = result.document;
    return (
      <span className="file-row__meta">
        {DOCUMENT_KIND_LABEL[doc.kind]} · {formatBytes(doc.sizeBytes)}
        {doc.pageCount !== null && <> · {pluralize(doc.pageCount, "page")}</>} · {formatCount(doc.charCount)} chars
      </span>
    );
  }
  return (
    <span className="file-row__meta">
      {formatBytes(result.sizeBytes)} · <span className="file-row__reason">{result.reason}</span>
      {result.status === "unsupported" && result.detectedMimeType !== null && (
        <> (detected {result.detectedMimeType})</>
      )}
    </span>
  );
}

/** Every uploaded file with its status. Only `ok` files can be selected for analysis. */
export function UploadedFileList({
  entries,
  selectedIds,
  selectableCount,
  onToggle,
  onSelectAll,
  onClearSelection,
}: UploadedFileListProps) {
  if (entries.length === 0) {
    return <p className="empty-note">No documents yet. Uploaded files will appear here.</p>;
  }

  const selectedCount = selectedIds.length;
  return (
    <div className="uploaded">
      <div className="toolbar">
        <p className="toolbar__count" aria-live="polite">
          {selectedCount} selected
          {selectedCount > MAX_DOCUMENTS_PER_ANALYSIS && (
            <span className="toolbar__warn"> (max {MAX_DOCUMENTS_PER_ANALYSIS} per analysis)</span>
          )}
        </p>
        <div className="toolbar__actions">
          <button
            type="button"
            className="button button--small"
            onClick={onSelectAll}
            disabled={selectableCount === 0 || selectedCount === selectableCount}
          >
            Select all
          </button>
          <button type="button" className="button button--small button--ghost" onClick={onClearSelection} disabled={selectedCount === 0}>
            Clear
          </button>
        </div>
      </div>
      <ul className="file-list">
        {entries.map(({ key, result }) => {
          const meta = UPLOAD_STATUS_META[result.status];
          const inputId = `uploaded-${key}`;
          const isOk = result.status === "ok";
          const checked = isOk && selectedIds.includes(result.document.id);
          return (
            <li key={key} className={`file-row file-row--selectable${isOk ? "" : " file-row--disabled"}`}>
              <input
                id={inputId}
                type="checkbox"
                className="file-row__check"
                checked={checked}
                disabled={!isOk}
                onChange={() => {
                  if (result.status === "ok") onToggle(result.document.id);
                }}
              />
              <label htmlFor={inputId} className="file-row__main">
                <span className="file-row__name">{result.filename}</span>
                <EntryMeta result={result} />
              </label>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
