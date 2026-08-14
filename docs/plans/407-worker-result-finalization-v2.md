# Worker Result Finalization V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; use `superpowers:test-driven-development` for every behavior change.

**Status:** Approved by the product owner on 2026-08-13  
**Requirements:** IAE-024, JRA-007, JRA-012, JRA-021, JRA-023, JRA-031, JRA-032, BUA-004, BUA-007, BUA-008, BUA-023, DDA-003, DDA-018, DDA-025, DDA-029, DDA-032, DDA-038  
**Depends on:** Plans 030, 040 and 084

**Goal:** Let authenticated workers upload, verify and atomically commit immutable typed results without database credentials, caller-asserted authority or success-before-upload races.

**Architecture:** `PREPARE_RESULT` validates the latest leased attempt and derives a descriptor-owned output policy before IAE issues attempt-bound write capabilities. The worker transfers bytes through IAE; IAE verifies the receipt and finalizes immutable derived ArtifactVersions with content-free attestations. `FINALIZE_RESULT` resolves those attestations server-side and commits the canonical JRA ResultManifest, terminal state, replay receipt, audit/outbox and usage settlement in one serializable transaction. DDA consumes only verified manifest bindings and never raw worker assertions.

**Tech Stack:** NestJS/Fastify, Prisma/PostgreSQL serializable transactions, generated JSON Schema contracts, signed IAE capabilities, Python Pydantic worker client, deterministic DDA processors.

## Global constraints

- PostgreSQL is authoritative; Redis is a dispatch hint only.
- Workers receive no database credentials, storage keys, paths, arbitrary commands or workspace enumeration capability.
- TenantScope, worker identity, security epoch, attempt authority, descriptor and output policy are server-owned.
- Result bytes stay non-authoritative until IAE finalization and JRA atomic commit both succeed.
- Identical retries replay exact stored results; changed idempotency reuse conflicts.
- Orphan prepared/transferred objects are quarantined, never readable as governed results, and cleaned under JRA-021.
- Existing legacy completion remains fail-closed for successful result-bearing work until the v2 cutover; failed/cancelled terminal reporting may remain compatible where it carries no result authority.
- Published v1-v3 contracts remain byte-identical. New worker transport is additive in unpublished v4 or an internal versioned worker contract.

### Task 1: IAE worker-result attestation

**Files:**

- Create: `services/api/src/features/iae/application/worker-result-finalization.port.ts`
- Create: `services/api/src/features/iae/application/worker-result-finalization.service.ts`
- Create: `services/api/src/features/iae/adapter/prisma-worker-result-finalization.adapter.ts`
- Modify: `services/api/prisma/schema/iae.prisma`
- Create: `services/api/prisma/migrations/20260814110000_iae_worker_result_finalization/migration.sql`
- Test: `services/api/test/features/iae/worker-result-finalization.service.test.ts`
- Test: `services/api/test/features/iae/prisma-worker-result-finalization.adapter.test.ts`

**Produces:** `IaeWorkerResultFinalizationPortV1.finalize(identity, command)` returning an immutable content-free attestation with `attestationId`, `artifactVersionId`, `contentSha256`, `contentLength`, `mediaType`, descriptor/attempt/submission bindings and source-lineage hash.

- [ ] Write failing tests for exact transfer receipt verification, superseded/expired attempt, epoch mismatch, output-policy mismatch, source-lineage mismatch, identical replay, changed replay, immutable artifact creation and transaction rollback.
- [ ] Run the focused tests and confirm they fail because the finalization port does not exist.
- [ ] Implement the narrow port, service, Prisma adapter and additive migration. The adapter shall consume the existing IAE capability/receipt authority and create one immutable derived ArtifactVersion/placement/lineage/attestation transactionally.
- [ ] Run focused tests, Prisma validation, migration inventory and API typecheck.

### Task 2: JRA prepare-result authority

**Files:**

- Create: `services/api/src/features/jra/worker/worker-result-preparation.port.ts`
- Modify: `services/api/src/features/jra/worker/worker-ports.ts`
- Modify: `services/api/src/features/jra/worker/worker-boundary.ts`
- Modify: `services/api/src/features/jra/worker/worker.controller.ts`
- Modify: `services/api/src/features/jra/worker/worker.dto.ts`
- Modify: `services/api/src/features/jra/worker/prisma-worker-adapter.ts`
- Test: `services/api/test/features/jra/worker-result-preparation.test.ts`
- Test: `services/api/test/features/jra/worker-boundary.test.ts`

**Consumes:** The immutable execution descriptor and IAE capability authority.  
**Produces:** `POST /internal/worker/results/prepare` returning only stable submission identity, descriptor/attempt binding, exact output object IDs, limits and signed IAE write capabilities.

