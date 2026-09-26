import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { MIGRATIONS, SCHEMA_MIGRATIONS_SQL, type Migration } from "./schema";

export const IN_MEMORY = ":memory:";

const VersionRowSchema = z.object({ version: z.number().int() });

/**
 * Runs `fn` inside BEGIN/COMMIT, rolling back if it throws.
 * `fn` must be synchronous: node:sqlite is synchronous and an awaited callback
 * would commit before the work finished.
 */
export const withTransaction = <T>(db: DatabaseSync, fn: () => T): T => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
};

const appliedVersions = (db: DatabaseSync): Set<number> =>
  new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => VersionRowSchema.parse(row).version),
  );

/** Applies every pending migration, each in its own transaction. Idempotent. */
export const runMigrations = (db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): void => {
  db.exec(SCHEMA_MIGRATIONS_SQL);
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of ordered) {
    withTransaction(db, () => {
      // Re-check inside the (write-locked) transaction in case another process migrated first.
      if (appliedVersions(db).has(migration.version)) return;
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
    });
  }
};

/** Opens (creating if needed) a SQLite database, configures it and applies migrations. */
export const openDatabase = (path: string): DatabaseSync => {
  const inMemory = path === IN_MEMORY;
  if (!inMemory) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    if (!inMemory) db.exec("PRAGMA journal_mode = WAL");
    runMigrations(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
};
