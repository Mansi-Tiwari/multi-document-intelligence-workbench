import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults when nothing is set", () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: "development",
      PORT: 3001,
      DATABASE_PATH: "./data/workbench.sqlite",
      LLM_PROVIDER: "mock",
      LLM_MODEL: "claude-opus-5",
      ANALYSIS_CONCURRENCY: 3,
      CORS_ORIGINS: ["http://localhost:5173"],
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_MAX: 120,
    });
  });

  it("coerces numeric values from strings", () => {
    const env = loadEnv({ PORT: "4000", ANALYSIS_CONCURRENCY: "7" });
    expect(env.PORT).toBe(4000);
    expect(env.ANALYSIS_CONCURRENCY).toBe(7);
  });

  it.each(["abc", "70000", "0", "3.5"])("rejects invalid PORT %s", (port) => {
    expect(() => loadEnv({ PORT: port })).toThrow(EnvValidationError);
  });

  it.each(["0", "11", "x"])("rejects invalid ANALYSIS_CONCURRENCY %s", (value) => {
    expect(() => loadEnv({ ANALYSIS_CONCURRENCY: value })).toThrow(EnvValidationError);
  });

  it("rejects an unknown LLM_PROVIDER with a readable message", () => {
    expect(() => loadEnv({ LLM_PROVIDER: "openai" })).toThrow(/LLM_PROVIDER/);
  });

  it("treats empty and whitespace-only values as unset", () => {
    const env = loadEnv({ ANTHROPIC_API_KEY: "", PORT: "  ", LLM_MODEL: "" });
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env.PORT).toBe(3001);
    expect(env.LLM_MODEL).toBe("claude-opus-5");
  });

  it("keeps a provided ANTHROPIC_API_KEY", () => {
    expect(loadEnv({ ANTHROPIC_API_KEY: "sk-test" }).ANTHROPIC_API_KEY).toBe("sk-test");
  });

  it("strips unknown keys", () => {
    const env = loadEnv({ FOO: "bar", PATH: "/usr/bin" });
    expect(env).not.toHaveProperty("FOO");
    expect(env).not.toHaveProperty("PATH");
  });

  it("parses a comma-separated CORS_ORIGINS list, trimming blanks", () => {
    const env = loadEnv({ CORS_ORIGINS: " http://localhost:5173 , https://app.example.com:8443,," });
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:5173", "https://app.example.com:8443"]);
  });

  it.each([
    "localhost:5173",
    "http://localhost:5173/",
    "https://example.com/app",
    "ftp://example.com",
    "not a url",
    ",",
  ])("rejects invalid CORS_ORIGINS %s", (value) => {
    expect(() => loadEnv({ CORS_ORIGINS: value })).toThrow(/CORS_ORIGINS/);
  });

  it("coerces rate limit settings", () => {
    const env = loadEnv({ RATE_LIMIT_WINDOW_MS: "1000", RATE_LIMIT_MAX: "100000" });
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(1000);
    expect(env.RATE_LIMIT_MAX).toBe(100_000);
  });

  it.each(["999", "3600001", "1.5", "x"])("rejects invalid RATE_LIMIT_WINDOW_MS %s", (value) => {
    expect(() => loadEnv({ RATE_LIMIT_WINDOW_MS: value })).toThrow(/RATE_LIMIT_WINDOW_MS/);
  });

  it.each(["0", "100001", "2.5", "x"])("rejects invalid RATE_LIMIT_MAX %s", (value) => {
    expect(() => loadEnv({ RATE_LIMIT_MAX: value })).toThrow(/RATE_LIMIT_MAX/);
  });
});
