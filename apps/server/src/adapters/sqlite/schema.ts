export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/** Bootstrap table that records applied migrations; created before any migration runs. */
export const SCHEMA_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL
);
`;

/** Ordered, append-only. Never edit a migration that has shipped; add a new one. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "documents_analyses_findings",
    sql: `
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
  kind        TEXT NOT NULL CHECK (kind IN ('pdf', 'text', 'csv')),
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256      TEXT NOT NULL CHECK (length(sha256) = 64),
  page_count  INTEGER CHECK (page_count IS NULL OR page_count > 0),
  text        TEXT NOT NULL,
  char_count  INTEGER NOT NULL CHECK (char_count > 0),
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_documents_created_at ON documents (created_at DESC);
CREATE INDEX idx_documents_sha256 ON documents (sha256);

CREATE TABLE analyses (
  id           TEXT PRIMARY KEY,
  instruction  TEXT NOT NULL CHECK (length(instruction) BETWEEN 3 AND 2000),
  provider     TEXT NOT NULL CHECK (provider IN ('mock', 'anthropic')),
  model        TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_analyses_created_at ON analyses (created_at DESC);

CREATE TABLE analysis_fields (
  analysis_id  TEXT NOT NULL REFERENCES analyses (id) ON DELETE CASCADE,
  position     INTEGER NOT NULL CHECK (position >= 0),
  key          TEXT NOT NULL,
  description  TEXT NOT NULL,
  PRIMARY KEY (analysis_id, key),
  UNIQUE (analysis_id, position)
);

CREATE TABLE analysis_documents (
  analysis_id  TEXT NOT NULL REFERENCES analyses (id) ON DELETE CASCADE,
  document_id  TEXT NOT NULL,
  position     INTEGER NOT NULL CHECK (position >= 0),
  filename     TEXT NOT NULL,
  summary      TEXT NOT NULL,
  relevance    REAL NOT NULL CHECK (relevance BETWEEN 0 AND 1),
  PRIMARY KEY (analysis_id, document_id),
  UNIQUE (analysis_id, position)
);

CREATE TABLE findings (
  id           TEXT PRIMARY KEY,
  analysis_id  TEXT NOT NULL REFERENCES analyses (id) ON DELETE CASCADE,
  position     INTEGER NOT NULL CHECK (position >= 0),
  scope        TEXT NOT NULL CHECK (scope IN ('document', 'cross_document')),
  kind         TEXT NOT NULL CHECK (kind IN (
                 'field_value', 'key_fact',
                 'comparison', 'discrepancy', 'missing_info', 'key_document'
               )),
  field_key    TEXT,
  title        TEXT NOT NULL,
  detail       TEXT,
  UNIQUE (analysis_id, position),
  CHECK ((scope = 'document') = (kind IN ('field_value', 'key_fact'))),
  FOREIGN KEY (analysis_id, field_key) REFERENCES analysis_fields (analysis_id, key) ON DELETE CASCADE
);
CREATE INDEX idx_findings_analysis_kind ON findings (analysis_id, kind);

CREATE TABLE finding_sources (
  finding_id   TEXT NOT NULL REFERENCES findings (id) ON DELETE CASCADE,
  analysis_id  TEXT NOT NULL,
  document_id  TEXT NOT NULL,
  position     INTEGER NOT NULL CHECK (position >= 0),
  value        TEXT,
  quote        TEXT,
  PRIMARY KEY (finding_id, document_id),
  UNIQUE (finding_id, position),
  FOREIGN KEY (analysis_id, document_id)
    REFERENCES analysis_documents (analysis_id, document_id) ON DELETE CASCADE
);
CREATE INDEX idx_finding_sources_document ON finding_sources (document_id);
`,
  },
];
