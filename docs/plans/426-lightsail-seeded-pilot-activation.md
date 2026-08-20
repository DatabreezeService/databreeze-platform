# Lightsail Seeded Pilot Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Approved by the product owner in the active implementation conversation on 2026-08-20

**Goal:** Release the current product branch to `databreeze.tech` as a production-like, synthetically seeded Lightsail pilot with Gmail, OpenAI, and PayOS configured only through protected host secrets.

**Architecture:** The existing immutable GitHub Actions release remains the only image build and deployment path. The pilot Compose profile receives provider settings from `/opt/databreeze/.env`, takes content-addressed PostgreSQL and MinIO backups before migration, and runs an explicit idempotent synthetic seed after migration only when the host opt-in is enabled. Platform authority is assigned to the operator email supplied on the host; source control contains no operator credential or provider secret.

**Tech Stack:** GitHub Actions, Docker Compose v2, Caddy, PostgreSQL 17, MinIO, Node 24, Prisma 7, Argon2id, NestJS/Fastify, PayOS, Gmail SMTP, OpenAI Responses API.

**Spec:** `docs/plans/409-lightsail-pilot-ci-cd.md`, `docs/plans/410-platform-owner-console.md`, `docs/plans/403-openai-development-validation.md`, `docs/operations/backup-and-restoration.md`, and `docs/operations/deployment-and-rollback.md`

## Global Constraints

- Preserve all existing production rows; the seed uses bounded upserts and never calls a delete API.
- Never place Gmail, OpenAI, PayOS, operator passwords, database credentials, or object-store credentials in Git, image layers, workflow inputs, logs, or release manifests.
- Keep PostgreSQL, Redis, MinIO, and Mailpit private; Caddy remains the only public listener.
- Build and deploy immutable image digests; never deploy `latest`.
- Run a verified PostgreSQL and MinIO backup before the first migration for every existing release.
- Run migrations before the opt-in seed and run the seed before API/Web activation.
- `DATABREEZE_PILOT_SEED_ENABLED=false` remains the default. Enabling it requires a protected operator email and password on the host.
- The platform operator is created or assigned only from the protected host configuration. Repository defaults never grant production platform authority.
- Synthetic users, subscriptions, invoices, payments, and feedback remain content-minimized and carry no customer source data, paths, OCR text, credentials, provider payloads, or webhook bodies.
- OpenAI and PayOS remain fail-closed when their protected settings are absent or invalid.
- Requirements: IAM-002, IAM-003, IAM-012, IAM-017, IAM-026; BUA-005, BUA-011, BUA-024; AUD-001, AUD-002, AUD-014; DDA-003, DDA-010, DDA-015, DDA-018, DDA-019, DDA-024, DDA-036, DDA-043, DDA-044, DDA-045; WEB-002, WEB-003, WEB-013, WEB-014, WEB-015, WEB-021, WEB-025.

---

### Task 1: Lock the seeded production release contract

**Files:**
- Modify: `tools/repo-cli/test/lightsail-deployment.test.mjs`
- Modify: `services/api/test/seed-local.test.mjs`

**Interfaces:**
- Consumes: the current Lightsail Compose, workflow, deploy script, and platform analytics builders.
- Produces: failing tests for production provider forwarding, real Web mode, backup-before-migration, seed-after-migration, explicit operator configuration, idempotent replay, and no destructive fixture behavior.

- [ ] **Step 1: Add a failing deployment behavior test** that runs the shell-contract harness and proves deployment invokes `backup.sh` before `api-migrate`, invokes `api-seed` only after migration when enabled, and never prints protected values.
- [ ] **Step 2: Add failing Compose/workflow assertions** for `VITE_DATABREEZE_DEMO_MODE=false`, required OpenAI/PayOS/public-URL mappings, an `api-seed` one-shot service, disabled seed defaults, and no committed secret value.
- [ ] **Step 3: Add failing seed tests** using a fake Prisma boundary. The tests must prove disabled execution rejects, missing operator configuration rejects, a new explicit operator receives one Argon2id credential and one active `PLATFORM_OWNER` assignment, an existing credential is not rotated, replay preserves row counts, and no delete delegate is called.
- [ ] **Step 4: Run `node --test tools/repo-cli/test/lightsail-deployment.test.mjs services/api/test/seed-local.test.mjs`** and confirm failures name the missing provider, backup, and pilot-seed behavior.

