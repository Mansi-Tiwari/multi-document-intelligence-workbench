import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultExtractionService } from "./adapters/extractors";
import { createLlmProvider } from "./adapters/llm/createLlmProvider";
import { openDatabase } from "./adapters/sqlite/database";
import { SqliteDocumentRepository } from "./adapters/sqlite/SqliteDocumentRepository";
import { createApp } from "./app";
import { DocumentService } from "./services/DocumentService";
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
// Not wired into the app yet; the analysis service will receive it.
const llm = createLlmProvider(env);
console.log(`LLM provider: ${llm.provider.name} (${llm.reason})${llm.provider.name === "anthropic" ? `, model ${llm.provider.model}` : ""}`);

// A relative DATABASE_PATH is resolved against apps/server, whatever the cwd.
const serverRoot = resolve(dirname(envFilePath), "apps/server");
const databasePath = resolve(serverRoot, env.DATABASE_PATH);
const db = openDatabase(databasePath);
console.log(`SQLite database: ${databasePath}`);

const documentService = new DocumentService({
  repository: new SqliteDocumentRepository(db),
  extractor: createDefaultExtractionService({ timeoutMs: env.EXTRACTION_TIMEOUT_MS }),
  newId: randomUUID,
  now: () => new Date(),
});

const app = createApp({
  cors: { origins: env.CORS_ORIGINS },
  rateLimit: { windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX },
  services: { documents: documentService },
});

const server = app.listen(env.PORT, (error?: Error) => {
  if (error) {
    console.error(`Failed to start server on port ${env.PORT}:`, error.message);
    process.exit(1);
  }
  console.log(`Server listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`Received ${signal}, shutting down...`);
  server.close((error) => {
    db.close();
    if (error) {
      console.error("Error while closing server:", error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
