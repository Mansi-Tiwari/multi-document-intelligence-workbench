import type { DocumentSummary, FileUploadResult, FileUploadStatus, UploadDocumentsResponse } from "@mdiw/shared";

/** One file from one upload request. `ok` entries carry the stored document's summary. */
export interface UploadedEntry {
  /** Unique per upload (the same document can be uploaded twice). */
  readonly key: string;
  readonly result: FileUploadResult;
}

export type StatusTone = "ok" | "warn" | "error";

export const UPLOAD_STATUS_META: Readonly<Record<FileUploadStatus, { label: string; tone: StatusTone }>> = {
  ok: { label: "OK", tone: "ok" },
  empty: { label: "Empty", tone: "warn" },
  unreadable: { label: "Unreadable", tone: "error" },
  unsupported: { label: "Unsupported", tone: "error" },
  too_large: { label: "Too large", tone: "warn" },
};

export const DOCUMENT_KIND_LABEL: Readonly<Record<DocumentSummary["kind"], string>> = {
  pdf: "PDF",
  text: "Text",
  csv: "CSV",
};

export function entriesFromResponse(response: UploadDocumentsResponse, batchId: number): UploadedEntry[] {
  return response.results.map((result, index) => ({ key: `${batchId}-${index}`, result }));
}

/** Newest batch first; order within a batch is the upload order. */
export function addBatch(current: readonly UploadedEntry[], batch: readonly UploadedEntry[]): UploadedEntry[] {
  return [...batch, ...current];
}

/** The distinct documents that can be selected (only `ok` results), in list order. */
export function selectableDocuments(entries: readonly UploadedEntry[]): DocumentSummary[] {
  const seen = new Set<string>();
  const documents: DocumentSummary[] = [];
  for (const { result } of entries) {
    if (result.status !== "ok" || seen.has(result.document.id)) continue;
    seen.add(result.document.id);
    documents.push(result.document);
  }
  return documents;
}

export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

/** The selected documents, in the order they were selected. Unknown ids are ignored. */
export function selectedDocuments(entries: readonly UploadedEntry[], selectedIds: readonly string[]): DocumentSummary[] {
  const byId = new Map(selectableDocuments(entries).map((doc) => [doc.id, doc]));
  return selectedIds.flatMap((id) => {
    const doc = byId.get(id);
    return doc ? [doc] : [];
  });
}

export function summarizeUpload(response: UploadDocumentsResponse): string {
  const total = response.results.length;
  const files = total === 1 ? "file" : "files";
  if (response.rejectedCount === 0) return `Uploaded ${total} ${files}: all accepted.`;
  if (response.acceptedCount === 0) return `Uploaded ${total} ${files}: none accepted. See the reasons below.`;
  return `Uploaded ${total} ${files}: ${response.acceptedCount} accepted, ${response.rejectedCount} rejected.`;
}
