# DDA Code-First Production Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use `superpowers:test-driven-development` for behavior changes and `superpowers:verification-before-completion` before every handoff.

**Status:** Approved resume plan<br>
**Baseline:** `codex/dda-400-production` at `3f580f8` or a descendant<br>
**Requirements:** `DDA-001` through `DDA-050` plus invoked P0/P1 IAM, IAE, DSM, JRA, DSO, BUA, AUD, WEB, DSK, and AND requirements<br>
**Depends on:** G1-G4 evidence already integrated from plans `081` through `087`

**Goal:** Finish every agent-implementable Data-to-Dashboard product and production-hardening task before asking the product owner for live AWS/OpenAI, signing, store, legal, or release actions.

**Architecture:** Continue from the integrated modular-monolith/API, Python engine, React Web, Electron Desktop, and native Kotlin Android implementation. Production paths use durable PostgreSQL metadata, foundation public contracts, authenticated client APIs, typed jobs, immutable evidence, and fail-closed provider adapters. Local tests, synthetic fixtures, mocked provider contracts, an Android emulator, and non-applying OpenTofu validation prove the code before external activation.

**Tech Stack:** NestJS/Fastify/Prisma/PostgreSQL, Python 3.13, React/Vite/Playwright, Electron/Vitest, Kotlin/Compose/CameraX/Room/WorkManager, JSON Schema generated contracts, OpenAI Responses adapter, OpenTofu/AWS, GitHub Actions, Node test runner, ESLint, Prettier.

## Global Constraints

- Preserve unrelated and untracked work, especially `.superpowers/sdd/400-production-readiness/*.md`; never stage it unless its owner explicitly hands it off.
- Vietnamese remains the default complete locale and English remains complete.
- No client receives an OpenAI key or database credential. No test fabricates a production credential or external approval.
- IAE owns originals/evidence/retention; DSM owns governed datasets/definitions; JRA owns jobs/reviews; DSO owns devices/grants/sync; BUA owns usage/admission; AUD owns canonical audit.
- Production code must not silently select in-memory repositories, fake OCR, demo fixtures, unauthenticated HTTP, or `unsafe-eval`.
- Source values, OCR text, filenames, local paths, prompts, and evidence content stay out of ordinary telemetry and repository fixtures unless explicitly synthetic.
- DDA-051 streaming stays deferred. `delivery.productionReady` remains `false` until external activation and G5 evidence pass.
- Tasks 1-11 require no live AWS account, OpenAI key, Windows signing certificate, Google Play account, legal approval, or production domain.

## Audited Starting State

- G1-G4 and work packages DDA-081 through DDA-087 are recorded complete; G5 is blocked.
- 206 of 211 planned create paths exist. Missing paths are the two OpenAI adapter tests, the offline OpenAI evaluation corpus, the production journey runbook, and consolidated release evidence.
- Fresh checks: TypeScript typecheck, requirements, orchestration, contracts, static infrastructure policy, domain tests (186), engine tests (139), and Web tests after building `@databreeze/ui` (38) pass.
- Fresh failures: formatting reports 83 files; lint reports 217 errors; two repository tests encode old prototype/plan assumptions; shared fixture tests encode 28 instead of 39 cases and six DDA schemas lack rejected fixtures; generated OpenAPI and its path expectation omit DDA routes; one Desktop test finds two identically named navigation landmarks.
- Product gaps: no live dashboard draft GET API; Desktop DSO resolution is hardcoded to `null`; Android upload uses a fail-closed client; refresh open-work/idempotency state is process-local; OpenAI has no focused adapter/contract tests or offline evaluation corpus.

---

### Task 1: Repair plan authority and freeze the truthful resume baseline

**Files:**

- Create: `docs/plans/401-dda-production-readiness.md`
- Modify: `docs/plans/400-production-readiness.md`
- Modify: `docs/plans/README.md`
- Modify: `docs/plans/CURSOR-HANDOFF.md`
- Modify: `docs/plans/MANUAL-PREREQUISITES.md`
- Modify: `docs/plans/data-to-dashboard-orchestration.json`
- Modify: `docs/evidence/dda/production-gate-matrix.md`
- Modify: `docs/evidence/dda/release-readiness.md`
- Modify: `tools/repo-cli/test/data-to-dashboard-orchestration.test.mjs`
- Test: `tools/repo-cli/test/plan-traceability.test.mjs`

