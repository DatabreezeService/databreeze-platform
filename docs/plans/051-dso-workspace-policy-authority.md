# DSO Workspace Policy Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Approved for execution. Option 1, atomic publish-and-activate, was selected on 2026-08-13; the specification amendment in Task 1 is authoritative.

**Extends:** `docs/plans/050-devices-sync-offline.md`

**Requirements:** DSO-018, DSO-024, DSO-026, DSO-027; IAM-002, IAM-003, IAM-012, IAM-019, IAM-020

**Goal:** Provide one authoritative, tenant-exact current Workspace DataMode policy and live authorization epoch to execution-route admission without inferring a latest version, fabricating an IAM actor context, or reading another feature's persistence.

**Architecture:** DSO continues to own immutable policy versions and the authoritative current-version aggregate. IAM stores only the exact policy IDs, content-safe mode projection, and workspace authorization epoch. A root composition adapter compares both public authorities and fails closed unless scope, IDs, hash, projection, aggregate revision, and epoch form one current binding.

**Tech Stack:** TypeScript 5.9, NestJS 11/Fastify 5, Prisma 7/PostgreSQL, Node test runner, repository domain packages, and additive SQL migrations.

## Approval-blocking activation decision

The accepted specifications define the records and ownership but do not define the activation transaction:

- DSO-026 requires every route to use the current Workspace policy.
- DSO-027 and the DSO domain model make DSO authoritative for `WorkspaceDataModePolicy.currentVersionId` and immutable versions.
- The IAM domain model stores `dataModePolicyId`, `currentDataModePolicyVersionId`, `dataModeProjection`, and `authorizationEpoch` as a projection.
- DSO-018 requires Admin authority, recent MFA, audit, and migration or purge workflow for a transition.
- The documented REST API can publish policy versions but has no separately specified activation command.

The owner considered these semantics before implementation:

1. **Publish-and-activate atomically (recommended).** `POST /v1/workspaces/{workspaceId}/data-mode-policy/versions` creates one immutable version and compare-and-swaps it into the DSO current-policy aggregate in the same PostgreSQL transaction that compare-and-swaps the IAM Workspace projection and increments the workspace authorization epoch. A version that is not activated is not published. This matches the existing endpoint and the workspace-creation flow.
2. **Publish candidate, activate separately.** Publishing creates an inactive candidate; a new activation command moves the current pointer later. This requires a candidate lifecycle, a new permission/API, separate audit semantics, and explicit abandoned-candidate retention that the accepted specifications do not currently define.

Option 1 is approved. Every successful data-mode activation increments `WorkspaceIdentity.authorizationEpoch` exactly once. A stale expected DSO aggregate revision, expected current version, IAM policy projection, or IAM authorization epoch rejects the entire transaction with no new version, pointer, projection, epoch, or audit side effect.

## Global constraints

- The activation decision and Task 1 specification amendment are approved; implementation must preserve them exactly.
- DSO is the only authority for the complete policy matrix and current DSO aggregate. IAM's mode is a content-safe projection and cannot independently authorize routing.
- Root composition may call feature public ports and open one shared transaction; it must not query DSO or IAM tables directly.
- Every lookup and mutation binds exact `organizationId` plus `workspaceId`; policy/version IDs never prove ancestry.
- The route authority returns `undefined` on absence, malformed persisted state, scope mismatch, current-pointer mismatch, hash mismatch, projection mismatch, stale epoch, or persistence error.
- `LOCAL` and Local input metadata can never select CLOUD, even while a transition is pending or partially restored.
- No path, URL, object bytes, source values, credentials, or local device handles enter policy pointers, route decisions, logs, or errors.
- Use additive migration `20260814090000_dso_workspace_policy_authority`, after `20260814080000_dso_execution_route_decisions`. If that ID exists at execution time, stop and allocate the next reviewed timestamp rather than overwrite it.
- Preserve unrelated dirty work. Do not touch IAE upload/storage, JRA workers, Web, OIDC, packages, or lockfiles. Do not stage or commit in the shared production worktree.

## File and responsibility map