- [ ] Write failing tests proving preparation requires the latest current lease, current epoch, exact descriptor/action output schema, bounded object policy and stable idempotent submission ID.
- [ ] Confirm RED, then implement preparation without terminal attempt/job mutation.
- [ ] Prove stale/superseded/cancelled work receives no capability and repeated identical preparation returns the same submission/bindings.
- [ ] Run focused worker tests, API typecheck and lint.

### Task 3: JRA finalize-result transaction

**Files:**

- Create: `services/api/src/features/jra/worker/worker-result-finalization.port.ts`
- Modify: `services/api/src/features/jra/worker/worker-ports.ts`
- Modify: `services/api/src/features/jra/worker/worker-boundary.ts`
- Modify: `services/api/src/features/jra/worker/worker.controller.ts`
- Modify: `services/api/src/features/jra/worker/worker.dto.ts`
- Modify: `services/api/src/features/jra/worker/prisma-worker-adapter.ts`
- Modify: `services/api/prisma/schema/jra.prisma`
- Create: `services/api/prisma/migrations/20260814110100_jra_worker_result_finalization/migration.sql`
- Test: `services/api/test/features/jra/worker-result-finalization.test.ts`
- Test: `services/api/test/features/jra/prisma-worker-result-finalization.test.ts`

**Consumes:** IAE finalization attestations from Task 1 and preparation records from Task 2.  
**Produces:** `POST /internal/worker/results/finalize` and one canonical immutable ResultManifest plus stored replay result.

- [ ] Write failing tests for server-side attestation resolution, exact descriptor/attempt/subject binding, one serializable manifest plus terminal transition, audit/outbox/usage participant rollback, identical replay, changed replay, crash/retry and older-attempt rejection.
- [ ] Confirm RED, then implement minimal transactional finalization.
- [ ] Remove result-bearing success authority from the legacy `complete` path; it must not mint output grants after success.
- [ ] Run focused tests, concurrent two-client tests, Prisma validation, API typecheck and lint.

### Task 4: Generated worker transport and Python client

**Files:**

- Create: `packages/contracts/schemas/v4/jra-worker-result-prepare-command.schema.json`
- Create: `packages/contracts/schemas/v4/jra-worker-result-prepare-accepted.schema.json`
- Create: `packages/contracts/schemas/v4/jra-worker-result-finalize-command.schema.json`
- Create: `packages/contracts/schemas/v4/jra-worker-result-finalize-accepted.schema.json`
- Modify: `packages/contracts/manifest.json`
- Modify: `packages/test-fixtures/contracts/v4/manifest.json`
- Modify: `services/engine/src/databreeze_engine/worker_client.py`
- Modify: `services/engine/src/databreeze_engine/models.py`
- Modify: `services/engine/src/databreeze_engine/dispatcher.py`
- Test: `services/engine/tests/test_worker_client.py`
- Test: `services/engine/tests/test_dispatcher.py`

**Consumes:** The two internal HTTP commands from Tasks 2 and 3.  
**Produces:** Strict cross-language v4 transport and a worker flow that prepares, transfers, finalizes through IAE, then finalizes through JRA.

- [ ] Write rejected fixtures and Python tests for missing/extra keys, wrong binding, oversize output, provider paths/URLs/secrets, stale lease, transport retry and malformed attestations.
- [ ] Confirm RED, generate exact TypeScript/Python/Kotlin contracts, and implement a closed typed output union rather than `FoundationDigestResult` only.
- [ ] Ensure heartbeat ownership stops before finalization and permanent 4xx responses are never blindly retried.
- [ ] Run contract parity, full engine pytest, Ruff and mypy.

### Task 5: DDA verified materialization integration

**Files:**

- Create: `services/api/src/features/dda/dashboard/adapter/verified-dashboard-widget-result-reader.adapter.ts`
- Modify: `services/api/src/features/dda/dda.module.ts`
- Modify: `services/api/src/features/dda/refresh/application/snapshot-commit.service.ts`
- Modify: `services/api/src/features/dda/dashboard/api/dashboard-widget-results.controller.ts`
- Test: `services/api/test/features/dda/verified-dashboard-widget-result-reader.test.ts`
- Test: `services/api/test/features/dda/snapshot-commit.service.test.ts`
- Test: `services/api/test/features/dda/dashboard-widget-results.controller.test.ts`

**Consumes:** Canonical JRA ResultManifests and IAE ArtifactVersion attestations only.  
**Produces:** Live authorized v4 widget results and snapshot commit verification.

- [ ] Write failing tests for exact dashboard/version/widget/plan/metric/dataset/projection/policy/locale/timezone/engine binding, mixed results, missing attestation, permission revocation and last-good preservation.
- [ ] Confirm RED, then implement the reader and register the controller only when durable dependencies exist.
- [ ] Prove no caller-provided rows, manifest hashes or object IDs can become dashboard values.
- [ ] Run focused API tests plus the real refresh golden journey.

### Task 6: Production composition and release evidence

**Files:**