**Interfaces:**

- Consumes: accepted DDA plan currently stored in `400-production-readiness.md` and legacy `WEB-001..023` traceability ownership.
- Produces: legacy plan `400`, DDA production plan `401`, and this code-first execution plan `402` without plan-number collision.

- [ ] **Step 1: Write the failing authority test**

  Assert that plan `400` contains `### Task 1: WEB production control center`, plan `401` contains `### Task 1: Freeze the production release manifest and evidence matrix`, G5 points to plan `401`, `delivery.productionReady` is false, and `DDA-051` is deferred.

- [ ] **Step 2: Run the focused tests and preserve the failure output**

  Run: `node --test tools/repo-cli/test/data-to-dashboard-orchestration.test.mjs tools/repo-cli/test/plan-traceability.test.mjs`

  Expected before the fix: failure on `ledger.prototype` and missing WEB task in plan `400`.

- [ ] **Step 3: Split the colliding plans without changing requirements**

  Move the current DDA production content to `401-dda-production-readiness.md`. Restore the accepted WEB production-control task to `400-production-readiness.md`. Replace every DDA reference to plan `400` with plan `401`, including G5 and manual-checklist prose.

- [ ] **Step 4: Correct the delivery assertion**

  Use the current schema rather than recreating the retired prototype field:

  ```js
  assert.equal(ledger.delivery.mode, 'task-gated-complete-program');
  assert.equal(ledger.delivery.productionReady, false);
  assert.equal(ledger.gates.find((gate) => gate.gateId === 'G5')?.status, 'blocked');
  ```

- [ ] **Step 5: Record the fresh baseline**

  Add exact commit, current pass/fail commands, 206/211 path count, partial requirement counts, and known external blockers to `release-readiness.md`. Do not promote any requirement.

- [ ] **Step 6: Verify and commit**

  Run the focused tests plus `corepack pnpm orchestration:check` and `corepack pnpm requirements:check`.

  Commit: `docs(dda): split production authority and freeze code-first baseline`

### Task 2: Restore formatting and lint as hard quality gates

**Files:**

- Modify: DDA-touched files reported by `corepack pnpm format:check`
- Modify: `apps/desktop/src/application/*.ts`
- Modify: `apps/desktop/src/main/**/*.ts`
- Modify: `apps/desktop/test/**/*.ts`
- Modify: `apps/web/src/features/dashboards/dashboard-api.ts`
- Modify: `packages/domain/src/data-to-dashboard/v1.ts`
- Modify: `services/api/src/features/dda/**/*.ts`
- Modify: `services/api/test/features/dda/**/*.ts`
- Modify: `services/api/src/platform/dda-foundation.composition.ts`

**Interfaces:**

- Consumes: existing promise-returning ports and frozen DDA contracts.
- Produces: zero Prettier drift and zero ESLint errors without disabling repository rules.

- [ ] **Step 1: Apply only mechanical formatting and review the diff**

  Run `corepack pnpm format`, then confirm no generated semantics, fixture values, or user-authored progress reports changed unexpectedly.

- [ ] **Step 2: Fix promise-returning implementations without fake `await` expressions**

  Replace `async` methods that do not await with explicit promises:

  ```ts
  public findVersion(id: string): Promise<DashboardVersionV1 | undefined> {
    return Promise.resolve(this.versions.get(id));
  }

  public requireDatasetVersion(): Promise<never> {
    return Promise.reject(new Error('DDA_FOUNDATION_UNAVAILABLE'));
  }
  ```

  Test doubles use `() => Promise.resolve(value)` or `mockResolvedValue(value)`. Do not add `await Promise.resolve()` and do not disable `require-await` globally.

- [ ] **Step 3: Fix real type-safety findings**

  Add type guards before converting analyst input to text:

  ```ts
  const question = typeof input['question'] === 'string' ? input['question'] : '';
  ```

  Remove unnecessary assertions, unused parameters/fixtures, unbound method references, and invalid awaits identified by ESLint.

