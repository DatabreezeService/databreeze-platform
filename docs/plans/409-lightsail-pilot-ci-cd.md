# Lightsail Pilot CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a low-cost, single-server AWS Lightsail pilot that runs the DataBreeze Web/API stack with persistent local services and deploys immutable releases through protected GitHub Actions CI/CD.

**Architecture:** A 4 GB Lightsail Linux instance runs Docker Compose with Caddy, Web, API, PostgreSQL, Redis, and MinIO on one private Docker network. Caddy is the only public service; GitHub Actions builds immutable API migration/API/Web images, publishes them to a container registry, connects to the host through a protected SSH deployment environment, runs the migration before restart, verifies HTTPS/readiness, and rolls back the previous image set on failure. The existing ECS/RDS/ElastiCache OpenTofu architecture remains unchanged for a later high-availability deployment.

**Tech Stack:** Docker Compose v2, Caddy, PostgreSQL 17, Redis 7, MinIO, Node/pnpm API/Web images, GitHub Actions, GHCR or another OCI registry, Bash/PowerShell-compatible deployment documentation.

## Global Constraints

- Keep the single-server pilot explicitly non-HA; do not weaken production tenant isolation, authentication, retention, audit, or fail-closed rules.
- Do not place database passwords, signing keys, session keys, or OpenAI credentials in Git, image layers, GitHub logs, workflow inputs, or command arguments.
- Pin image references by immutable commit tag or digest in the host release file; never deploy `latest`.
- Bind only Caddy ports publicly; PostgreSQL, Redis, MinIO, and Mailpit remain private or loopback-only.
- Keep OpenAI flags disabled by default; any provider key is an owner-managed server secret and must be rotated before use.
- Keep Vietnamese as the default Web locale and preserve the existing demo-mode labeling.
- Run migrations as a one-shot job before the API becomes healthy; never start a new API against an un-migrated database.
- Link verification to local pilot, container, CI/CD, authentication, intake, and health requirements in tests and runbook evidence.
- Do not broaden `DATABREEZE_RUNTIME_PROFILE=local`; a separate explicitly named `pilot` profile must validate the owner-provided public HTTPS origin and continue to reject arbitrary origins.

---

### Task 0: Explicit pilot runtime profile

**Files:**
- Modify: `services/api/src/platform/local-database.composition.ts`
- Modify: `services/api/src/platform/production-database.composition.ts`
- Modify: `services/api/src/main.ts`
- Test: `services/api/test/platform/local-database-composition.test.ts`

**Interfaces:**
- Consumes: `DATABREEZE_RUNTIME_PROFILE=pilot`, `DATABREEZE_PILOT_HTTPS_ORIGIN`, the existing durable PostgreSQL/Redis/MinIO/Mailpit settings, and the existing managed 32-byte keys.
- Produces: a production-mode, non-in-memory pilot composition that uses the same durable adapters as local, allows only one exact owner-configured HTTPS origin, and keeps the worker/advanced cloud paths fail-closed.

- [x] **Step 1: Add failing tests** proving the current local profile rejects a public origin, the new `pilot` profile accepts a single exact HTTPS origin with no path/query/wildcard, and invalid origins still fail closed.
- [x] **Step 2: Run the focused API tests** with the API test project and confirm the new profile tests fail before implementation.
- [x] **Step 3: Extract the shared durable composition path** so local and pilot both use one Prisma client, Redis admission counters, Mailpit delivery, MinIO intake storage, and the same key validation; only the runtime-profile/origin policy differs.
- [x] **Step 4: Implement `pilot` selection** in `createDatabaseCompositionForRuntime` and make the public-origin validation require `DATABREEZE_PILOT_HTTPS_ORIGIN` exactly, rejecting HTTP, loopback omission, paths, query strings, fragments, credentials, and comma-separated values.
- [x] **Step 5: Run API typecheck, focused composition tests, and the existing local journey**; verify login, refresh, logout, bootstrap, and intake use the pilot origin without changing local behavior.

---

### Task 1: Pilot Compose and public HTTPS gateway

