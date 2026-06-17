# Paperclip Workflow Guide

This document describes the day-to-day workflow of developing and operating the Paperclip project.

## Quick Start

```bash
pnpm install
pnpm dev
```

This starts the API server at `http://localhost:3100` and the UI (served by the API in dev mode).

## Project Structure

```
Levi/
├── server/          # Express REST API and orchestration services
├── ui/              # React + Vite board UI
├── packages/
│   ├── db/          # Drizzle schema, migrations, DB clients
│   ├── shared/      # Shared types, constants, validators
│   ├── adapters/    # Agent adapter implementations
│   └── adapter-utils/  # Shared adapter utilities
├── cli/             # Paperclip CLI
├── doc/             # Documentation (GOAL.md, PRODUCT.md, SPEC-implementation.md, etc.)
├── docs/            # Public documentation site
├── scripts/         # Build, release, and utility scripts
└── tests/           # E2E and release smoke tests
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Full dev mode (API + UI, watch mode) |
| `pnpm dev:once` | Full dev without file watching |
| `pnpm dev:server` | Server only |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm test` | Run Vitest suite |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm test:e2e` | Playwright browser tests |
| `pnpm db:generate` | Generate DB migration |
| `pnpm db:migrate` | Apply migrations |

## Database

- **Default**: Embedded PostgreSQL (zero config, data at `~/.paperclip/instances/default/db/`)
- **Docker**: `docker compose up -d` then set `DATABASE_URL` in `.env`
- **Hosted**: Supabase or any Postgres-compatible provider

Reset local dev DB:
```bash
rm -rf ~/.paperclip/instances/default/db
pnpm dev
```

## Key Concepts

- **Company**: First-order object. All business entities are company-scoped.
- **Agents**: AI employees with roles, titles, reporting lines, and adapter configs.
- **Goals**: Hierarchical (company → team → agent → task).
- **Issues**: Tasks with single assignee, atomic checkout, comments, and attachments.
- **Heartbeats**: Scheduled agent wakeups that check for work and act.
- **Budgets**: Monthly token/cost limits per agent and company.
- **Governance**: Board approvals for hires, strategy, and governed actions.

## Adapter Types

Built-in adapters include `process`, `http`, `claude_local`, `codex_local`, `gemini_local`, `opencode_local`, `pi_local`, `cursor`, and `openclaw_gateway`. External adapters can be loaded via the adapter plugin flow.

## Testing

- Default: `pnpm test` (Vitest only)
- Browser suites: `pnpm test:e2e`, `pnpm test:release-smoke` (run only when working on those flows)
- For normal issue work, run the smallest relevant verification first.

## Useful Links

- Health: `curl http://localhost:3100/api/health`
- Companies: `curl http://localhost:3100/api/companies`
- Full dev guide: `doc/DEVELOPING.md`
- V1 spec: `doc/SPEC-implementation.md`
