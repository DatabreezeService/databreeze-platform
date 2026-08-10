# DDA Contracts and Authority Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; use `superpowers:test-driven-development` for each task.

**Status:** Approved<br>
**Requirements:** DDA-001, DDA-003, DDA-043, DDA-044, DDA-045, DDA-046<br>
**Depends on:** Accepted ADR-0004 and existing IAM/IAE/DSM/JRA/DSO/NCO/BUA/AUD contracts<br>
**Blocks:** Plans 082-087

**Goal:** Freeze one versioned DDA vocabulary, persistence boundary, and cross-language fixture set before parallel implementation starts.

**Architecture:** `@databreeze/domain` validates domain values; JSON Schema is the client/worker wire authority; the NestJS DDA module owns only DDA metadata and composes foundation ports. IAE owns bytes/evidence/retention, DSM owns governed data and definitions, JRA owns jobs/results/approvals, DSO owns device/data-mode transfer, BUA owns admission/usage, and AUD owns canonical audit records.

**Tech Stack:** TypeScript domain models and Node tests, JSON Schema 2020-12 generated to TypeScript/Kotlin/Python, Prisma/PostgreSQL `dda` schema, NestJS module ports, bilingual Problem Details.

## Global Constraints

- Do not duplicate foundation records, foreign persistence, original bytes, dataset rows, audit entries, entitlements, or device secrets in DDA tables.
- IDs and full TenantScope are explicit. Immutable version objects have canonical hashes and exact parent/input selectors.
- Wire contracts reject unknown transformation/widget/plan kinds and unsafe source-authored instruction fields.
- Generated files are produced by the contract generator and never edited by hand.
- This plan exclusively owns contract schemas, `packages/domain/src/v1.ts`, `services/api/prisma/schema/dda.prisma`, platform schema registration, and golden cross-language fixtures until its handoff commit.

### Task 1: Freeze DDA domain values and golden fixtures

**Primary requirement:** DDA-003

**Files:**

- Create: `packages/domain/src/data-to-dashboard/v1.ts`
- Create: `packages/domain/test/data-to-dashboard-v1.test.mjs`
- Modify: `packages/domain/src/v1.ts`
- Create: `packages/contracts/schemas/v1/dda-etl-plan.schema.json`
- Create: `packages/contracts/schemas/v1/dda-analysis-plan.schema.json`
- Create: `packages/contracts/schemas/v1/dda-dashboard-version.schema.json`
- Create: `packages/contracts/schemas/v1/dda-dashboard-snapshot.schema.json`
- Create: `packages/contracts/schemas/v1/dda-materialization.schema.json`
- Create: `packages/contracts/schemas/v1/dda-folder-manifest.schema.json`
- Create: `packages/contracts/schemas/v1/dda-receipt-candidate.schema.json`
- Create: `packages/contracts/schemas/v1/dda-refresh-event.schema.json`
- Create: `packages/contracts/test/fixtures/dda/v1/golden-valid.json`
- Create: `packages/contracts/test/fixtures/dda/v1/invalid-cross-tenant.json`
- Create: `packages/contracts/test/fixtures/dda/v1/invalid-arbitrary-code.json`
- Modify: `packages/contracts/manifest.json`
- Modify: `packages/contracts/compatibility/v1/baseline.json`

**Interfaces:**

- `DdaEtlPlanV1`: plan/version/input/schema/mapping/rule/engine bindings plus an allowlisted transformation DAG.
- `DdaAnalysisPlanV1`: exact dataset/semantic/metric versions, dimensions, filters, time range/grain, joins, units, parameters, output, assumptions, estimate, and permission projection.
- `DashboardVersionV1`: stable dashboard/page/widget/filter IDs, responsive layouts, typed bindings, locale/timezone, freshness/publication policy, parent version, and canonical hash.
- `DashboardSnapshotV1`: one version plus exact verified materializations/input/permission versions, audience, freshness/evidence state, and hash.
- `DdaMaterializationV1`: complete cache identity and result-manifest reference; it contains no raw result cells in event payloads.
- `DdaFolderManifestV1` and `DdaReceiptCandidateV1`: opaque device/artifact references only; actual paths and bytes remain with their owners.

**TDD sequence:**

1. Add tests that reject original mutation, missing TenantScope, cross-scope parent/input IDs, unsupported arbitrary-code transformation kinds, `STREAMING`, unstable page/widget IDs, incomplete cache identities, and snapshot hashes that do not cover all value-affecting fields.
2. Run `node --test packages/domain/test/data-to-dashboard-v1.test.mjs`; expect failure because the module does not exist.
3. Implement immutable constructors/validators and discriminated unions; export them from `packages/domain/src/v1.ts`.
4. Add the eight schemas and valid/invalid fixtures to the manifest. Run `corepack pnpm --filter @databreeze/contracts generate`.
5. Run `corepack pnpm --filter @databreeze/domain test` and `corepack pnpm --filter @databreeze/contracts contract:check`; expect both to pass with TypeScript/Kotlin/Python fixture parity.
6. Commit: `feat(dda): freeze dashboard agent contracts`.

### Task 2: Establish DDA persistence and public composition ports

**Primary requirement:** DDA-001

**Files:**

