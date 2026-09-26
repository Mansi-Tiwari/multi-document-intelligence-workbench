import { useState } from "react";
import type { UploadDocumentsResponse } from "@mdiw/shared";
import { uploadDocuments } from "../../api/documents";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { errorTitle } from "../../lib/errors";
import { DropZone } from "./DropZone";
import { PendingFiles } from "./PendingFiles";
import { UploadedFileList } from "./UploadedFileList";
import type { UploadedEntry } from "./uploadedFiles";
import { summarizeUpload } from "./uploadedFiles";
import { fileIdentity, mergeFiles, validateSelection } from "./validateSelection";

interface UploadPanelProps {
  entries: readonly UploadedEntry[];
  selectedIds: readonly string[];
  selectableCount: number;
  onUploaded: (response: UploadDocumentsResponse) => void;
  onToggle: (documentId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

const upload = (signal: AbortSignal, files: readonly File[]) => uploadDocuments(files, signal);

export function UploadPanel({ entries, onUploaded, ...listProps }: UploadPanelProps) {
  const [pending, setPending] = useState<File[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const { state, run, reset } = useAsyncAction(upload);

  const uploading = state.status === "pending";
  const check = validateSelection(pending);

  const addFiles = (files: File[]) => {
    setPending((current) => mergeFiles(current, files));
    setAnnouncement("");
  };

  const removeFile = (file: File) => {
    const id = fileIdentity(file);
    setPending((current) => current.filter((f) => fileIdentity(f) !== id));
  };

  const submit = async () => {
    if (!check.canUpload) return;
    setAnnouncement("");
    const response = await run(check.accepted);
    if (response === undefined) return;
    onUploaded(response);
    setPending([]);
    setAnnouncement(summarizeUpload(response));
  };

  return (
    <section className="panel" aria-labelledby="documents-heading">
      <h2 className="panel__title" id="documents-heading">
        Documents
      </h2>

      <DropZone disabled={uploading} onFiles={addFiles} />
      <PendingFiles check={check} disabled={uploading} onRemove={removeFile} />

      {pending.length > 0 && (
        <div className="actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void submit()}
            disabled={!check.canUpload || uploading}
            aria-busy={uploading}
          >
            {uploading ? "Uploading…" : `Upload ${check.accepted.length} ${check.accepted.length === 1 ? "file" : "files"}`}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              setPending([]);
            }}
            disabled={uploading}
          >
            Clear
          </button>
        </div>
      )}

      {state.status === "error" && state.error.code !== "ABORTED" && (
        <ErrorBanner error={state.error} title={`Upload failed: ${errorTitle(state.error.code)}`} onDismiss={reset} />
      )}

      <p className="live-note" role="status" aria-live="polite">
        {announcement}
      </p>

      <h3 className="subheading">Your documents</h3>
      <UploadedFileList entries={entries} {...listProps} />
    </section>
  );
}
