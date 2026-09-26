import { UPLOAD_LIMITS } from "@mdiw/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./client";
import { uploadDocuments } from "./documents";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

const documentSummary = {
  id: "7f3c8a52-2f1e-4b8e-9b0a-2d4f6e8c1a3b",
  filename: "a.txt",
  kind: "text",
  mimeType: "text/plain",
  sizeBytes: 5,
  sha256: "a".repeat(64),
  pageCount: null,
  charCount: 5,
  createdAt: "2026-01-31T12:00:00.000Z",
};

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn((..._args: FetchArgs) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadDocuments", () => {
  it("POSTs every file under the shared field name and returns the parsed response", async () => {
    const fetchMock = stubFetch(201, {
      results: [
        { status: "ok", filename: "a.txt", sizeBytes: 5, document: documentSummary },
        { status: "empty", filename: "b.md", sizeBytes: 0, reason: "The file is empty." },
      ],
      acceptedCount: 1,
      rejectedCount: 1,
    });
    const files = [new File(["hello"], "a.txt", { type: "text/plain" }), new File([], "b.md")];

    const response = await uploadDocuments(files);

    expect(response.acceptedCount).toBe(1);
    expect(response.results.map((r) => r.status)).toEqual(["ok", "empty"]);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBe("/api/documents");
    expect(init?.method).toBe("POST");
    const body = init?.body;
    if (!(body instanceof FormData)) throw new Error("Expected a FormData body");
    const sent = body.getAll(UPLOAD_LIMITS.fieldName);
    expect(sent).toHaveLength(2);
    expect(sent.map((entry) => (entry instanceof File ? entry.name : entry))).toEqual(["a.txt", "b.md"]);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("passes the abort signal through", async () => {
    const fetchMock = stubFetch(201, {
      results: [{ status: "ok", filename: "a.txt", sizeBytes: 5, document: documentSummary }],
      acceptedCount: 1,
      rejectedCount: 0,
    });
    const controller = new AbortController();

    await uploadDocuments([new File(["hello"], "a.txt")], controller.signal);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("throws INVALID_RESPONSE when the counts do not match the results", async () => {
    stubFetch(201, {
      results: [{ status: "ok", filename: "a.txt", sizeBytes: 5, document: documentSummary }],
      acceptedCount: 0,
      rejectedCount: 0,
    });

    const error: unknown = await uploadDocuments([new File(["hello"], "a.txt")]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