- Create: `services/api/prisma/schema/dda.prisma`
- Modify: `services/api/prisma/schema/platform.prisma`
- Create: `services/api/prisma/migrations/20260810010000_dda_foundation/migration.sql`
- Create: `services/api/src/features/dda/dda.module.ts`
- Create: `services/api/src/features/dda/application/foundation-ports.ts`
- Create: `services/api/src/features/dda/application/dashboard-repository.port.ts`
- Create: `services/api/src/features/dda/application/analysis-plan-repository.port.ts`
- Create: `services/api/src/features/dda/application/refresh-repository.port.ts`
- Create: `services/api/src/features/dda/adapter/in-memory-dashboard-repository.adapter.ts`
- Create: `services/api/src/features/dda/adapter/in-memory-analysis-plan-repository.adapter.ts`
- Create: `services/api/src/features/dda/adapter/in-memory-refresh-repository.adapter.ts`
- Create: `services/api/test/features/dda/dda-module-boundaries.test.ts`
- Create: `services/api/test/features/dda/dda-prisma-scope.test.ts`

**Persistence ownership:**

- DDA stores dashboard identity/version metadata, analysis-plan metadata, materialization definitions/references, dependency entries, refresh state, and snapshot metadata.
- DDA stores only IAE artifact/evidence references, DSM dataset/definition/version references, JRA job/result/approval references, DSO capability/projection references, BUA usage references, and AUD correlation IDs.
- Tenant-scoped unique keys include organization/workspace/project and never rely on an unscoped resource ID.
- No relational foreign key crosses feature-owned database schemas; application ports validate referenced authority/version at command time.

**TDD sequence:**

1. Write boundary tests that fail if DDA imports another feature's adapter/repository, exposes a database client to a worker/client, or permits unscoped lookup/cache keys.
2. Write migration tests for schema registration, immutable version rows, tenant-scoped indexes, append-only snapshots, and no DDA-owned byte/blob columns.
3. Run `corepack pnpm --filter @databreeze/api test`; expect the new tests to fail.
4. Add Prisma models and the metadata-only repository ports/adapters. The module exports application services/ports but is not added to `app.module.ts`; plan 087 owns root composition.
5. Run `corepack pnpm --filter @databreeze/api prisma:validate` and `corepack pnpm --filter @databreeze/api test`; expect pass.
6. Document rollback in the migration: stop DDA admission, retain IAE/DSM/JRA records, export DDA metadata, then drop only empty/unpublished DDA tables in reverse dependency order. Never delete IAE content or AUD history.
7. Commit: `feat(dda): add authority-safe persistence boundary`.

### Task 3: Enforce untrusted-content, AI-egress, retention, and audit contracts

**Primary requirements:** DDA-043, DDA-044, DDA-045, DDA-046

**Files:**

- Create: `packages/domain/src/data-to-dashboard/policy-v1.ts`
- Create: `packages/domain/test/data-to-dashboard-policy-v1.test.mjs`
- Create: `services/api/src/features/dda/application/dda-policy.service.ts`
- Create: `services/api/src/features/dda/application/dda-audit.port.ts`
- Create: `services/api/src/features/dda/application/dda-content-authority.ts`
- Create: `services/api/test/features/dda/dda-policy.service.test.ts`
- Create: `services/api/test/features/dda/dda-content-authority.test.ts`
- Create: `docs/security/dda-data-flow.md`

**Interfaces:**

- `DdaAiEgressPolicyV1` explicitly allowlists adapter, locality, purpose, metadata, samples, result rows, evidence, retention, and maximum payload.
- `DdaContentAuthorityV1` brands source-originated strings as data-only and rejects them at command/tool/canvas/publication boundaries.
- `DdaAuditPortV1` emits content-safe action/outcome/reference summaries to AUD; it does not become a second ledger.
- `DdaRetentionPortV1` adds holds/constraints through IAE and never calls storage deletion directly.

**TDD sequence:**

1. Add red tests using prompt-like filenames/cells/OCR text and prove none can select tools, change plans, publish, transfer, or broaden access.
2. Add red tests for disabled/provider-failed AI and prove deterministic ETL, manual typed analysis, and saved snapshot viewing remain available.
3. Add red tests that every named mutation/action emits an AUD request and that telemetry/audit summaries exclude values, paths, OCR text, evidence snippets, and credentials.
4. Implement policy and authority services through explicit ports; default AI egress is denied.
5. Run `corepack pnpm --filter @databreeze/domain test` and `corepack pnpm --filter @databreeze/api test`; expect pass.
6. Commit: `feat(dda): enforce content and egress boundaries`.

### Task 4: Publish the contract-gate handoff

**Coordinator-owned files after the worker handoff:** `docs/plans/data-to-dashboard-orchestration.json` and `docs/plans/requirement-traceability.json`.

1. Run `corepack pnpm contracts:check`, `corepack pnpm --filter @databreeze/domain test`, `corepack pnpm --filter @databreeze/api prisma:validate`, and `corepack pnpm --filter @databreeze/api test`.
2. Run `corepack pnpm orchestration:check` and `corepack pnpm requirements:check`.
3. Return the handoff commit and hashes of the valid DDA fixtures to the primary coordinator. The worker does not edit orchestration or traceability status.
4. The primary coordinator reruns the gate, records evidence without marking downstream behavior verified, and announces G1 green. Only then may plans 082-086 branch from the frozen commit.
