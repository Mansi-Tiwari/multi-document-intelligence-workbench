import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "../../ports/LlmProvider";
import { AnthropicLlmProvider, type MessagesClient } from "./AnthropicLlmProvider";
import { MockLlmProvider } from "./MockLlmProvider";

/** The validated env settings this factory needs (structurally a subset of `Env`). */
export type LlmProviderConfig = {
  LLM_PROVIDER: "auto" | "mock" | "anthropic";
  LLM_MODEL: string;
  ANTHROPIC_API_KEY?: string | undefined;
};

export type CreatedLlmProvider = {
  provider: LlmProvider;
  /** Why this provider was chosen, for the startup log. */
  reason: string;
};

export type CreateLlmProviderDeps = {
  createClient?: (apiKey: string) => MessagesClient;
};

const defaultCreateClient = (apiKey: string): MessagesClient => new Anthropic({ apiKey });

/**
 * `auto` → anthropic when ANTHROPIC_API_KEY is set, otherwise mock.
 * `anthropic` without a key is rejected by env validation; this re-checks defensively.
 */
export function createLlmProvider(config: LlmProviderConfig, deps: CreateLlmProviderDeps = {}): CreatedLlmProvider {
  const createClient = deps.createClient ?? defaultCreateClient;
  const apiKey = config.ANTHROPIC_API_KEY;

  const anthropic = (key: string, reason: string): CreatedLlmProvider => ({
    provider: new AnthropicLlmProvider({ client: createClient(key), model: config.LLM_MODEL }),
    reason,
  });

  switch (config.LLM_PROVIDER) {
    case "mock":
      return { provider: new MockLlmProvider(), reason: "LLM_PROVIDER=mock" };
    case "anthropic":
      if (apiKey === undefined) throw new Error("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
      return anthropic(apiKey, "LLM_PROVIDER=anthropic");
    case "auto":
      return apiKey === undefined
        ? { provider: new MockLlmProvider(), reason: "no ANTHROPIC_API_KEY" }
        : anthropic(apiKey, "ANTHROPIC_API_KEY is set");
  }
}
