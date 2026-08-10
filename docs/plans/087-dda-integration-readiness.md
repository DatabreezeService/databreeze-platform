# DDA Integration, Parity, and Release Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for ordered integration and `superpowers:verification-before-completion` before any completion claim.

**Status:** Approved<br>
**Requirements:** DDA-038, DDA-051<br>
**Integration scope:** Collects evidence for DDA-001 through DDA-050.<br>
**Depends on:** Plan 081 G1 and available handoffs from plans 082-086<br>
**Blocks:** Production readiness plan 400

**Goal:** Integrate the independent DDA lanes without weakening contracts, prove deterministic Local/Cloud equivalence, reproduce the mentor demo, and distinguish prototype evidence from production verification.

**Architecture:** The integration owner alone composes API/clients, orders migrations, reconciles generated outputs, owns golden fixtures and cross-platform tests, and updates evidence status. Each lane merges independently and is reverted if its receiving-branch gate fails. Production promotion proceeds only through the existing plan 400 gates.

**Tech Stack:** Monorepo contract/requirement/orchestration checks, TypeScript/Kotlin/Python builds and tests, Playwright, Android emulator where available, deterministic fixture harnesses, performance/security/evidence reports.

## Global Constraints

- Do not squash away lane-level rollback evidence during integration.
- Never resolve a conflict by loosening tenant, authorization, evidence, data-mode, retention, audit, idempotency, admission, or atomicity behavior.
- Generated contracts are regenerated from schema source; no hand-edited generated resolution.
- A fixture-only UI, fake OCR adapter, in-memory repository, skipped emulator, or unmeasured performance target is recorded as prototype/partial, never verified production evidence.
- `DDA-051` stays unimplemented and `post-ga`. Reject any code or UI label that claims streaming.

### Task 1: Integrate lane commits in dependency order

**Files:**

- Modify: `services/api/src/app.module.ts`
- Modify: `services/api/prisma/schema/platform.prisma`
- Modify: `services/api/prisma/schema/dda.prisma`
- Modify: `services/api/prisma/migrations/` only to reconcile deterministic ordering
- Modify: `packages/domain/src/v1.ts`
- Modify: generated contract trees only by running the generator
- Modify: root/client composition files locked by plan 080 only when a lane handoff requires them
- Create: `docs/evidence/dda/integration-ledger.md`

**Merge order:** 081, 082, 084, 083, 085, 086. The refresh lane precedes canvas publication so the viewer integrates against final snapshot/freshness APIs. Desktop and Android may be omitted from the mentor demo only with an explicit limitation; production cannot omit their P0 scope.

1. Verify each handoff commit is based on the G1 hash, owns only declared files, contains test results, and declares migrations/dependencies/limitations.
2. Merge/cherry-pick exactly one lane; resolve only root composition/generated/migration conflicts.
3. Run that lane's focused checks plus `corepack pnpm contracts:check`, `corepack pnpm typecheck`, and `corepack pnpm orchestration:check`.
4. If a gate fails, revert the lane integration and return a focused defect packet to its owner. Do not continue stacking failures.
5. Record commit, diff paths, checks, results, and decisions in `integration-ledger.md`.
6. Commit each successful integration separately as `chore(dda): integrate <lane>`.

### Task 2: Prove local and cloud deterministic parity

**Primary requirement:** DDA-038

**Files:**

- Create: `tools/fixture-validation/fixtures/dda/messy-sales/`
- Create: `tools/fixture-validation/fixtures/dda/receipt-expense/`
- Create: `tools/fixture-validation/src/run-dda-parity.mjs`
- Create: `tools/fixture-validation/test/dda-parity.test.mjs`
- Create: `services/engine/tests/test_dda_local_cloud_parity.py`
- Create: `docs/evidence/dda/parity-report.md`

**Parity assertion:** for identical typed plan and fixture, Local and Cloud produce equivalent governed values, row/count totals, units, quality states, reason codes, evidence keys, and canonical logical hashes. Representation bytes may differ only where the frozen contract declares the difference.

