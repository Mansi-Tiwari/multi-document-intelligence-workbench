# Multi-Document Intelligence Workbench

Upload several documents (PDF, text, CSV), give one instruction, and get structured results: an analysis of each document plus a cross-document comparison with discrepancies, missing info, a key document and key facts.

TypeScript monorepo (npm workspaces):

| Workspace | Path | What |
|---|---|---|
| `@mdiw/shared` | `packages/shared` | Zod schemas and inferred types shared by server and web |
| `@mdiw/server` | `apps/server` | Express 5 API, SQLite (`node:sqlite`) |
| `@mdiw/web` | `apps/web` | React + Vite client |

See [CLAUDE.md](CLAUDE.md) for architecture and project rules.

## Getting started

Requires Node ≥ 22.13.

```bash
npm install
cp .env.example .env   # every value is validated with Zod at startup
npm run dev            # API on :3001, web on :5173 (proxies /api)
```

Open http://localhost:5173. The header shows whether the API is reachable (`GET /api/health`).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Runs server (tsx watch) and web (Vite) together |
| `npm run build` | Builds all workspaces |
| `npm start` | Runs the built server |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run lint` | ESLint (no `any`, no unsafe access, layer boundaries) |
| `npm test` | Vitest in every workspace |