- Modify: `services/api/src/app.module.ts`
- Modify: `services/api/src/platform/production-database.composition.ts`
- Create: `infrastructure/containers/worker/Dockerfile`
- Create: `infrastructure/containers/worker/README.md`
- Modify: `.github/workflows/api-container.yml`
- Test: `services/api/test/platform/production-database-composition.test.ts`
- Test: `tools/repo-cli/test/container-build.test.mjs`

- [ ] Write failing composition/container tests proving the production worker has authenticated APIs and IAE capabilities but no database credentials, storage credentials or arbitrary command surface.
- [ ] Confirm RED, compose the shared durable ports once at the application root and build the worker image.
- [ ] Run API full test/lint/typecheck/OpenAPI, contract parity, engine full gates, Docker positive/negative smoke and `git diff --check`.
- [ ] Record remaining owner-only deployment evidence without marking G5 ready.

### Task 7: Secure worker transfer, effects and executable runtime closure

**Files:**

- Create: `services/api/src/features/iae/worker/api/worker-object-transfer.controller.ts`
- Create: `services/api/src/features/iae/adapter/s3-worker-object-byte-store.adapter.ts`
- Create: `services/api/src/platform/iae-worker-result-capability.composition.ts`
- Create: `services/api/src/platform/jra-worker-result-effects.composition.ts`
- Create: `services/engine/src/databreeze_engine/worker_main.py`
- Create: `infrastructure/containers/worker/Dockerfile`
- Modify: `services/api/src/features/iae/iae.module.ts`
- Modify: `services/api/src/app.module.ts`
- Modify: `services/api/src/platform/production-database.composition.ts`
- Modify: `infrastructure/aws/modules/security/main.tf`
- Modify: `infrastructure/aws/modules/compute/main.tf`
- Test: `services/api/test/platform/worker-result-production-composition.test.ts`
- Test: `services/engine/tests/test_worker_main.py`
- Test: `tools/repo-cli/test/container-build.test.mjs`

- [ ] Add failing tests for authenticated exact-object transfer/finalization endpoints, immutable S3 bytes, descriptor/submission-bound WRITE grants, and no object/storage enumeration.
- [ ] Implement an IAE-owned prepared-result capability issuer that derives ArtifactVersion, placement and lineage bindings server-side and never trusts worker object policy.
- [ ] The IAE issuer bridge shall receive server-owned `sourceArtifactVersionIds`, `processorVersion`, `dataMode` and `payloadClass` from JRA preparation, bind declared digest/length plus descriptor/submission/output-policy hashes, and reject absent or `Local` cloud-output authority. Authenticated transfer/finalization shall resolve the capability ID from the MAC-authenticated opaque capability rather than requiring a duplicate worker-supplied ID.
- [ ] Extend the server-owned prepared output authority with exact source ArtifactVersion IDs, processor version, data mode and payload class. The worker transport shall not supply these fields and IAE shall not infer them from result bytes.
- [ ] Persist one opaque BUA `ResultUsageSettlementBinding` ID with each metered JRA admission. The BUA-owned binding shall be exact to the admitted Job/reservation/meter/formula/cap and JRA shall not copy or invent that authority.
- [ ] Implement same-Prisma-transaction AUD and BUA participants for successful result finalization. BUA shall resolve the stored opaque settlement binding, compute usage only from its server formula plus verified result facts, consume/release the existing reservation and append exact idempotent usage; any mismatch or unavailable participant rolls back the whole result commit.
- [ ] Add a bounded long-running assignment loop and worker image whose runtime receives only an API endpoint plus a protected worker credential; it receives no database, bucket, KMS or signing secret.
- [ ] Provision an API-only capability-signing secret and protected worker service-account credential delivery through IaC; keep both absent/fail-closed until owner values are supplied.
- [ ] Run focused transfer/effects/worker tests, API and engine full gates, Docker smoke, OpenTofu validation and scoped diff checks.

### Deferred prerequisite: authoritative engine workload admission

The Task 7 worker image may poll and shut down safely, but it shall remain fail-closed for execution until the server-owned admission path persists and grants one exact typed engine workload. The existing `JOB_INPUT` grant contains governed source ArtifactVersion object IDs; it is not itself an `EngineExecutionRequest` and must never be reinterpreted as parameters.

- [ ] Add an approved additive plan/spec requirement for an IAE/JRA-bound workload envelope containing the registered action identity, exact input handle metadata, bounded server-derived parameters, output handle policy, deadline, locale and canonical hash.
- [ ] Build that envelope from authorized DSM/DDA/IAE application ports during admission, store it immutably, include its opaque ArtifactVersion/object reference in the attempt-bound input grant, and verify it again before engine dispatch.
- [ ] Only after positive cross-tenant, revoked-policy, changed-hash and malformed-envelope tests pass may `worker_main` install a workload resolver and claim execution work. Until then it must exit or reject the assignment before input transfer and produce no result.