- [ ] **Step 4: Verify and commit**

  Run `corepack pnpm format:check`, `corepack pnpm lint`, and `corepack pnpm typecheck`.

  Commit: `chore(dda): restore repository formatting and lint gates`

### Task 3: Reconcile generated contracts, rejected fixtures, and OpenAPI

**Files:**

- Create: `packages/test-fixtures/contracts/v1/payloads/dda-analysis-plan/invalid-unbounded-output.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-dashboard-snapshot/invalid-source-content.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-folder-manifest/invalid-local-path.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-materialization/invalid-cache-identity.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-receipt-candidate/invalid-evidence-coordinate.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-refresh-event/invalid-content-payload.json`
- Modify: `packages/test-fixtures/contracts/v1/manifest.json`
- Modify: `packages/test-fixtures/test/contracts-v1.test.mjs`
- Modify: `tools/fixture-validation/test/contract-parity.test.mjs`
- Modify: `services/api/openapi/v1.json`
- Modify: `services/api/test/openapi.test.ts`

**Interfaces:**

- Consumes: eight canonical DDA v1 schemas and existing generated TypeScript/Kotlin/Python models.
- Produces: accepted and rejected coverage per schema, dynamic parity totals, and checked-in OpenAPI containing every DDA route.

- [ ] **Step 1: Add one security-meaningful rejected payload for each uncovered DDA schema**

  Use only synthetic values. Each invalid payload must violate a closed boundary, such as an extra `localPath`, `sourceRows`, `ocrText`, or incomplete cache-identity field; never weaken schemas just to accept it.

- [ ] **Step 2: Make count assertions derive from the manifest**

  ```js
  const accepted = manifest.cases.filter((item) => item.expectedAcceptance).length;
  const rejected = manifest.cases.length - accepted;
  assert.deepEqual(summary, { caseCount: manifest.cases.length, expectedAccepted: accepted,
    expectedRejected: rejected, runtimes: ['typescript', 'python', 'kotlin'] });
  ```

  Retain the stronger per-schema `[false, true]` assertion; remove only obsolete global `28/14/14` constants.

- [ ] **Step 3: Regenerate and review OpenAPI**

  Run `corepack pnpm --filter @databreeze/api openapi:generate`. Add the DDA routes to the deterministic path test and assert bearer security, TenantScope/request-context ownership, RFC 7807 responses, and bounded DTOs for each protected operation.

- [ ] **Step 4: Verify and commit**

  Run contracts check, test-fixtures tests, fixture-validation tests, API OpenAPI check, and API tests.

  Commit: `test(dda): reconcile contracts fixtures and openapi`

### Task 4: Make DDA metadata, refresh work, and foundation composition durable

**Files:**

- Modify: `services/api/prisma/schema/dda.prisma`
- Create: `services/api/prisma/migrations/20260811010000_dda_durable_runtime/migration.sql`
- Modify: `services/api/src/features/dda/adapter/dda-database.client.ts`
- Create: `services/api/src/features/dda/adapter/prisma-etl-proposal-repository.adapter.ts`
- Create: `services/api/src/features/dda/dashboard/adapter/prisma-dashboard-draft-repository.adapter.ts`
- Create: `services/api/src/features/dda/refresh/adapter/prisma-dependency-repository.adapter.ts`
- Modify: `services/api/src/features/dda/adapter/prisma-refresh-repository.adapter.ts`
- Modify: `services/api/src/features/dda/refresh/adapter/durable-refresh-coordinator.adapter.ts`
- Modify: `services/api/src/features/dda/dda.module.ts`
- Modify: `services/api/src/platform/dda-foundation.composition.ts`
- Test: `services/api/test/features/dda/dda-production-composition.test.ts`
- Test: `services/api/test/features/dda/durable-refresh-restart.test.ts`

**Interfaces:**

- Consumes: existing DDA repository ports and public IAE/DSM/JRA/DSO/BUA/AUD repositories/services.
- Produces: database-backed ETL proposals, dashboard drafts, dependencies, refresh executions/idempotency/events, and fail-closed production composition.