### Task 2: Implement the opt-in pilot seed

**Files:**
- Create: `services/api/scripts/seed-pilot.mjs`
- Modify: `services/api/scripts/seed-local.mjs`
- Modify: `services/api/package.json`
- Test: `services/api/test/seed-local.test.mjs`

**Interfaces:**
- Consumes: `DATABASE_URL`, `DATABREEZE_PILOT_SEED_ENABLED`, `DATABREEZE_PILOT_OPERATOR_EMAIL`, `DATABREEZE_PILOT_OPERATOR_DISPLAY_NAME`, and `DATABREEZE_PILOT_OPERATOR_PASSWORD` from the container environment.
- Produces: `runPilotSeed(options): Promise<{ seeded; actual; operator }>` and a CLI that exits non-zero on disabled, malformed, unavailable, or conflicting authority.

- [ ] **Step 1: Export the generated Prisma client loader** already used by the local seed without changing local behavior.
- [ ] **Step 2: Implement strict pilot configuration parsing**: enabled must equal `true`, email must be normalized and valid, display name must be 1-200 characters, and a newly created operator requires a password of at least 12 non-control characters.
- [ ] **Step 3: Apply the existing 63-user analytics and exact 12-feedback fixture** through `applyPlatformAdminRows`, then upsert four synthetic base identities plus the explicitly configured operator so an empty pilot reaches 68 users.
- [ ] **Step 4: Provision the operator transactionally**. Create an Argon2id credential only when the configured identity has no credential; never replace an existing credential. Upsert one active `PLATFORM_OWNER` assignment with revision monotonicity and no tenant membership grant.
- [ ] **Step 5: Read authoritative aggregate metrics after replay** and print counts only, never the operator email, password, hashes, or provider settings.
- [ ] **Step 6: Re-run the focused seed test and confirm the red cases are green.**

### Task 3: Add pre-migration pilot backups

**Files:**
- Create: `infrastructure/lightsail/backup.sh`
- Modify: `infrastructure/lightsail/deploy.sh`
- Modify: `.github/workflows/lightsail-pilot.yml`
- Modify: `infrastructure/lightsail/README.md`
- Test: `tools/repo-cli/test/lightsail-deployment.test.mjs`

**Interfaces:**
- Consumes: `/opt/databreeze/.env`, the active Compose stack, and a release ID.
- Produces: `/opt/databreeze/backups/<UTC timestamp>-<release>/postgres.dump`, mirrored MinIO bucket directories, `SHA256SUMS`, and `manifest.txt` with no secret values.

- [ ] **Step 1: Implement `backup.sh RELEASE_ID`** with strict path confinement, mode `0700`, PostgreSQL custom-format dump, bounded MinIO mirrors through the pinned `mc` image, non-empty artifact checks, SHA-256 checksums, and atomic directory publication.
- [ ] **Step 2: Invoke the backup once before image pull or migration** when `current-release.env` exists. A backup failure blocks deployment and leaves the current release running.
- [ ] **Step 3: Upload and install `backup.sh` through the workflow** with mode `0750`; never upload `.env` or backup contents.
- [ ] **Step 4: Document backup verification and restore rehearsal commands** and explicitly state that the pilot is still a single failure domain.
- [ ] **Step 5: Run shell syntax and focused deployment tests** and confirm ordering and path-confinement behavior pass.

### Task 4: Activate real provider wiring without committed secrets

