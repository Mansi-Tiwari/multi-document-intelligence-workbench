import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { z } from "zod";

// .env lives at the repo root (shared with the server), two levels up from apps/web.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Empty strings (e.g. `PORT=`) are treated as unset so the default applies. */
const port = (fallback: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1).max(65535).default(fallback),
  );

const DevEnvSchema = z.object({
  PORT: port(3001),
  WEB_PORT: port(5173),
});

export default defineConfig(({ mode }) => {
  const result = DevEnvSchema.safeParse(loadEnv(mode, repoRoot, ""));
  if (!result.success) {
    throw new Error(`Invalid environment for the web dev server:\n${z.prettifyError(result.error)}`);
  }
  const env = result.data;

  return {
    plugins: [react()],
    server: {
      port: env.WEB_PORT,
      strictPort: true,
      proxy: {
        "/api": `http://localhost:${env.PORT}`,
      },
    },
  };
});