- [ ] **Step 1: Write restart/idempotency tests that fail against process-local maps**

  Prove a second module instance can find an open refresh, current snapshot, source-event idempotency record, draft, and ETL proposal created by the first instance.

- [ ] **Step 2: Add tenant-scoped durable models and reversible migration**

  Persist metadata only: exact scope columns, IDs, hashes, states, revisions, timestamps, and bounded JSON definitions. Do not store original bytes, result rows, OCR text, filenames, or local paths in DDA tables.

- [ ] **Step 3: Replace process-local refresh lifecycle**

  `saveRefresh`, `findRefresh`, `findOpenRefresh`, and `findByIdempotency` must use PostgreSQL when `ddaDatabase` is supplied. Store content-safe refresh events durably or delegate them to AUD with a persisted DDA correlation record; do not use a no-op method.

- [ ] **Step 4: Ban production in-memory fallback**

  Allow in-memory adapters only through an explicit test/development factory. Production module creation with missing database/foundation bindings must fail startup with a stable content-safe diagnostic.

- [ ] **Step 5: Complete foundation adapters**

  Add the smallest public foundation lookup needed for evidence, semantic/metric versions, projections, and authorization rather than reading another feature's persistence. Missing or wrong-scope data continues to fail closed.

- [ ] **Step 6: Verify and commit**

  Run Prisma validate/generate, migration inventory/diff tests, focused DDA persistence tests, API tests, tenant tests, typecheck, and lint.

  Commit: `feat(dda): make production runtime metadata durable`

### Task 5: Complete the live Web dashboard read and authoring loop

**Files:**

- Modify: `services/api/src/features/dda/dashboard/api/dashboard-draft.controller.ts`
- Modify: `services/api/src/features/dda/dashboard/application/dashboard-draft.service.ts`
- Modify: `services/api/src/features/dda/dashboard/application/dashboard-repository.port.ts`
- Test: `services/api/test/features/dda/dashboard-draft.controller.test.ts`
- Test: `services/api/test/features/dda/dashboard-live-read.e2e.test.ts`
- Modify: `apps/web/src/features/dashboards/dashboard-api.ts`
- Modify: `apps/web/src/features/dashboards/dashboard-page.tsx`
- Test: `apps/web/test/dashboard-api.test.ts`
- Test: `apps/web/e2e/dda-golden-journey.spec.ts`

**Interfaces:**

- Produces: authenticated `GET /v1/dda/dashboards/:dashboardId/draft` returning a permission-filtered current draft/version or stable Problem.

- [ ] **Step 1: Write failing API and Web tests for live reads, revocation, and not-found**

- [ ] **Step 2: Add the server read use case**

  Resolve request TenantScope, reauthorize dashboard access, load only that scope's draft/version, apply row/field/evidence projection, and return no raw dataset values beyond the authorized dashboard result.

- [ ] **Step 3: Use the endpoint in production Web mode**

  Demo fixtures remain available only with `VITE_DATABREEZE_DEMO_MODE=true`. Missing API configuration, 401/403, stale data, or provider outage renders a bilingual fail-closed state while preserving the last authorized complete snapshot where allowed.

- [ ] **Step 4: Verify and commit**

  Build `@databreeze/ui` before Web unit tests, then run API focused tests, all Web tests, production preview Playwright, CSP tests, typecheck, and bundle budget.

  Commit: `feat(dda): complete live dashboard read loop`

### Task 6: Complete Desktop DSO enrollment, CSV/XLSX intake, and local engine execution

**Files:**

- Create: `apps/desktop/src/main/adapters/dso-capability-client.adapter.ts`
- Create: `apps/desktop/src/main/adapters/dda-sidecar-client.adapter.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/application/folder-manifest.service.ts`
- Modify: `apps/desktop/src/application/folder-intake.service.ts`
- Modify: `apps/desktop/src/application/folder-sync.service.ts`
- Modify: `apps/desktop/src/main/folder-watcher-lifecycle.ts`
- Test: `apps/desktop/test/dso-capability-client.test.ts`
- Test: `apps/desktop/test/dda-sidecar-client.test.ts`
- Test: `apps/desktop/test/dda-golden-folder-journey.test.ts`
- Modify: `apps/desktop/test/product-module-workbench.test.tsx`

