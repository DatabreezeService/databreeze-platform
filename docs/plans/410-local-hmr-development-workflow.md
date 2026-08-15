# Local HMR Development Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal local Web development hot-reloadable while Docker owns durable infrastructure and the API can run in a watched host process.

**Architecture:** `infrastructure/local/compose.yml` remains the infrastructure-only profile for PostgreSQL, Redis, MinIO, Mailpit, and OpenTelemetry. A new Vite development proxy maps `/v1`, `/v3`, and `/health` to the host API; `pnpm dev:stack` starts infrastructure and prints the two host-process commands, while `pnpm dev:web` runs Vite with React Refresh/HMR from `apps/web` so workspace dependency links resolve correctly. The production/pilot Caddy/Web images are unchanged and remain used only for preview/deployment validation.

**Tech Stack:** Docker Compose v2, Node 24, pnpm 11, NestJS/Fastify API, Vite 8, React Refresh, Vitest/Node static tests.

## Global Constraints

- Keep PostgreSQL, Redis, MinIO, Mailpit, and OpenTelemetry private to localhost and preserve named-volume lifecycle safety.
- Do not put credentials, bearer tokens, tenant data, or OpenAI keys in Vite configuration or browser persistence.
- Development may use loopback HTTP only; production/pilot HTTPS and fail-closed runtime profiles remain unchanged.
- Keep Vietnamese as the default locale and do not change public contracts for a dev-server convenience.
- Web proxy targets are explicit loopback paths only; no arbitrary browser-controlled proxy destination is accepted.
- The API host process uses the repository's current development composition. In this branch that composition is intentionally database-free; the Docker PostgreSQL/Redis/MinIO/Mailpit services are available for adapters and integration checks but are not presented as durable API persistence until those adapters are wired.

---

### Task 1: Vite development proxy and explicit API URL behavior

**Files:**
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/src/features/inbox/inbox-api.ts` only if the shared API URL helper is extracted
- Test: `apps/web/test/vite-dev-proxy.test.ts`

**Interfaces:**
- Consumes: `VITE_DATABREEZE_API_PROXY_TARGET` with default `http://127.0.0.1:3000`.
- Produces: Vite dev requests for `/v1/*`, `/v3/*`, and `/health/*` proxied to the API without changing production builds or generated contracts.

- [x] **Step 1: Write the failing test** asserting the Vite config exposes a dev-only proxy for the three API path prefixes, defaults to loopback API port 3000, and never uses a user-controlled full URL as a proxy destination.
- [x] **Step 2: Run the focused test** with `corepack pnpm --filter @databreeze/web exec vitest run test/vite-dev-proxy.test.ts`; confirm it fails because the proxy is absent.
- [x] **Step 3: Implement the proxy** with a validated loopback-only target parser and `changeOrigin: false`; keep `preview` headers unchanged.
- [x] **Step 4: Run the focused test and Web typecheck**; expect both to pass.

### Task 2: Host-process development commands

**Files:**
- Modify: `package.json`
- Create: `tools/repo-cli/src/dev-stack.mjs`
- Modify: `apps/web/package.json` only if a clearer `dev` alias is useful
- Test: `tools/repo-cli/test/dev-stack.test.mjs`
- Modify: `infrastructure/local/README.md`

**Interfaces:**
- Consumes: existing `pnpm local:services` lifecycle commands, `services/api` build/start scripts, and `apps/web` Vite `dev` script.
- Produces: `pnpm dev:infra`, `pnpm dev:api`, `pnpm dev:web`, and `pnpm dev:stack` guidance/validation with no hidden production Compose startup.

- [x] **Step 1: Write failing tests** for command definitions, bounded local API environment defaults, and a `dev:stack` message that clearly separates Docker infrastructure from host API/Web processes.
- [x] **Step 2: Run the focused Node tests** and confirm the new commands/test helper are missing.
- [x] **Step 3: Add the commands**: `dev:infra` delegates to `local:services start`; `dev:api` runs the API watch command against `127.0.0.1` services; `dev:web` runs Vite on `127.0.0.1:5173`; `dev:stack` validates infrastructure and prints copy-pasteable terminal commands without spawning orphan processes.
- [x] **Step 4: Run focused tests, `pnpm local:services config`, API typecheck, and Web typecheck**.
- [x] **Step 5: Start the Web watcher from `apps/web` and add a regression test for package-local dependency resolution.**

### Task 3: Developer documentation and HMR acceptance

**Files:**
- Modify: `docs/development/README.md`
- Modify: `apps/web/README.md`
- Test: `tools/repo-cli/test/dev-stack.test.mjs`

**Interfaces:**
- Consumes: the exact commands and proxy target from Tasks 1–2.
- Produces: a documented two-terminal workflow and a smoke acceptance that editing a Web source file triggers Vite HMR while API requests continue to reach Docker-backed infrastructure.

- [x] **Step 1: Document the workflow**: Terminal A `pnpm dev:infra`, Terminal B `pnpm dev:api`, Terminal C `pnpm dev:web`; browser URL `http://127.0.0.1:5173/vi-VN/workspace`; Mailpit `http://127.0.0.1:8025`.
- [x] **Step 2: Add static assertions** that the documentation names the HMR URL, API proxy, Docker-only infrastructure, and warns against using the pilot/production Caddy URL for source editing.
- [x] **Step 3: Run the documentation/static tests and Web development E2E configuration**.

### Task 4: Verification

**Files:**
- Test: `apps/web/test/vite-dev-proxy.test.ts`
- Test: `tools/repo-cli/test/dev-stack.test.mjs`

- [x] **Step 1: Run the focused tests and both package typechecks.**
- [x] **Step 2: Start Docker infrastructure and verify every health check.**
- [x] **Step 3: Start the host API and Vite Web processes; verify `http://127.0.0.1:5173` renders and an API request reaches `http://127.0.0.1:3000`.**
- [x] **Step 4: Edit a harmless Web source string, observe the Vite HMR update without a full rebuild, and record any remaining browser/runtime limitation.**

## Self-review and known boundary

This plan does not change production/pilot Docker images, Caddy TLS, database schemas, API contracts, or feature behavior. It intentionally separates fast frontend iteration from release-like container validation; release smoke remains available through the existing preview/pilot workflows.