1. Add a failing parity harness using the exact generated TypeScript/Python/Kotlin fixture models and both sidecar/cloud engine entrypoints.
2. Include locale/date/currency, null, duplicate, rejection, schema drift, and deterministic ordering cases.
3. Fix processor/configuration differences at their owning abstraction; never normalize away a real semantic mismatch in the test.
4. Run the parity harness repeatedly and with reordered input delivery to prove deterministic logical output.
5. Record environment, engine versions, fixture hashes, commands, results, and declared byte differences. Commit `test(dda): prove local cloud parity`.

### Task 3: Run the golden cross-platform demo

**Files:**

- Create: `apps/web/e2e/dda-golden-journey.spec.ts`
- Create: `apps/desktop/test/dda-golden-folder-journey.test.ts`
- Create: `apps/android/app/src/androidTest/java/com/databreeze/android/receipts/DdaGoldenReceiptJourneyTest.kt`
- Create: `tools/demo/dda/reset-demo-state.mjs`
- Create: `tools/demo/dda/verify-demo-state.mjs`
- Create: `docs/runbooks/dda-mentor-demo.md`
- Create: `docs/evidence/dda/prototype-report.md`

**Golden journey:**

1. Upload messy sales CSV/XLSX; inspect profile, separate quality dimensions, ETL steps, before/after, and rejects; accept an immutable DatasetVersion.
2. Ask for a sales dashboard; review the typed plan; accept a draft; edit KPI/table/bar/line widgets; publish a snapshot; drill to permitted evidence.
3. Add one compatible file to the approved Desktop folder; process/sync the reviewed projection; observe only affected materializations refresh and the previous snapshot remain until atomic commit.
4. Capture a receipt on Android; upload, review OCR, correct/accept it; observe the expense view refresh.
5. Disable the AI adapter and take a source device offline; prove deterministic ETL/manual analysis/last-good snapshot and exact caveats remain usable.

The runbook includes prerequisites, one-command reset/verification, expected IDs/hashes/counts, Vietnamese default screens, English switch, fallback when no emulator/device is available, timings, known fixture-backed components, and prohibited production claims.

### Task 4: Preserve streaming as a deferred extension

**Primary requirement:** DDA-051

**Files:**

- Verify: `docs/specs/features/data-to-dashboard-agent.md`
- Verify: UI freshness labels and API enums from plans 081/084
- Update: `docs/evidence/dda/prototype-report.md`

1. Search code/UI/contracts for `STREAMING`, `real-time`, and equivalent claims.
2. Permit `STREAMING` only in rejected-validation tests or the canonical deferred requirement; V1 enums expose `ON_CHANGE`, `MANUAL`, and `SCHEDULED` only.
3. Record the future specification gate: ordering, lateness, correction, replay, windowing, capacity, cost, and snapshot consistency.

### Task 5: Reconcile traceability and production readiness

**Files:**

- Modify: `docs/plans/requirement-traceability.json`
- Modify: `docs/plans/data-to-dashboard-orchestration.json`
- Create: `docs/evidence/dda/release-readiness.md`
- Verify: `docs/plans/400-production-readiness.md`

1. For every DDA record, attach only existing code/test/release evidence and passing commands. Use `partial` for prototype-only or incomplete platform/security/performance evidence.
2. Keep P0 unverified until tenant isolation, authorization, contracts, local/cloud parity, retention/deletion, audit, recovery, accessibility, and relevant performance gates exist and pass.
3. Run `corepack pnpm requirements:check`, traceability tests, `corepack pnpm orchestration:check`, contracts, full repository checks, API/engine/Web/Desktop/Android suites, and the golden journey in supported environments.
4. List remaining plan 400 gates, owners, dependencies, and rollback/release strategy. Do not claim production completion merely because the 24-hour prototype works.
5. Commit `docs(dda): record integration and readiness evidence`.

## Integration definition of done

- All available lane commits merge cleanly through public contracts and file ownership has no unresolved overlap.
- Golden fixture reset, parity, and demo verification are reproducible from a clean checkout.
- Every DDA requirement has one primary task and honest evidence state.
- The last complete snapshot survives refresh/AI/source failures, and no test observes a mixed-version or permission-colliding result.
- The prototype report distinguishes real services, deterministic fakes, in-memory adapters, skipped hardware evidence, and production gaps.
- Plan 400 contains the remaining production release gate; DDA-051 remains deferred.