**Interfaces:**

- Consumes: authenticated DSO list-capabilities/list-grants endpoints and signed typed Python-engine job protocol.
- Produces: real capability resolution, safe stable CSV/XLSX processing, local typed ETL, and reviewed Hybrid projection without cloud paths.

- [ ] **Step 1: Replace the hardcoded `resolveCapability: () => null` through an authenticated content-safe DSO adapter**

  Cache only opaque IDs, scope, grant state/revision/expiry, and allowed action types. Revocation, epoch mismatch, offline-expired authorization, or wrong scope stops new processing and watcher lifecycle.

- [ ] **Step 2: Execute typed folder jobs through the sidecar**

  Send signed typed jobs containing capability-bound opaque handles, not arbitrary commands. Canonical paths stay in the Desktop main process. Verify engine digest pins before accepting results.

- [ ] **Step 3: Support both declared V1 file profiles**

  CSV and XLSX use the governed local profiler/parser and explicit limits. Unsupported/macro/protected/drifting inputs quarantine with counted reason codes rather than permanent blanket XLSX rejection.

- [ ] **Step 4: Fix the Desktop landmark regression and verify recovery**

  Query the intended navigation by a unique accessible name; do not remove either valid navigation landmark. Test watcher replay, path escape, symlink, schema drift, offline restart, revocation, and approved projection.

- [ ] **Step 5: Verify and commit**

  Run Desktop build, unit/security tests, lint/typecheck, unsigned package check, and the golden folder journey.

  Commit: `feat(desktop): complete governed local folder execution`

### Task 7: Complete Android authenticated upload and reviewed server OCR loop

**Files:**

- Create: `packages/contracts/schemas/v1/dda-receipt-upload.schema.json`
- Modify: `packages/contracts/manifest.json`
- Modify: generated TypeScript/Kotlin/Python contract outputs through the generator only
- Create: `apps/android/app/src/main/java/com/databreeze/android/network/AuthenticatedApiTransport.kt`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/AuthenticatedReceiptUploadApiClient.kt`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptExtractionApiClient.kt`
- Modify: `apps/android/app/src/main/java/com/databreeze/android/AndroidRuntime.kt`
- Modify: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptReviewViewModel.kt`
- Test: `apps/android/app/src/test/java/com/databreeze/android/receipts/AuthenticatedReceiptUploadApiClientTest.kt`
- Test: `apps/android/app/src/androidTest/java/com/databreeze/android/receipts/DdaGoldenReceiptJourneyTest.kt`

**Interfaces:**

- Consumes: IAE resumable upload control plane, opaque transfer grants, DDA receipt extraction/review APIs, and account/workspace session provider.
- Produces: authenticated resumable receipt upload, server candidate polling, correction/version review, and governed acceptance; no client OCR or provider key.

- [ ] **Step 1: Freeze and generate the receipt upload wire contract**

  Cover create session, issue part transfer, transfer outcome, record part, complete session, request extraction, read candidate, correct candidate, and acceptance status with exact TenantScope/idempotency/revision fields.

- [ ] **Step 2: Implement authenticated resumable transport**

  Stream encrypted-staging plaintext only after scope/hash/length checks, never log it, use opaque grants for bytes, and resume from server-confirmed parts. Map 401/403/revocation to terminal failure and 408/429/5xx/network loss to bounded WorkManager retry.

- [ ] **Step 3: Replace unavailable review state only when a real candidate exists**

  Poll/read the exact candidate version, render field confidence/evidence, create correction versions, and require explicit review. Provider failure retains the original and manual correction path.

- [ ] **Step 4: Verify locally without Google Play or OpenAI credentials**

  Run JVM unit tests against a fake local HTTP server, `lintDebug`, `assembleDebug`, and `connectedDebugAndroidTest` on an emulator for camera permission/retake, process death, reboot, network loss, account switch, logout, and duplicate upload.

- [ ] **Step 5: Commit**

  Commit: `feat(android): complete authenticated receipt workflow`

### Task 8: Finish the OpenAI adapter contract and offline evaluation harness

**Files:**

- Create: `services/api/test/features/dda/openai-receipt-ocr.adapter.test.ts`
- Create: `services/api/test/features/dda/openai-receipt-ocr.contract.test.ts`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/manifest.json`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/synthetic-vi.json`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/synthetic-en.json`
- Modify: `tools/fixture-validation/src/run-openai-receipt-eval.mjs`
- Modify: `docs/evidence/dda/openai-receipt-evaluation.md`

