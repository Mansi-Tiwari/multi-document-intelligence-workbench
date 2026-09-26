# Multi-Document Intelligence Workbench

Upload several documents, give one instruction, and get **structured** results: an analysis of each document, plus a cross-document comparison with discrepancies, missing information, a key document and key facts. Every finding names its source file, and each one is labelled **Fact** (backed by a verified quote) or **AI** (model judgement).

TypeScript monorepo: Express + SQLite API, React client, Zod schemas shared by both.

---

## Quick start

Requires **Node ≥ 22.13** (the server uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env
npm run dev          # API on http://localhost:3001, web on http://localhost:5173
```

No API key is needed: without `ANTHROPIC_API_KEY` the app uses a deterministic, offline **mock** LLM. Set the key to use Claude.

To try it, upload the files in [`apps/server/src/testing/samples/`](apps/server/src/testing/samples/), tick them, and click the example chip *"Compare name, email, date of birth, licence number and monthly income"*.

---

## Features

### Upload with validation
- **Accepted types:** PDF, plain text (`.txt`, `.md`) and CSV. Nothing else.
- **Real type from the bytes:** a PNG renamed to `.txt` or a text file named `.pdf` is rejected.
- **In memory only**, never written to disk. Up to **10 files** per upload, **10 MB** each; a single file over 50 MB aborts the request with 413.
- **Each file gets its own status and reason**, and one bad file never fails the batch:

  | Status | Meaning |
  |---|---|
  | `ok` | Text extracted and stored |
  | `empty` | Readable but no text, e.g. a scanned PDF (there is no OCR) or a blank file |
  | `unreadable` | Corrupt or encrypted PDF, invalid UTF-8, malformed CSV, or extraction timed out |
  | `unsupported` | Extension not allowed, or the bytes don't match it |
  | `too_large` | Over the size limit, or extracted text over 500k characters (text is never truncated) |

### Extraction
- PDF (via `unpdf`), text and CSV extractors sit behind one `TextExtractor` interface, with a **per-file timeout**.
- CSV rows are rendered as quotable lines (`Row 3: email=…; amount=…`).
- **Regex entities** with exact character positions: dates, money amounts, emails and licence numbers. Values are normalized, so `$1,200.00` equals `USD 1200`, and `12 April 1990` equals `1990-04-12`.

### Analysis
1. **Plan fields** from the instruction **alone**.
2. **Analyse each document on its own:** one LLM call per document, inside its own `<document id="…">` tag. Documents are never merged into one prompt.
3. **Verify every quote**, checking that it really exists in its own document's text.
4. **Compare** the validated per-document results in pure code: one comparison per field, discrepancies, missing info and a key document.
5. **Skip, don't fail.** Unknown documents, and documents whose AI reply is invalid twice, are listed in `skipped` with a reason. The rest are analysed and saved.

### Web app
- **Layout:** a responsive two-column layout (Documents | Analysis) that stacks on phones, with light and dark themes.
- **Upload panel:** drag-and-drop, and a file list showing each file's status and reason, with checkboxes to choose files for analysis.
- **Prompt box:** example instruction chips, validation, and Ctrl/⌘+Enter to run.
- **Results tabs:** Summary, Comparison, Discrepancies, Missing info and Key facts.
  - Every finding shows its source file(s) and quote, a Fact/AI badge, and a copy button.
  - Each tab has "Copy all"; the comparison table copies as Markdown.
- **Error banner:** every API error is shown with its message, field issues and request ID.

---

## Architecture

```
packages/shared   Zod schemas + inferred types used by server AND web (the API contract)
apps/server       routes → services → domain → ports → adapters
apps/web          React client (only talks to the API through src/api/client.ts)
```

| Layer | Folder | Does |
|---|---|---|
| routes / http | `apps/server/src/routes`, `http` | Parse input with Zod, call a service, send a schema-checked response; one error handler, uploads, request IDs |
| services | `services` | Use cases: `DocumentService` (upload), `AnalysisService` (analysis) |
| domain | `domain` | Pure logic: cross-document comparison, quote checks, regex entities, errors. No I/O |
| ports | `ports` | Interfaces: `DocumentRepository`, `AnalysisRepository`, `TextExtractor`, `LlmProvider` |
| adapters | `adapters` | `sqlite/`, `extractors/`, `llm/` (Claude and mock) |
| composition root | `index.ts` | The only place adapters are wired to services |

ESLint enforces these import boundaries.

### Project rules
- **No `any`**, no type-forcing casts and no `@ts-ignore`, enforced by ESLint and `tsc --strict`.
- **Validate all inputs and outputs with Zod:**
  - requests, uploaded files and env vars
  - database rows and every LLM reply
  - every API response, both on the server and in the web client
- **Never merge documents into one prompt.** Each document gets its own call; comparison runs on validated results.

[CLAUDE.md](CLAUDE.md) holds the full contributor rules.

---

## LLM providers

| `LLM_PROVIDER` | Behaviour |
|---|---|
| `auto` (default) | Claude if `ANTHROPIC_API_KEY` is set, otherwise the mock |
| `mock` | Deterministic and offline; used by tests |
| `anthropic` | Claude (`LLM_MODEL`, default `claude-opus-5`); a missing key stops startup |

- **One validation path:** every reply, from the mock or Claude, is parsed with **Zod**. The checks are:
  - exact field keys
  - value and quote consistency
  - quotes must exist verbatim in the document
- **One retry:** an invalid reply is **retried once**, with the problems fed back. A second failure skips that document.
- **Prompt injection:** document text is treated as untrusted data, and the model is told never to follow instructions inside it.

---

## API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ status: "ok" }` |
| POST | `/api/documents` | multipart field `files` → `{ results[], acceptedCount, rejectedCount }` (one status per file) |
| POST | `/api/analyses` | `{ instruction, documentIds }` → `{ analysis, skipped[] }` |
| GET | `/api/analyses` | `{ analyses: AnalysisSummary[] }` |
| GET | `/api/analyses/:id` | `Analysis` |

Errors always look like `{ error: { code, message, issues?, requestId? } }`.

| Code | Status |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `NOT_FOUND` | 404 |
| `FILE_TOO_LARGE` | 413 |
| `UNSUPPORTED_FILE` | 415 |
| `EXTRACTION_FAILED` | 422 |
| `NOTHING_TO_ANALYZE` | 422 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |
| `LLM_ERROR` | 502 |

---

## Data model (SQLite)

- `documents`: file metadata, SHA-256, detected MIME type, page count and full extracted text.
- `analyses`, `analysis_fields` and `analysis_documents` (the per-document summary and relevance).
- **`findings`**: document-scoped (`field_value`, `key_fact`) or cross-document (`comparison`, `discrepancy`, `missing_info`, `key_document`).
- **`finding_sources`**: for each finding, which document it came from, plus the value and supporting quote.

Every table has CHECK constraints and foreign keys, every row read is validated with Zod, and analyses are saved in one transaction. Migrations live in `apps/server/src/adapters/sqlite/schema.ts`.

---

## Security

- **helmet** headers, a **CORS** allow-list (`CORS_ORIGINS`) and **rate limiting** on `/api` (the health check is excluded).
- An **`X-Request-Id`** on every response, included in error bodies and logs.
- Stack traces and internal messages are never sent to clients.
- JSON bodies are capped at 100 kB; uploads have the limits above.
- Prompt injection is covered by a planted-injection sample and a test.

---

## Testing

```bash
npm test             # shared, server and web
```

- **Unit tests:** extractors, regex entities, comparison logic, LLM validation and retry, repositories, the error handler and the web client logic.
- **Sample documents** ([`apps/server/src/testing/samples`](apps/server/src/testing/samples/README.md)):
  - `application-form.txt`, `bank-statement.csv` and `licence.pdf`, with **planted mismatches** in name, email and licence number
  - a date-of-birth control that must *not* be flagged
  - a **prompt-injection** line in the CSV
  - `corrupt.pdf`
- **End-to-end tests** (`apps/server/src/e2e`) check that:
  - the planted mismatches are found and every quote exists in its source
  - upload rejections produce the right statuses
  - the **retry logic** works, and injected text stays inside its own document.

---

## Configuration

Copy `.env.example` to `.env`. Every value is validated with Zod at startup, and an invalid value stops the server with a readable message.

| Variable | Default | |
|---|---|---|
| `PORT` / `WEB_PORT` | 3001 / 5173 | API and web dev-server ports |
| `DATABASE_PATH` | `./data/workbench.sqlite` | Relative to `apps/server` |
| `LLM_PROVIDER` | `auto` | `auto`, `mock` or `anthropic` |
| `LLM_MODEL` | `claude-opus-5` | Used with `anthropic` |
| `ANTHROPIC_API_KEY` | (none) | Enables Claude |
| `ANALYSIS_CONCURRENCY` | 3 | Documents analysed in parallel (1–10) |
| `EXTRACTION_TIMEOUT_MS` | 15000 | Per-file extraction timeout |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 60000 / 120 | |

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | API (tsx watch) and web (Vite) together |
| `npm run build` | Builds all workspaces |
| `npm start` | Runs the built API |
| `npm run typecheck` | `tsc --noEmit` everywhere |
| `npm run lint` | ESLint: no `any`, no unsafe access, layer boundaries |
| `npm test` | Vitest in every workspace |

**CI** (`.github/workflows/ci.yml`) runs typecheck, lint, tests and build on every push to `main` and on pull requests.

---

## Not in scope

These are deliberately not built:
- authentication
- OCR (scanned PDFs are reported as `empty`)
- an async job queue (analysis runs within the request)
- streaming progress