| Area | Files | Responsibility |
|---|---|---|
| Specification | `docs/specs/foundation/devices-sync-offline.md`, `docs/specs/foundation/identity-workspaces-permissions.md`, `docs/specs/requirement-index.json` | Approve publish/activation semantics, CAS inputs, exact current authority, projection-only IAM role, and epoch increment. |
| DSO aggregate and ports | `services/api/src/features/dso/application/workspace-data-mode-policy*.ts`, `data-mode-policy-version-lookup.port.ts` | Own current DSO pointer, activation CAS participant, and exact full-scope version reads. |
| DSO persistence | `services/api/src/features/dso/adapter/{in-memory,prisma}-workspace-data-mode-policy*.ts`, `prisma-data-mode-policy-version-lookup.adapter.ts` | Full-ancestry reads and immutable/CAS writes without IAM persistence access. |
| IAM projection ports | `services/api/src/features/iam/application/workspace-execution-policy-reference*.ts` | Scope-only current reference/epoch read and an activation transaction participant; no DSO matrix evaluation. |
| IAM persistence | `services/api/src/features/iam/adapter/{in-memory,prisma}-workspace-execution-policy-reference*.ts` | Full-scope projection CAS and live epoch read. |
| Root composition | `services/api/src/platform/dso-workspace-policy.composition.ts`, `services/api/src/app.module.ts` | Open the shared transaction through participant factories and compose the fail-closed route policy authority. |
| Database | `services/api/prisma/schema/dso.prisma`, `services/api/prisma/schema/iam.prisma`, additive migration | Store DSO current aggregate and IAM projection with tenant-exact constraints. |
| Verification | focused DSO, IAM, root, production-composition, migration, and foundation tests | Prove CAS, rollback, Local denial, stale-state denial, and tenant isolation. |

---

### Task 1: Approve and record activation semantics

**Primary requirements:** DSO-018, DSO-026, DSO-027; IAM-012, IAM-019

**Files:**

- Modify: `docs/specs/foundation/devices-sync-offline.md`
- Modify: `docs/specs/foundation/identity-workspaces-permissions.md`
- Modify: `docs/specs/requirement-index.json`
- Modify: `docs/plans/050-devices-sync-offline.md`

**Produces:** An approved statement that policy publication is either atomic activation or a separately defined lifecycle. For recommended option 1, record all of the following without weakening DSO-018:

```text
Publishing a WorkspaceDataModePolicyVersion is its activation command. The command supplies the
expected DSO policy aggregate revision/current version and expected IAM Workspace authorization
epoch/current policy projection. One server transaction creates the immutable version, advances the
DSO current pointer, updates the IAM content-safe projection, increments the workspace authorization
epoch exactly once, and appends the required audit/outbox records. Any stale or mismatched binding
rolls back every effect. Reads fail closed while DSO and IAM current bindings do not match.
```

- [ ] Add this activation rule beside the Workspace policy domain model and REST endpoint.
- [ ] Clarify that the complete policy matrix and canonical hash remain DSO-owned while IAM records only IDs, mode projection, and the live epoch.
- [ ] Clarify that restrictive and permissive transitions both require DSO-018 authority, recent MFA, audit, and the applicable migration/purge workflow before the activation transaction.
- [ ] Update the requirement index text only through the repository's normal spec-index generation/check workflow; never hand-edit a generated mismatch.
- [ ] Run the documentation and requirement-index checks named by `docs/development/` and verify DSO-018/026/027 and IAM-012/019 remain indexed once.

Stop after this task if the owner selects option 2; write a separate approved lifecycle plan before any persistence or API work.

---

### Task 2: Define public exact-scope authority ports

**Primary requirements:** DSO-024, DSO-026, DSO-027; IAM-003, IAM-019

**Files:**

- Create: `services/api/src/features/dso/application/data-mode-policy-version-lookup.port.ts`
- Create: `services/api/src/features/dso/application/workspace-data-mode-policy-authority.port.ts`
- Create: `services/api/src/features/iam/application/workspace-execution-policy-reference.port.ts`
- Test: `services/api/test/features/dso/workspace-data-mode-policy-authority.port.test.ts`
- Test: `services/api/test/features/iam/workspace-execution-policy-reference.port.test.ts`

**Interfaces:**

```ts
interface WorkspaceScopeV1 {
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
}

interface DataModePolicyVersionLookupPortV1 {
  findExact(input: WorkspaceScopeV1 & {
    readonly policyId: StableIdentifierV1;
    readonly policyVersionId: StableIdentifierV1;
  }): Promise<DataModePolicyVersionV1 | undefined>;
}

interface CurrentWorkspaceDataModePolicyV1 {
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly policyId: StableIdentifierV1;
  readonly currentPolicyVersionId: StableIdentifierV1;
  readonly currentPolicyVersionHash: string;
  readonly aggregateRevision: number;
}

interface WorkspaceDataModePolicyAuthorityPortV1 {
  resolveCurrent(input: WorkspaceScopeV1): Promise<CurrentWorkspaceDataModePolicyV1 | undefined>;
}

interface WorkspaceExecutionPolicyReferenceV1 {
  readonly organizationId: StableIdentifierV1;
  readonly workspaceId: StableIdentifierV1;
  readonly dataModePolicyId: StableIdentifierV1;
  readonly currentDataModePolicyVersionId: StableIdentifierV1;
  readonly dataModeProjection: 'LOCAL' | 'HYBRID' | 'CLOUD';
  readonly authorizationEpoch: number;
}

interface WorkspaceExecutionPolicyReferenceAuthorityPortV1 {
  resolveExact(input: WorkspaceScopeV1): Promise<WorkspaceExecutionPolicyReferenceV1 | undefined>;
}
```