**Interfaces:**

- Consumes: provider-neutral receipt OCR port and strict DDA receipt candidate schema.
- Produces: mocked contract coverage and deterministic offline evaluation; live mode remains explicitly credential-gated.

- [ ] **Step 1: Test request construction and failure behavior with an injected fake fetch**

  Assert image detail policy, `store:false`, no tools/web, strict schema, pinned-model configuration, timeout, refusal, 429 retry/backoff, malformed JSON/schema, prompt-like OCR text, coordinate remapping/bounds, cost/usage metering, and kill switch.

- [ ] **Step 2: Add synthetic offline evaluation**

  The offline corpus contains no customer images or secrets. It scores field/type/reconciliation/coordinate outcomes from recorded provider-shaped responses and proves the runner without a network call.

- [ ] **Step 3: Make live evaluation opt-in and fail closed**

  `--live` requires explicit project/model configuration and an owner-approved protected corpus; absent credentials return a blocked result, never fake success.

- [ ] **Step 4: Verify and commit**

  Run focused API tests and offline evaluator. Record `liveEvaluation: blocked-owner-input` without promoting DDA-044.

  Commit: `test(dda): complete OpenAI contract and offline evaluation`

### Task 9: Complete local security, accessibility, recovery, and performance evidence

**Files:**

- Modify: `services/api/test/features/dda/dda-tenant-isolation.e2e.test.ts`
- Modify: `services/api/test/features/dda/dda-authorization-matrix.e2e.test.ts`
- Modify: `services/api/test/features/dda/dda-retention-deletion.e2e.test.ts`
- Modify: `apps/web/e2e/dda-golden-journey.spec.ts`
- Modify: `apps/web/e2e/dashboard-sharing-security.spec.ts`
- Modify: `tools/recovery/verify-dda-restore.mjs`
- Modify: `tools/performance/dda-load.mjs`
- Modify: `tools/performance/dda-refresh-reference.mjs`
- Create: `docs/runbooks/dda-end-to-end-journey.md`
- Create: `docs/evidence/dda/release-evidence.md`

- [ ] **Step 1: Run production-shaped local services with synthetic data**

  Exercise PostgreSQL, object storage, Redis loss/restart, API restart, worker retry, duplicate events, tenant revocation, deletion/export, and last-good snapshot recovery. No external account is required.

- [ ] **Step 2: Complete automated Web accessibility and security checks**

  Cover keyboard/focus, named landmarks, chart table alternatives, contrast/reduced motion, warning/evidence visibility, Vietnamese/English copy, CSP, permission-filtered sharing, and stale/offline states.

- [ ] **Step 3: Run local load/reference profiles**

  Measure intake, ETL, cached interaction, refresh p95, concurrency, backpressure, and provider-budget simulation. Label local results; do not claim AWS production capacity.

- [ ] **Step 4: Rehearse local restore and rollback**

  Restore a production-shaped local database/object snapshot, verify hashes/lineage/outbox/audit/snapshots, and prove Redis loss is non-authoritative.

- [ ] **Step 5: Verify and commit**

  Commit: `test(dda): complete local production evidence`

### Task 10: Finish non-applying infrastructure, CI/CD, and unsigned release artifacts

**Files:**

- Modify: `infrastructure/aws/environments/staging/**`
- Modify: `infrastructure/aws/environments/production/**`
- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/security.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `apps/desktop/package.json`
- Modify: `apps/android/app/build.gradle.kts`
- Modify: `docs/operations/deployment-and-rollback.md`
- Modify: `docs/evidence/dda/release-pipeline-report.md`

- [ ] **Step 1: Run pinned OpenTofu without applying**

  Use the repository's pinned OpenTofu `1.12.5` container or CLI to run recursive format, backend-disabled init, validate, and mocked `.tofutest.hcl` tests for staging and production. Do not request AWS credentials and do not apply.

