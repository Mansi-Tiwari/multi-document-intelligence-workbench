import { useRef, useState } from "react";
import type { UploadDocumentsResponse } from "@mdiw/shared";
import { ErrorBanner } from "./components/ErrorBanner";
import { HealthBadge } from "./components/HealthBadge";
import { AnalysisPanel } from "./features/analysis/AnalysisPanel";
import { UploadPanel } from "./features/upload/UploadPanel";
import type { UploadedEntry } from "./features/upload/uploadedFiles";
import { addBatch, entriesFromResponse, selectableDocuments, selectedDocuments, toggleId } from "./features/upload/uploadedFiles";
import { useHealth } from "./hooks/useHealth";

export function App() {
  const health = useHealth();
  const [healthBannerDismissed, setHealthBannerDismissed] = useState(false);

  // Uploaded files live in memory until `GET /api/documents` is wired up.
  const [entries, setEntries] = useState<UploadedEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const batchCounter = useRef(0);

  const selectable = selectableDocuments(entries);
  const selected = selectedDocuments(entries, selectedIds);

  const handleUploaded = (response: UploadDocumentsResponse) => {
    batchCounter.current += 1;
    const batch = entriesFromResponse(response, batchCounter.current);
    setEntries((current) => addBatch(current, batch));
  };

  const toggle = (documentId: string) => {
    setSelectedIds((current) => toggleId(current, documentId));
  };

  const retryHealth = () => {
    setHealthBannerDismissed(false);
    health.retry();
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <h1 className="app__title">Multi-Document Intelligence Workbench</h1>
          <p className="app__tagline">
            Upload documents, give one instruction, get structured per-document and cross-document analysis.
          </p>
        </div>
        <HealthBadge state={health.state} />
      </header>

      {health.state.kind === "unreachable" && !healthBannerDismissed && (
        <div className="app__banner">
          <ErrorBanner
            error={health.state.error}
            title="API unreachable"
            action={{ label: "Retry", onClick: retryHealth }}
            onDismiss={() => {
              setHealthBannerDismissed(true);
            }}
          />
        </div>
      )}

      <main className="app__main">
        <UploadPanel
          entries={entries}
          selectedIds={selected.map((d) => d.id)}
          selectableCount={selectable.length}
          onUploaded={handleUploaded}
          onToggle={toggle}
          onSelectAll={() => {
            setSelectedIds((current) => [
              ...current,
              ...selectable.map((d) => d.id).filter((id) => !current.includes(id)),
            ]);
          }}
          onClearSelection={() => {
            setSelectedIds([]);
          }}
        />
        <AnalysisPanel selected={selected} onDeselect={toggle} />
      </main>
    </div>
  );
}