**Files:**
- Create: `infrastructure/lightsail/compose.pilot.yml`
- Create: `infrastructure/lightsail/Caddyfile`
- Create: `infrastructure/lightsail/.env.example`
- Create: `infrastructure/lightsail/README.md`
- Test: `tools/repo-cli/test/lightsail-deployment.test.mjs`

**Interfaces:**
- Consumes: immutable `API_IMAGE`, `API_MIGRATION_IMAGE`, and `WEB_IMAGE` environment values plus server-only `.env` runtime values.
- Produces: a Compose project whose only public listener is Caddy on ports 80/443, with `api-migrate` completing before `api` starts and `web` proxying `/v1/*`, `/v3/*`, and `/health/*` to `api:3000`.

- [x] **Step 1: Write failing static tests** for service names, private database/cache/object ports, required image variables, migration dependency, public Caddy ports, and absence of `latest`.
- [x] **Step 2: Run the focused test** with `node --test tools/repo-cli/test/lightsail-deployment.test.mjs` and confirm it fails because the pilot files do not exist.
- [x] **Step 3: Add the Compose file** with pinned foundation images, named volumes, internal health checks, `api-migrate` using the API migration image, API runtime secrets loaded from `.env`, and Caddy as the only published service.
- [x] **Step 4: Add the Caddyfile** using `{$DATABREEZE_PILOT_DOMAIN}` for ACME HTTPS, preserving API reverse-proxy paths and SPA fallback without using the local `tls internal` certificate.
- [x] **Step 5: Add `.env.example`** containing only non-secret names, safe placeholders, the image variables, domain, email, and explicit `VITE_DATABREEZE_DEMO_MODE`; document that real values must be created only on the server.
- [x] **Step 6: Add the README** with Lightsail firewall rules, DNS, SSH tunnel access to private diagnostics, volume backup/restore, start/stop commands, and the single-server availability warning.
- [x] **Step 7: Run the focused static test** and Compose config validation; expect all checks to pass without requiring AWS credentials.

### Task 2: Server bootstrap, migration, health, and rollback commands

**Files:**
- Create: `infrastructure/lightsail/bootstrap.sh`
- Create: `infrastructure/lightsail/deploy.sh`
- Create: `infrastructure/lightsail/rollback.sh`
- Create: `infrastructure/lightsail/healthcheck.sh`
- Test: `tools/repo-cli/test/lightsail-deployment.test.mjs`

**Interfaces:**
- Consumes: `infrastructure/lightsail/compose.pilot.yml`, `/opt/databreeze/.env`, and a release file containing exact image references.
- Produces: idempotent commands `bootstrap.sh`, `deploy.sh RELEASE_FILE`, `rollback.sh RELEASE_FILE`, and `healthcheck.sh` that never print secret values.

- [x] **Step 1: Add failing shell-contract assertions** for strict mode, path confinement under `/opt/databreeze`, migration-before-start, bounded health polling, previous-release retention, and rollback on failed readiness.
- [x] **Step 2: Implement `bootstrap.sh`** to install Docker/Compose, create `/opt/databreeze/{releases,current,backups}`, install the Compose files, create a restricted deploy user, and leave secret values for the owner to add.
- [x] **Step 3: Implement `healthcheck.sh`** to check `https://$DATABREEZE_PILOT_DOMAIN/health/ready`, verify JSON content type, and return non-zero on timeout without exposing headers containing cookies.
- [x] **Step 4: Implement `deploy.sh`** to validate image references, save the previous release, pull the exact images, run `api-migrate` once, start the Compose stack, wait for health, and automatically restore the previous release if health fails.
- [x] **Step 5: Implement `rollback.sh`** to select only an existing release file, restart with that exact set, run health verification, and refuse unknown paths or mutable tags.
- [x] **Step 6: Run shell syntax checks and the focused static tests**; expect pass for clean deploy, migration failure, health timeout, and rollback behavior using mocked commands.

### Task 3: Build and publish immutable pilot images

**Files:**
- Modify: `.github/workflows/api-container.yml`
- Create: `.github/workflows/lightsail-pilot.yml`
- Modify: `.github/workflows/README.md` if workflow documentation is present there
- Test: `tools/repo-cli/test/lightsail-deployment.test.mjs`