- [ ] **Step 2: Make CI reproduce the full local gate**

  Build workspace dependencies before Web tests; include formatter, lint, typecheck, requirements, orchestration, contracts, OpenAPI, Prisma, engine, Desktop, Android unit/lint/assemble, Playwright, security, SBOM/provenance, OpenTofu validation, and offline OpenAI evaluation.

- [ ] **Step 3: Produce unsigned/unpublished release candidates**

  Build the Web assets, Desktop installer/update payload, Android release bundle, migration image, API/worker images, SBOM, and provenance. Label them `unsigned-not-releasable`; scan for secrets, customer data, local paths, fixtures, and debug endpoints.

- [ ] **Step 4: Verify and commit**

  Commit: `build(dda): complete non-applying release pipeline`

### Task 11: Pass the agent-only completion gate and produce the owner activation packet

**Files:**

- Modify: `docs/evidence/dda/production-gate-matrix.md`
- Modify: `docs/evidence/dda/release-readiness.md`
- Modify: `docs/evidence/dda/release-manifest.json`
- Modify: `docs/plans/requirement-traceability.json`
- Create: `docs/evidence/dda/owner-activation-packet.md`

- [ ] **Step 1: Run the complete clean-checkout gate**

  Required: `corepack pnpm repo:check`, `corepack pnpm repo:build`, Web Playwright, Android unit/lint/assemble/emulator checks, pinned OpenTofu validation/tests, offline OpenAI evaluation, migration rehearsal, local restore, and secret/security checks.

- [ ] **Step 2: Reconcile requirement evidence honestly**

  Promote a requirement only when exact existing evidence and fresh tests prove its complete scope. Keep live-provider, live-cloud, signing, store, legal, real-device, production-load, or owner-approval portions partial/blocked.

- [ ] **Step 3: Generate one minimal owner packet**

  For each remaining external action, include: purpose, provider console, non-secret value/decision needed, protected secret destination, validation command Cursor will run afterward, rollback/revocation action, and evidence path. Do not ask the owner to hand-build ECS/RDS/S3 or paste secrets into chat.

- [ ] **Step 4: Commit**

  Commit: `docs(dda): hand off code-complete activation gates`

### Task 12: Activate live providers and production only after owner input

**Files:** Follow `401-dda-production-readiness.md` and `MANUAL-PREREQUISITES.md`.

**Blocked until supplied:** AWS accounts/OIDC/DNS/budgets/retention, OpenAI project/key/data policy/corpus/model approval, Windows signing identity, Google Play signing/listing/privacy declarations, pilot users/devices, on-call/legal/privacy owners, and final release authority.

- [ ] Apply reviewed staging infrastructure; run the live AWS/OpenAI journey and provider evaluation.
- [ ] Complete real-device/browser, restore/DR, alarms, production-shaped load, privacy/deletion, and security evidence.
- [ ] Sign Desktop/Android artifacts and complete store/distribution checks.
- [ ] Deploy disabled-by-default, smoke test, progressively enable invited tenants, monitor, and roll back on a failed gate.
- [ ] Mark G5 and `productionReady` complete only after every applicable owner item and rollback path is verified.

## Plan Self-Review

- Spec coverage: Tasks 1-11 cover all code, tests, local infrastructure, security, accessibility, recovery, cost, evidence, and release artifacts for DDA-001..050; Task 12 contains only external activation evidence.
- Placeholder scan: every task contains concrete paths, behavior, commands, and failure handling; none fabricates credentials.
- Type consistency: Web reads one permission-filtered draft contract; Android upload uses generated receipt-upload contracts; Desktop uses DSO opaque grants and signed typed engine jobs; durable repositories share the existing DDA ports.

## Definition of Code-First Done

- Clean checkout passes every agent-only gate with no secrets or external accounts.
- Web, Desktop, and Android complete their real application loops against local authenticated production-shaped services rather than fixture-only UI.
- Provider/cloud/signing/store/legal tasks are isolated in one owner packet and remain blocked, not faked.
- G5 remains blocked until Task 12; code-first completion is not represented as production release.
