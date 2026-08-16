# Development Handbook

This handbook is the shortest path from a clean checkout to a safe, reviewable
DataBreeze change. It applies to the Web control plane, Windows Desktop agent,
Android companion, API, and Python engine.

## Clean checkout

1. Install Node.js `24.17.0`, Corepack, Python `3.13`, JDK `21`, Docker, and
   OpenTofu when infrastructure validation is needed. The repository pins the
   package manager and checks runtime versions.
2. Run `corepack pnpm repo:bootstrap`.
3. Run `corepack pnpm repo:check` and `corepack pnpm repo:build`. The check
   includes non-applying local/AWS infrastructure validation. A clean
   checkout is the baseline; do not hide a failure with an untracked local
   configuration file.
4. Copy `infrastructure/local/.env.example` to a local-only `.env` if needed,
   then use `corepack pnpm local:smoke` to check disposable dependencies.
5. For the engine, run `uv sync --locked --offline` in `services/engine` and
   use its locked `uv run` commands. For Android, use `apps/android/gradlew`.

The local stack uses synthetic data only. PostgreSQL, Redis, MinIO, Mailpit,
and OpenTelemetry volumes are disposable and must never be treated as a backup.

## Fast Web development (Vite HMR)

Use the normal split workflow when iterating on the frontend. Docker owns the
disposable infrastructure; the watched API and Vite Web server stay on the
host so source edits are reflected immediately:

```text
Terminal A: corepack pnpm dev:infra
Terminal B: corepack pnpm dev:api
Terminal C: corepack pnpm dev:web
Browser:    http://127.0.0.1:5173/vi-VN/workspace
Mailpit:    http://127.0.0.1:8025
```

Vite proxies `/v1`, `/v3`, and `/health` to
`http://127.0.0.1:3000`. The watched API uses Docker PostgreSQL through
`DATABASE_URL`, with Prisma migrations applied on start; Redis, MinIO, and
Mailpit remain available for adapters and local verification. The
pilot/production `https://localhost:8443` URL serves a built bundle and is
intentionally not a hot-reload development URL.

## Change workflow

- Read `docs/README.md`, the applicable specification, child plan, and ADR
  before changing a boundary.
- Create a short-lived `feat/<name>` or `fix/<name>` branch from `dev` (or a
  task integration branch explicitly recorded in the plan).
- Change canonical contracts first, add a failing test, implement the smallest
  vertical slice, then add telemetry, failure behavior, rollback notes, and
  traceability evidence.
- Commit one independently reversible outcome at a time. Commit messages use
  `feat:`, `fix:`, `docs:`, `test:`, `ci:`, or `chore:` and describe the outcome.
- Merge task branches with `--no-ff`. Keep `dev` as the integration branch and
  promote `main` only through a separately reviewed release pull request.
- Open a pull request at a coherent boundary. Invoke CodeRabbit once when the
  pull request is otherwise ready, wait for its comments, reproduce each claim,
  and either fix it in a focused commit or record why it is not valid. Never
  re-run CodeRabbit on the same pull request.

## Boundaries

Clients use generated contracts and public packages. They never import API
implementation code or connect to PostgreSQL. Feature modules use foundation
application ports and do not read another feature's tables. Local mode must not
send source paths, bytes, previews, OCR, or reconstructable chunks to the cloud.

## Before handoff

Record the requirement IDs, migrations, public interfaces, tests, telemetry,
rollback, and known environment limitations in the task report. Run the
scoped checks, then the root checks and build when the worktree is clean. Do not
commit `.env`, credentials, customer files, runtime databases, installers,
APKs, or generated reports.