**Interfaces:**
- Consumes: existing quality/security/container checks, registry credentials supplied by GitHub, and a protected `pilot` environment.
- Produces: API runtime, API migration, and Web OCI images tagged by `${GITHUB_SHA}` plus a release manifest containing immutable references.

- [x] **Step 1: Add failing workflow assertions** for pull-request CI, main-branch publish, pinned action references, no secret values in logs, protected environment deployment, immutable tags, and no production OpenTofu apply.
- [x] **Step 2: Extend the container workflow** to keep existing no-push PR validation and publish only after required checks on `main`; build the API runtime, API migration target, and Web runtime images separately.
- [x] **Step 3: Add `lightsail-pilot.yml`** with `pull_request` checks, `push` to `main` publish, and a protected `pilot` deployment job using SSH secrets. The deploy job must upload only the release manifest/scripts, run `deploy.sh`, and never upload `.env` or private keys.
- [x] **Step 4: Add bounded cleanup and concurrency** so only one pilot deployment runs at a time and interrupted runs do not leave a half-selected release.
- [x] **Step 5: Run workflow YAML parsing and static policy tests**; expect the existing CI workflows plus the new workflow to pass.

### Task 4: Pilot operator documentation and cost guardrails

**Files:**
- Create: `docs/operations/lightsail-pilot-runbook.md`
- Modify: `docs/plans/MANUAL-PREREQUISITES.md` with pilot-specific owner rows if required
- Modify: `infrastructure/lightsail/README.md`
- Test: `tools/repo-cli/test/lightsail-deployment.test.mjs`

**Interfaces:**
- Consumes: the actual Compose, bootstrap, deployment, rollback, and workflow commands from Tasks 1–3.
- Produces: a complete owner runbook for creating the Lightsail instance, DNS/ACME setup, server secrets, GitHub environment secrets, first deploy, rollback, backup, stop, and delete procedures.

- [x] **Step 1: Document the exact Lightsail setup**: Singapore region if available, 4 GB Linux plan, static IP, firewall ports 80/443 and SSH restricted to the owner’s IP, and no public database/cache ports.
- [x] **Step 2: Document secret creation** on the host, including generated 32-byte base64url keys, local-only demo mode, Mailpit versus SES choice, and OpenAI disabled-by-default handling.
- [x] **Step 3: Document cost controls**: AWS Budget alerts, stopping the instance when unused, snapshot retention, log limits, OpenAI spending limits, and deletion after the two-month pilot.
- [x] **Step 4: Document acceptance tests**: register/OTP, login, refresh, logout, CSV/XLSX intake, inbox/review, dashboard route, health, restart persistence, and rollback.
- [x] **Step 5: Run the documentation/static policy suite** and verify no secret-looking values or mutable image tags are committed.

### Task 5: End-to-end release verification

**Files:**
- Modify: `tools/repo-cli/test/lightsail-deployment.test.mjs`
- Create: `tools/repo-cli/test/lightsail-release-smoke.test.mjs`
- Modify: `docs/operations/lightsail-pilot-runbook.md`

**Interfaces:**
- Consumes: a running pilot host, protected test account, Mailpit/SES choice, and the exact release manifest.
- Produces: reproducible smoke evidence for deploy, health, authentication, intake, restart, and rollback.

- [ ] **Step 1: Add the release smoke harness** with base URL, test credentials supplied through environment variables, and no hard-coded customer data.
- [ ] **Step 2: Exercise the release path**: `health/ready` → register/verify or demo login → bootstrap → logout → login → CSV/XLSX upload → inbox/review confirmation.
- [ ] **Step 3: Exercise restart persistence** and verify the named PostgreSQL volume remains authoritative.
- [ ] **Step 4: Exercise rollback** by deploying two manifests and selecting the prior one after a forced health failure.
- [ ] **Step 5: Run the focused smoke suite and record evidence** without claiming live dashboard metrics, worker execution, or OpenAI quality unless those independent gates pass.

## Self-review and known scope boundary

This plan deliberately does not convert the single-server pilot into high-availability AWS. It does not modify the existing ECS/RDS/ElastiCache OpenTofu modules, add a production worker bypass, enable OpenAI, or claim that the currently fail-closed worker/result pipeline is complete. Those remain separate production gates.