- [ ] Write failing parser/contract tests for valid exact records and malformed IDs, hash, revision, mode, and epoch.
- [ ] Verify RED because the ports and validated records do not exist.
- [ ] Implement immutable validated result constructors and scope-only ports. They must not accept an actor-bearing request context or a caller-provided epoch.
- [ ] Run the focused tests and verify GREEN.

---

### Task 3: Add tenant-exact durable current pointers

**Primary requirements:** DSO-026, DSO-027; IAM-019

**Files:**

- Modify: `services/api/prisma/schema/dso.prisma`
- Modify: `services/api/prisma/schema/iam.prisma`
- Create: `services/api/prisma/migrations/20260814090000_dso_workspace_policy_authority/migration.sql`
- Test: `services/api/test/features/dso/workspace-policy-authority-migration.test.ts`
- Modify: `services/api/test/prisma-foundation.test.mjs`

**Schema:**

- DSO `WorkspaceDataModePolicyRecord`: `id`, `organizationId`, `workspaceId`, `currentVersionId`, `currentVersionHash`, `revision`, `createdAt`, `updatedAt`; unique full-scope workspace and policy keys; composite reference proving the current version has the same organization/workspace/policy.
- IAM `WorkspaceIdentity`: nullable migration-stage `dataModePolicyId`, `currentDataModePolicyVersionId`, and `dataModeProjection`, promoted to required only after every existing active Workspace has one unambiguous DSO binding.
- No matrix, classification rule, placement list, executor list, or destination list is copied into IAM.

- [ ] Write the migration test first for full-scope keys, valid projection enum, positive revisions/epoch, immutable policy versions, CAS-supporting indexes, and cross-tenant rejection.
- [ ] Verify RED because the aggregate and IAM columns are absent.
- [ ] Add the Prisma models and additive SQL. Backfill only an unambiguous existing policy chain for the same organization/workspace; abort the migration on zero or multiple candidate policy aggregates rather than choosing maximum revision.
- [ ] Add constraints only after successful backfill. The down section may remove the new pointer/projection structures but must not delete immutable versions, route decisions, or audit history.
- [ ] Run the migration test, Prisma validate/format check, and foundation migration inventory.

---

### Task 4: Implement exact DSO and IAM adapters

**Primary requirements:** DSO-026, DSO-027; IAM-019

**Files:**

- Create: `services/api/src/features/dso/adapter/in-memory-workspace-data-mode-policy.adapter.ts`
- Create: `services/api/src/features/dso/adapter/prisma-workspace-data-mode-policy.adapter.ts`
- Create: `services/api/src/features/dso/adapter/prisma-data-mode-policy-version-lookup.adapter.ts`
- Create: `services/api/src/features/iam/adapter/in-memory-workspace-execution-policy-reference.adapter.ts`
- Create: `services/api/src/features/iam/adapter/prisma-workspace-execution-policy-reference.adapter.ts`
- Test: `services/api/test/features/dso/prisma-workspace-data-mode-policy.adapter.test.ts`
- Test: `services/api/test/features/iam/prisma-workspace-execution-policy-reference.adapter.test.ts`

- [ ] Write RED tests proving every query includes organization plus workspace and that sibling organization/workspace IDs return unavailable even when policy/version IDs collide.
- [ ] Add malformed-row tests proving adapters fail closed rather than normalize or infer persisted authority.
- [ ] Implement full-scope reads and CAS transaction participants. The DSO participant owns version creation/current-pointer advancement; the IAM participant owns projection replacement/epoch increment.
- [ ] Add idempotent replay tests: the same activation command returns the same committed binding; a different payload under the same idempotency key conflicts.
- [ ] Run both focused adapter suites and verify GREEN.

---

### Task 5: Compose atomic activation and fail-closed reads at root

**Primary requirements:** DSO-018, DSO-024, DSO-026, DSO-027; IAM-002, IAM-003, IAM-012, IAM-019

