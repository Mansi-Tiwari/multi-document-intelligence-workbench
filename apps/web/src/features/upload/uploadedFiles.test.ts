import type { DocumentSummary, UploadDocumentsResponse } from "@mdiw/shared";
import { must } from "../../test/must";
import { describe, expect, it } from "vitest";
import {
  addBatch,
  entriesFromResponse,
  selectableDocuments,
  selectedDocuments,
  summarizeUpload,
  toggleId,
} from "./uploadedFiles";

function doc(id: string, filename: string): DocumentSummary {
  return {
    id,
    filename,
    kind: "text",
    mimeType: "text/plain",
    sizeBytes: 10,
    sha256: "a".repeat(64),
    pageCount: null,
    charCount: 10,
    createdAt: "2026-01-31T12:00:00.000Z",
  };
}

const A = doc("00000000-0000-4000-8000-00000000000a", "a.txt");
const B = doc("00000000-0000-4000-8000-00000000000b", "b.txt");

const response: UploadDocumentsResponse = {
  results: [
    { status: "ok", filename: "a.txt", sizeBytes: 10, document: A },
    { status: "unsupported", filename: "x.pdf", sizeBytes: 10, reason: "Not a PDF.", detectedMimeType: null },
    { status: "ok", filename: "b.txt", sizeBytes: 10, document: B },
  ],
  acceptedCount: 2,
  rejectedCount: 1,
};

describe("uploaded entries", () => {
  it("keys entries by batch and index and puts newer batches first", () => {
    const first = entriesFromResponse(response, 1);
    const second = entriesFromResponse({ ...response, results: [must(response.results[0])] }, 2);
    expect(first.map((e) => e.key)).toEqual(["1-0", "1-1", "1-2"]);
    expect(addBatch(first, second).map((e) => e.key)).toEqual(["2-0", "1-0", "1-1", "1-2"]);
  });

  it("only offers ok documents for selection, once each", () => {
    const entries = addBatch(entriesFromResponse(response, 1), entriesFromResponse(response, 2));
    expect(selectableDocuments(entries).map((d) => d.filename)).toEqual(["a.txt", "b.txt"]);
  });

  it("returns selected documents in selection order and ignores unknown ids", () => {
    const entries = entriesFromResponse(response, 1);
    expect(selectedDocuments(entries, [B.id, "missing", A.id]).map((d) => d.filename)).toEqual(["b.txt", "a.txt"]);
  });

  it("toggles ids", () => {
    expect(toggleId([A.id], B.id)).toEqual([A.id, B.id]);
    expect(toggleId([A.id, B.id], A.id)).toEqual([B.id]);
  });

  it("summarizes an upload for the live region", () => {
    expect(summarizeUpload(response)).toBe("Uploaded 3 files: 2 accepted, 1 rejected.");
    expect(summarizeUpload({ ...response, acceptedCount: 3, rejectedCount: 0 })).toBe("Uploaded 3 files: all accepted.");
  });
});
