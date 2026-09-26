import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { EnvValidationError, loadEnv } from "./config/env";
import type { Env } from "./config/env";

// Repo-root .env; the relative path is the same from src/ (tsx) and dist/ (bundle).
const envFilePath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath);
}

function readEnv(): Env {
  try {
    return loadEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const env = readEnv();
const app = createApp();

const server = app.listen(env.PORT, (error?: Error) => {
  if (error) {
    console.error(`Failed to start server on port ${env.PORT}:`, error.message);
    process.exit(1);
  }
  console.log(`Server listening on http://localhost:${env.PORT} (LLM provider: ${env.LLM_PROVIDER})`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`Received ${signal}, shutting down...`);
  server.close((error) => {
    if (error) {
      console.error("Error while closing server:", error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
