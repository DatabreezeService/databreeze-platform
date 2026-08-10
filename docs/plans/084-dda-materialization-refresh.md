# DDA Materialization and Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; use `superpowers:test-driven-development` for each task.

**Status:** Approved<br>
**Requirements:** DDA-027, DDA-028, DDA-029, DDA-030, DDA-031, DDA-032, DDA-033, DDA-034, DDA-035, DDA-036<br>
**Depends on:** Plan 081 G1 contract commit<br>
**Parallel with:** Plans 082-083 and 085-086, subject to plan 080 file locks

**Goal:** Refresh only affected permission-scoped dashboard results after trusted data changes, publish complete snapshots atomically, and keep ordinary dashboard views cheap and consistent.

**Architecture:** A DSM transactional outbox event carries content-safe identity only. DDA reauthorizes and resolves a versioned dependency index, coalesces compatible events, admits bounded JRA materialization jobs, executes deterministic processors, verifies manifests/cache keys, and commits one complete snapshot. SSE announces committed state; clients reconcile through authorized REST. PostgreSQL is authoritative; Redis may coordinate leases/debounce but loss must be recoverable.

**Tech Stack:** NestJS/Fastify, Prisma/PostgreSQL outbox/state, JRA typed jobs, Python processors, optional Redis coordination, REST/SSE, Node/pytest/load harness.

## Global Constraints

- This lane owns `services/api/src/features/dda/refresh/`, processors prefixed `dda_materialize_`, and refresh tests/harnesses.
- Do not edit generated contracts, root API/Web composition, canvas UI, ETL processors, Desktop, or Android.
- Protected values never ride in events. Consumers fetch through authorized foundation APIs.
- A cache key includes every value- or authorization-affecting dimension. Unknown/missing dimensions force recomputation.
- Partial, failed, mixed-input, or mixed-permission results never replace the last complete snapshot.

### Task 1: Resolve dependencies and complete cache identity

**Primary requirements:** DDA-028, DDA-029, DDA-031

**Files:**

- Create: `services/api/src/features/dda/refresh/application/dependency-index.service.ts`
- Create: `services/api/src/features/dda/refresh/application/dependency-repository.port.ts`
- Create: `services/api/src/features/dda/refresh/application/materialization-cache-key.ts`
- Create: `services/api/src/features/dda/refresh/application/materialization-processor-catalog.ts`
- Create: `services/api/src/features/dda/refresh/adapter/in-memory-dependency-repository.adapter.ts`
- Create: `services/api/test/features/dda/dependency-index.service.test.ts`
- Create: `services/api/test/features/dda/materialization-cache-key.test.ts`
- Create: `services/engine/src/databreeze_engine/processors/dda_materialize_query.py`
- Create: `services/engine/tests/test_dda_materialize_query.py`

**TDD sequence:**

1. Add red dependency tests for dataset/semantic/metric/parameter changes, deleted bindings, duplicate/out-of-order events, unauthorized event references, and payload values that must be ignored.
2. Add collision tests across tenant scope, permission projection, dashboard/widget/plan version, datasets, semantics, metrics, parameters, locale/timezone, engine/adapter version, and effective policy.
3. Add processor tests proving incremental recomputation is used only when a registered processor declares compatible change semantics and prior-state proof; all other changes choose bounded full recomputation and disclose the reason.
4. Implement dependency lookup, canonical cache serialization/hash, and processor catalog. Run focused API/engine tests.
5. Commit `feat(dda): resolve materialization dependencies`.

### Task 2: Coalesce refreshes and publish atomically

**Primary requirements:** DDA-030, DDA-032

**Files:**

- Create: `services/api/src/features/dda/refresh/application/refresh-orchestrator.service.ts`
- Create: `services/api/src/features/dda/refresh/application/snapshot-commit.service.ts`
- Create: `services/api/src/features/dda/refresh/application/refresh-foundation-ports.ts`
- Create: `services/api/src/features/dda/refresh/adapter/in-memory-refresh-coordinator.adapter.ts`
- Create: `services/api/test/features/dda/refresh-orchestrator.service.test.ts`
- Create: `services/api/test/features/dda/snapshot-commit.service.test.ts`
- Create: `services/engine/src/databreeze_engine/processors/dda_materialize_snapshot.py`
- Create: `services/engine/tests/test_dda_materialize_snapshot.py`

