import { describe, expect, it, vi } from "vitest";
import type { MessagesClient } from "./AnthropicLlmProvider";
import { createLlmProvider, type LlmProviderConfig } from "./createLlmProvider";

const fakeClient: MessagesClient = {
  messages: { create: () => Promise.reject(new Error("no network in tests")) },
};

describe("createLlmProvider", () => {
  it.each<[LlmProviderConfig["LLM_PROVIDER"], string | undefined, "mock" | "anthropic", string]>([
    ["auto", undefined, "mock", "no ANTHROPIC_API_KEY"],
    ["auto", "sk-test", "anthropic", "ANTHROPIC_API_KEY is set"],
    ["mock", undefined, "mock", "LLM_PROVIDER=mock"],
    ["mock", "sk-test", "mock", "LLM_PROVIDER=mock"],
    ["anthropic", "sk-test", "anthropic", "LLM_PROVIDER=anthropic"],
  ])("LLM_PROVIDER=%s with key %s → %s", (setting, apiKey, expected, reason) => {
    const createClient = vi.fn((_key: string) => fakeClient);
    const created = createLlmProvider(
      { LLM_PROVIDER: setting, LLM_MODEL: "claude-opus-5", ANTHROPIC_API_KEY: apiKey },
      { createClient },
    );
    expect(created.provider.name).toBe(expected);
    expect(created.reason).toBe(reason);
    if (expected === "anthropic") {
      expect(created.provider.model).toBe("claude-opus-5");
      expect(createClient).toHaveBeenCalledWith("sk-test");
    } else {
      expect(createClient).not.toHaveBeenCalled();
    }
  });

  it("refuses LLM_PROVIDER=anthropic without a key", () => {
    expect(() => createLlmProvider({ LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-opus-5" })).toThrow(
      /requires ANTHROPIC_API_KEY/,
    );
  });

  it("builds a real SDK client by default without any network call", () => {
    const created = createLlmProvider({ LLM_PROVIDER: "auto", LLM_MODEL: "claude-opus-5", ANTHROPIC_API_KEY: "sk-test" });
    expect(created.provider.name).toBe("anthropic");
  });
});