**Files:**
- Modify: `infrastructure/lightsail/compose.pilot.yml`
- Modify: `infrastructure/lightsail/.env.example`
- Modify: `.github/workflows/lightsail-pilot.yml`
- Modify: `infrastructure/lightsail/README.md`
- Test: `tools/repo-cli/test/lightsail-deployment.test.mjs`

**Interfaces:**
- Consumes: server-only OpenAI, PayOS, Gmail, pilot URL, and seed variables.
- Produces: API runtime environment with explicit kill switches and a Web image compiled with real API behavior.

- [ ] **Step 1: Map OpenAI settings** for agent, analysis, mapping assistance, receipt extraction, dashboard proposals, bounded sample permission, model snapshots, timeouts, output-token caps, and `OPENAI_API_KEY` without defaults that enable egress.
- [ ] **Step 2: Map PayOS settings** for provider, client ID, API key, checksum key, `DATABREEZE_WEB_PUBLIC_URL`, and exact success/failure URLs without logging values.
- [ ] **Step 3: Build Web with `VITE_DATABREEZE_DEMO_MODE=false`** so dashboard, analysis, and billing clients use the same-origin API instead of synthetic browser data.
- [ ] **Step 4: Extend `.env.example` and the operator runbook** with names and safe disabled placeholders only.
- [ ] **Step 5: Run Compose config, workflow parsing, and focused deployment tests** and confirm no provider secret appears in generated source-controlled output.

### Task 5: Audit, commit, and deploy the current branch

**Files:**
- Preserve all intended existing branch changes.
- Exclude: ignored `.env` files, credentials, local databases, uploaded customer files, runtime logs, generated reports, and editor artifacts.

**Interfaces:**
- Consumes: the complete current working tree plus Tasks 1-4.
- Produces: reviewed commits on `feat/platform-admin-and-web-flow`, a successful protected Lightsail workflow, and a healthy seeded release at `https://databreeze.tech`.

- [ ] **Step 1: Run secret, artifact, and status audits** over every changed/untracked path; stop if any protected value or customer artifact is found.
- [ ] **Step 2: Run fresh release gates**: contract compatibility, Prisma validate/generate/migration status, API typecheck/tests, Web typecheck/tests/build, engine tests, lint/format, Compose config, and deployment tests.
- [ ] **Step 3: Reconcile the two `origin/main` commits** without discarding dirty work; resolve conflicts with requirement-linked tests.
- [ ] **Step 4: Re-run the release gates after reconciliation**, then stage only reviewed paths and create scoped commits with no secret values.
- [ ] **Step 5: Configure protected host provider and seed values**, create and verify an immediate backup, then push the branch and merge it to `main` through the existing repository path.
- [ ] **Step 6: Observe the protected workflow** through validation, immutable image publication, migration, seed, activation, and readiness. On failure, preserve diagnostics and confirm automatic rollback.
- [ ] **Step 7: Verify production**: HTTPS readiness, Gmail SMTP authentication, sign-in/platform authorization, 68-or-higher preserved authoritative users, 21 paid users, 21 active subscriptions, 3,129,000 VND fixture revenue, exact 12 feedbacks, real API mode, OpenAI provider admission, PayOS checkout/return URLs, data import, analysis, dashboards, restart persistence, and backup checksums.

## Self-review and scope boundary

- This activation does not claim the single Lightsail host is highly available or that every G5 production-readiness prerequisite is complete.
- Existing production data is never removed to force the overview to exactly 68 users. An empty pilot becomes 68; a non-empty pilot truthfully reports the preserved higher count.
- OpenAI calls remain bounded by server kill switches and BUA admission. The seed contains no customer data and does not grant cross-tenant source access.
- PayOS settlement remains authoritative only after signed provider webhook verification; the seed does not fabricate provider webhooks.
- Platform authority is independent from tenant roles and is configured only through the protected pilot environment.