**Files:**

- Create: `services/api/src/platform/dso-workspace-policy.composition.ts`
- Modify: `services/api/src/app.module.ts`
- Modify narrowly: `services/api/src/features/dso/dso.module.ts`
- Modify narrowly: `services/api/src/features/iam/iam.module.ts`
- Test: `services/api/test/platform/dso-workspace-policy-root-composition.test.ts`

**Root read algorithm:**

1. Resolve the DSO current aggregate by exact organization/workspace.
2. Resolve IAM's exact scope-only reference and live epoch.
3. Require matching organization, workspace, policy ID, and current version ID.
4. Load the exact DSO version using all four identifiers.
5. Require its canonical hash to equal the DSO aggregate hash and its mode to equal IAM's projection.
6. Return `{policy, authorizationEpoch}`; catch any dependency error and return `undefined`.

**Activation transaction:** Root opens one shared Prisma transaction and invokes only feature-owned transaction participants. It performs no direct table read/write. The DSO participant compares expected aggregate revision/current version; the IAM participant compares expected policy projection and authorization epoch. Audit/outbox participants must succeed before commit.

- [ ] Write RED root tests for a valid binding and absent DSO aggregate, absent IAM reference, wrong tenant, stale DSO pointer, stale IAM pointer, stale hash, stale projection, stale epoch, malformed row, and dependency exception.
- [ ] Add a rollback test in which the IAM participant rejects after the DSO participant runs; assert no version, pointer, projection, epoch, or audit/outbox record commits.
- [ ] Implement the root adapter and activation coordinator without importing either feature's repository implementation into the other feature.
- [ ] Wire `ExecutionRouteWorkspacePolicyAuthorityPortV1` through AppModule only when all durable authorities are present; production remains fail closed otherwise.
- [ ] Run the focused root suite and verify GREEN.

---

### Task 6: Prove route and production behavior

**Primary requirements:** DSO-024, DSO-026, DSO-027; IAM-003, IAM-019, IAM-020

**Files:**

- Extend: `services/api/test/features/dso/execution-route.service.test.ts`
- Extend: `services/api/test/features/dso/execution-route.module.test.ts`
- Extend: `services/api/test/platform/production-database-composition.test.ts`
- Test: `services/api/test/platform/dso-execution-route-production-composition.test.ts`

- [ ] Write RED tests through the actual AppModule/DsoModule provider graph proving Local policy and Local input cannot cloud-route.
- [ ] Prove a previously accepted decision fails after policy pointer/hash, IAM projection, or authorization epoch changes.
- [ ] Prove subject hash changes, sibling tenant IDs, missing durable delegates, and restored partial bindings all fail closed.
- [ ] Prove a DEVICE route remains possible only when its exact policy, epoch, subject, placement, and capabilities remain current.
- [ ] Run focused compiled tests, API test compile, API typecheck, scoped lint, Prisma validate, foundation/migration tests, `git diff --check`, and the full API suite if concurrent RED work is not present.
- [ ] Report production readiness only with the approved Task 1 authority text, green migration evidence, and actual root-composition tests. Mocks alone are insufficient.

## Rollback and failure behavior

- Before activation release, the route authority remains unavailable and all cloud routing fails closed.
- A failed activation transaction leaves the old DSO pointer, IAM projection, and epoch current; the new immutable version is not published under recommended option 1.
- A restore or partial deployment that exposes mismatched DSO/IAM bindings disables route admission until reconciliation; it never selects the highest version.
- Rollback removes root composition first, returning to fail-closed routing, before compensating schema changes. Immutable policy versions, route decisions, audit records, and outbox evidence are retained.

## Intentionally deferred

- Signed offline DataModePolicyManifest issuance/verification beyond the exact current-policy authority prerequisite.
- Data migration and verified cloud-purge workflow implementation required by DSO-018.
- JRA consumption of route decisions and any worker dispatch changes.
- Public Web/Desktop/Android settings UI for data-mode transitions.
- IAE placement or object-storage behavior.

## Self-review

- **Spec coverage:** Every task links DSO-018/024/026/027 or IAM-002/003/012/019/020; current authority, epoch, tenant scope, activation concurrency, Local denial, and rollback are covered.
- **Boundary check:** Feature modules expose public ports; root composes them; no feature reads another feature's persistence.
- **Failure check:** No latest-revision inference, actor fabrication, partial activation authorization, or permissive fallback exists.
- **Execution gate:** Task 1 semantics are approved; implementation remains gated by the listed TDD and verification steps.