**TDD sequence:**

1. Write replay/idempotency tests for duplicate source events, worker retries, client retries, folder replay, lease expiry, crash after job dispatch, crash after result verification, and crash during snapshot commit.
2. Write coalescing tests proving the final accepted input set is retained and incompatible permission/definition/input sets never coalesce.
3. Write atomicity tests for missing/failed/mismatched result manifests, mixed dataset versions, mixed permission projections, retention-deleted inputs, and a database commit failure. The previous snapshot remains current in every failure.
4. Implement explicit refresh states (`PENDING`, `RUNNING`, `VERIFYING`, `COMMITTED`, `BLOCKED`, `FAILED`, `SUPERSEDED`) and one transactional pointer swap after complete verification.
5. Run focused tests and commit `feat(dda): publish refresh snapshots atomically`.

### Task 3: Expose freshness and reconcile connected clients

**Primary requirements:** DDA-027, DDA-033, DDA-034, DDA-035

**Files:**

- Create: `services/api/src/features/dda/refresh/application/freshness.service.ts`
- Create: `services/api/src/features/dda/refresh/api/dashboard-refresh.controller.ts`
- Create: `services/api/src/features/dda/refresh/api/dashboard-refresh-events.controller.ts`
- Create: `services/api/src/features/dda/refresh/api/dashboard-refresh.dto.ts`
- Create: `services/api/test/features/dda/dashboard-refresh.controller.test.ts`
- Create: `services/api/test/features/dda/dashboard-refresh-events.test.ts`
- Create: `services/api/test/features/dda/dashboard-refresh-performance.test.ts`
- Create: `tools/performance/dda-refresh-reference.mjs`

**Freshness response:** last successful refresh, exact authorized input selector/versions, `CURRENT|PENDING|STALE|BLOCKED|SOURCE_UNAVAILABLE`, pending duration, stable reason, last-good snapshot reference, and result completeness/sampling/truncation state.

**TDD sequence:**

1. Add tests for current authorization after permission revocation, source offline/stale/removed, retention expiry, pending age, and last-good visibility.
2. Add SSE tests for tenant isolation, content-safe envelopes, duplicate/out-of-order sequence, reconnect cursor gap, permission changes, and REST reconciliation.
3. Implement committed-event SSE only; never stream raw result data. A client event is a hint to refetch authorized REST state.
4. Implement the published small-change reference fixture/harness and capture acceptance-to-snapshot latency. The P0 target is p95 within 60 seconds under the declared profile, excluding review and source-device unavailability.
5. Run focused tests/harness and commit `feat(dda): expose dashboard freshness`.

### Task 4: Enforce usage, admission, and safe denial

**Primary requirement:** DDA-036

**Files:**

- Create: `services/api/src/features/dda/refresh/application/refresh-admission.service.ts`
- Create: `services/api/src/features/dda/refresh/application/refresh-usage.port.ts`
- Create: `services/api/test/features/dda/refresh-admission.service.test.ts`

1. Write red tests for storage, profile/ETL, AI, OCR, materialization, frequency, concurrency, cache retention, and publication limits at organization/workspace/project scope.
2. Prove denial creates no partial snapshot, deletes no data, retains last-good view, emits content-safe usage/audit outcome, and returns safe remediation without leaking plan/value details.
3. Implement BUA port composition with fail-closed paid-resource admission and idempotent reservation/finalization/release.
4. Run API tests and commit `feat(dda): enforce refresh admission limits`.

### Task 5: Produce the lane handoff

Run focused API/engine tests, the full API test package, engine pytest, and the reference harness. Return commit hashes, state diagrams/Problem codes, idempotency and atomicity evidence, performance environment/results, known limitations, and contract requests. Do not self-edit traceability status.
