# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Multi-Document Intelligence Workbench** — upload multiple documents, run analysis over each one, and compare/synthesize results across them.

## Stack

- **Language:** TypeScript everywhere (`strict: true`)
- **Monorepo:** npm workspaces
- **Backend:** Express + SQLite
- **Frontend:** React
- **Validation:** Zod (schemas shared between server and web)

## Layout

```
apps/
  server/     Express API + SQLite persistence
  web/        React frontend
packages/
  shared/     Zod schemas and the TypeScript types inferred from them
```

- Every request/response shape is defined **once** as a Zod schema in `packages/shared` and imported by both `apps/server` and `apps/web`.
- Derive types with `z.infer<typeof Schema>` — do not hand-write a parallel `interface` for something that already has a schema.

## Hard rules

### 1. No `any`
- Never write `any` — not in annotations, generics, casts (`as any`), or `// @ts-ignore` workarounds.
- For truly unknown data use `unknown` and narrow it (preferably with a Zod `.parse` / `.safeParse`).
- `@typescript-eslint/no-explicit-any` is set to `error`; `noImplicitAny` is on via `strict`.
- Avoid `as` casts to paper over types; if a cast seems necessary, validate instead.

### 2. Validate all inputs
Anything crossing a trust boundary is `unknown` until a Zod schema says otherwise:
- **Server:** `req.body`, `req.params`, `req.query`, headers you rely on, uploaded file metadata, and env vars (parse `process.env` with a schema at startup).
- **Server:** rows read from SQLite that are mapped into domain objects, and every response from an external/LLM API (including structured/JSON output).
- **Web:** every API response is parsed with the shared schema before use; form inputs are validated with the same schemas.
- Use a single validation middleware (e.g. `validate({ body, params, query })`) rather than ad‑hoc checks in handlers. Invalid input returns `400` with the Zod issues; never let it reach business logic.
- Use parameterized SQLite statements only — never build SQL by string concatenation.

### 3. Never merge documents into one prompt
- Each document is processed in **its own, separate** LLM call. Do not concatenate multiple documents (or their chunks) into a single prompt.
- Cross-document work (comparison, synthesis, Q&A across documents) operates on the **per-document structured results** (validated by Zod), not on combined raw text.
- A chunk belongs to exactly one document; never mix chunks from different documents in one request.
- Keep document IDs attached to every result so every claim is traceable to its source document.
- If a feature seems to require putting multiple documents in one prompt, stop and raise it instead of implementing it.

## Conventions

- ES modules, `async/await`, no callbacks.
- Errors: throw typed errors; a central Express error handler maps them to HTTP responses. Don't leak stack traces to clients.
- Keep route handlers thin: validate → call service → return validated response.
- Tests live next to code as `*.test.ts`.

## Commands

```bash
npm install          # install all workspaces
npm run dev          # run server + web in dev mode
npm run build        # build all workspaces
npm run typecheck    # tsc --noEmit across workspaces
npm run lint         # eslint (no-explicit-any = error)
npm test             # run tests
```

Run `npm run typecheck && npm run lint` before considering a change done.
