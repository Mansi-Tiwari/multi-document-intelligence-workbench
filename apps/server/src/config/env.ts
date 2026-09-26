import { z } from "zod";

/** An exact browser origin: http(s) scheme, host and optional port; no path, query or trailing slash. */
export const OriginSchema = z
  .url({ protocol: /^https?$/ })
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, {
    message: "Must be an origin such as http://localhost:5173 (no path or trailing slash)",
  });

/** Comma-separated list of origins, e.g. "http://localhost:5173,https://app.example.com". */
export const CorsOriginsSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ""),
  )
  .pipe(z.array(OriginSchema).min(1));

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_PATH: z.string().min(1).default("./data/workbench.sqlite"),
  LLM_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  LLM_MODEL: z.string().min(1).default("claude-opus-5"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANALYSIS_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  CORS_ORIGINS: CorsOriginsSchema.prefault("http://localhost:5173"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(120),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvValidationError extends Error {
  override readonly name = "EnvValidationError";
}

/** Drops unset and blank (empty or whitespace-only) values so `KEY=` in .env counts as unset. */
function withoutBlankValues(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "",
    ),
  );
}

/** Parses and validates the environment once at startup. Unknown keys are stripped. */
export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(withoutBlankValues(source));
  if (!result.success) {
    throw new EnvValidationError(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
