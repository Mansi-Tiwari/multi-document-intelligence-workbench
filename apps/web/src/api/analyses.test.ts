import { afterEach, describe, expect, it, vi } from "vitest";
import { DOC_A, DOC_B, responseFixture } from "../features/analysis/__fixtures__/analysis";
import { createAnalysis } from "./analyses";
import { ApiRequestError } from "./client";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

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

describe("createAnalysis", () => {
  it("POSTs the request as JSON and returns the parsed analysis", async () => {
    const fetchMock = stubFetch(201, responseFixture);
    const request = { instruction: "Compare totals", documentIds: [DOC_A, DOC_B] };

    const response = await createAnalysis(request);

    expect(response.analysis.documents).toHaveLength(3);
    expect(response.skipped).toHaveLength(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBe("/api/analyses");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify(request));
  });

  it("surfaces NOTHING_TO_ANALYZE with its issues", async () => {
    stubFetch(422, {
      error: {
        code: "NOTHING_TO_ANALYZE",
        message: "None of the selected documents could be analyzed.",
        issues: [{ path: `documentIds.0`, message: "a.pdf: analysis failed" }],
        requestId: "r-1",
      },
    });

    const error: unknown = await createAnalysis({ instruction: "Compare", documentIds: [DOC_A] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 422,
      code: "NOTHING_TO_ANALYZE",
      issues: [{ path: "documentIds.0", message: "a.pdf: analysis failed" }],
      requestId: "r-1",
    });
  });
});
