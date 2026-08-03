# Luna Max Complete Implementation Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` when delegation is explicitly authorized, or `superpowers:executing-plans` for inline delivery. Execute one orchestration task at a time and preserve the checkbox and handoff state in the authoritative records.

**Goal:** Give Luna Max a deterministic, resumable route from the current foundation checkpoint through all 611 DataBreeze requirements, grouped into reviewable promotion batches that preserve atomic rollback commits.

**Architecture:** `002-complete-execution-orchestration.md` owns the 155-task execution catalog and dependency graph; the numbered child plans own requirement scope; `requirement-traceability.json` owns requirement status and evidence. This plan packages every unfinished task into dependency-safe delivery batches, assigns shared-file ownership, fixes the Git/CodeRabbit flow, and provides the exact first-session bootstrap.

**Tech Stack:** pnpm/Turborepo, strict TypeScript, NestJS/Fastify, Prisma/PostgreSQL 17, Redis 7.4, S3-compatible storage, Electron, Kotlin/Compose, Python 3.13, OpenAPI/JSON Schema, OpenTofu/AWS Singapore, GitHub Actions, and CodeRabbit.

## Global Constraints

- Work only in the canonical `databreeze-platform` repository. The legacy repositories are reference-only.
- Preserve the DataBreeze name and checksum-pinned logo sources without redrawing, recoloring, or adding duplicate wordmarks.
- PostgreSQL is authoritative; Redis is disposable. Local, Hybrid, and Cloud data-mode rules fail closed.
- Every durable operation is tenant-scoped, revision-aware, idempotent, auditable, and recoverable. Immutable records are corrected with successor versions or compensating entries.
- Workers, Desktop, and Android accept signed typed actions and scoped handles only; they never receive arbitrary commands, unrestricted paths, or database credentials.
- Vietnamese is the complete default locale and English is complete for every delivered client slice.
- Requirement status is evidence-based: merged code is not automatically `verified` or `released`.
- Normal feature PR slices contain 30–50 commits. If an atomic task crosses 50, finish that task and split immediately; the exceptional ceiling is 79, preserving margin below CodeRabbit's 100-commit limit. Empty, padding, or artificially split commits are forbidden.
- Feature/fix PRs target `dev` without CodeRabbit. The corresponding `dev` to `main` promotion receives exactly one full CodeRabbit review after hosted checks are otherwise ready.
- Keep the promotion diff at or below 260 changed files, leaving safety margin under the 280-file review stop gate.
- Never run package-manager commands concurrently in the same worktree. `pnpm install`, checks, tests, and builds share `node_modules` and execute sequentially there.

---

## 1. Verified starting checkpoint

This checkpoint was reconciled on 2026-08-02 after the latest promotion:

| Item | Verified value |
|---|---|
| Integration branch | `origin/dev` at `783a4710c0aa2a2808d78ad7f0643e6731150bd7` |
| Stable branch | `origin/main` at `3ed3d77d0281ef239d0509c81ded447d8fffd213` |
| Last normal feature PR | PR #19, 73 commits, `feat/fnd003-local-infra-batch` to `dev` |
| Last promotion PR | PR #20, `dev` to `main` |
| Promotion review fixes | PRs #21, #22, and #23 back to `dev` |
| Open PRs observed | None |
| Requirement ledger | 611 total: 565 `planned`, 46 `partial`, 0 `verified` |
| Next orchestration task | `FND-003` |
| Active delivery batch | `B01` |

`FND-001` and `FND-002` have verified task evidence. `FND-003` through `FND-007` contain substantial merged implementation, but live Docker, OpenTofu, protected-environment, and final clean-checkout evidence remain conservative gates. Plans 020 through 050 also contain merged code that must be reconciled before any missing behavior is implemented. Do not recreate those foundations blindly.

## 2. Authority and state ownership

Read and apply these files in this order after `AGENTS.md`, accepted ADRs, and specifications:

1. `docs/plans/README.md`
2. The selected numbered child plan for requirement ownership and release obligations
3. `docs/plans/002-complete-execution-orchestration.md` for task and repository-path authority
4. This plan for delivery-batch ownership
5. `docs/plans/execution-orchestration.json` for live machine state
6. `docs/plans/003-luna-handoff-runbook.md` for resume and Git/PR procedure
7. The selected requirement records in `docs/plans/requirement-traceability.json`

The Markdown files explain intent; the fetched Git graph and PR state decide what exists. If the machine ledger and Git disagree, stop feature mutation, reconcile the ledger in a focused commit, run the orchestration checker, and then resume.

Some early child plans contain generic aggregate `Paths` examples. Do not create those directories. The module-owned API/Prisma/client/engine paths and deterministic Android/Python keys in Section 4 of `002-complete-execution-orchestration.md` supersede those examples.

## 3. Delivery-batch map

Each batch may require multiple normal integration PR slices before its exit gate passes. Every slice is followed by its own promotion PR. Commit ranges are review budgets, not quotas. If a coherent slice finishes below 30 commits, keep the branch open and continue the next compatible task; do not create padding merely to reset the counter.

| Batch | Branch | Tasks | Dependencies | Commit budget | Exit gate |
|---|---|---|---|---|---|
| `B01` | `feat/foundation-identity-reconciliation` | `FND-003..007`, all Plan 020 tasks | Verified `FND-001/002` | 30–50 target; exceptional ceiling 79 | Foundation external gates recorded; IAM/AUD/BUA obligations reconciled and completed |
| `B02` | `feat/artifacts-datasets-completion` | All Plan 030 tasks | `B01` | 30–50 target; exceptional ceiling 79 | Immutable artifact/evidence/dataset foundations verified |
| `B03` | `feat/jobs-processing-completion` | All Plan 040 tasks | `B02` | 30–50 target; exceptional ceiling 79 | Signed typed jobs execute locally/cloud with approvals and durable recovery |
| `B04` | `feat/devices-sync-completion` | All Plan 050 tasks | `B03` | 30–50 target; exceptional ceiling 79 | Desktop/Android sync, offline, conflict, transfer, and revocation gates pass |
| `B05` | `feat/collaboration-integrations` | All Plan 060 tasks | `B04` | 30–50 target; exceptional ceiling 79 | Notifications, collaboration, public API, connectors, and webhooks pass |
| `B06` | `feat/dogfood-autopilot-core` | `DOG-001..007`, `FA-001..003` | `B05` | 30–50 target; exceptional ceiling 79 | Ten-condition dogfood record accepted; safe Autopilot intake/routing exists |
| `B07` | `feat/autopilot-spreadsheet-auditor` | `FA-004..007`, `SA-001..007` | `B06` | 30–50 target; exceptional ceiling 79 | Folder Autopilot and Spreadsheet Auditor P0/P1 gates pass |
| `B08` | `feat/quote-invoice-intelligence` | `QI-001..007`, then `ILD-001..007` | `B06` | 30–50 target; exceptional ceiling 79 | Quote Intelligence and Invoice Leak Detector P0/P1 gates pass |
| `B09` | `feat/operations-capture` | `OC-001..008` | `B06` | 30–50 target; exceptional ceiling 79 | Offline native capture, immutable submission, supervision, and reconciliation pass |
| `B10` | `feat/client-report-factory` | `CRF-001..007` | `B07`, `B08` | 30–50 target; exceptional ceiling 79 | Evidence-linked multi-format reports and revocable sharing pass |
| `B11` | `feat/private-data-analyst` | `PDA-001..008` | `B09`, `B10` | 30–50 target; exceptional ceiling 79 | Deterministic governed analysis and optional-AI boundaries pass |
| `B12` | `feat/migration-quality-suite` | `MR-001..007`, then `DQG-001..008` | `B08`, `B11` | 30–50 target; exceptional ceiling 79 | Migration Ready and Data Quality Guard P0/P1 gates pass |
| `B13` | `feat/embedded-importer` | `EI-001..007` | `B05` | 30–50 target; exceptional ceiling 79 | Hosted importer and outbound-only local gateway pass hostile tests |
| `B14` | `feat/production-readiness` | `GA-001..012` | `B12`, `B13` | 30–50 target; exceptional ceiling 79 | Every P0/P1 requirement is verified and coordinated GA is released |
| `B15` | `feat/post-ga-extensions` | `P2-001..004` | `B14` | 30–50 target; exceptional ceiling 79 | All 13 P2 requirements are opt-in, revocable, and verified |

The machine-readable `deliveryBatches` array is authoritative for exact task membership. Its checker rejects missing or duplicate task ownership, dependency cycles, a PR-slice minimum below 30, an exceptional maximum above 79, and an active batch that does not contain `nextTaskId`.

## 4. Parallel execution and integration ownership

The foundation spine `B01` through `B06` is serial. After `B06`, `B07`, `B08`, and `B09` may run in separate worktrees. `B13` may start after `B05` and proceed alongside `B06` through `B12`. All other dependencies in the table remain hard gates.

Before parallel work begins, the integration owner records:

- the exact `origin/dev` base for every branch;
- one migration timestamp range per branch;
- canonical schema namespaces owned by that branch;
- feature-directory ownership for API, Web, Desktop, Android, and engine;
- the merge order and the person/model responsible for generated aggregate conflicts.

Only the integration owner edits shared aggregators during a parallel merge: `services/api/src/app.module.ts`, generated OpenAPI aggregates, Prisma aggregate configuration, package export maps, root Web route registration, root localization catalogs, `requirement-traceability.json`, and `execution-orchestration.json`. Feature workers modify module-owned canonical sources and tests. After each merge, the integration owner regenerates contracts and reruns drift checks before the next branch merges.

Recommended merge queue after the parallel wave is `B13`, `B07`, `B08`, `B09`, `B10`, `B11`, `B12`. Completion time may differ; dependency and shared-file safety decide merge order, not which worker finishes first.

## 5. Atomic task recipe

For every `#### TASK-ID —` entry in `002-complete-execution-orchestration.md`, Luna performs this exact cycle:

- [ ] Read the owning requirements, accepted ADRs, current implementation, and existing tests. Record which obligations already exist and which remain.
- [ ] Reserve canonical schema names and migration ordering before editing shared interfaces.
- [ ] Write the failing contract, domain, policy, state-machine, or repository test that proves the missing behavior. Run it and confirm the expected failure.
- [ ] Add the smallest domain/application implementation needed for that test. Re-run the narrow test.
- [ ] When durable state changes, add the ordered migration and real PostgreSQL tests for tenant scope, transactions, concurrency, idempotency, and compensating rollback.
- [ ] Add adapters and only the platform surfaces owned by the task. Use generated contracts at every client/worker boundary.
- [ ] Add negative privacy/security tests, bounded failure behavior, content-safe telemetry, recovery, and rollback notes.
- [ ] Run the owning package tests, contract drift, `corepack pnpm repo:check`, `corepack pnpm repo:build`, and `git diff --check` sequentially.
- [ ] Update only the trace records supported by exact code, test, and evidence paths. Update task and batch state using immutable commit hashes.
- [ ] Commit one independently reversible outcome and push at the stable task boundary.

Typical reversible commits inside a task are: canonical contract, domain behavior, migration/repository, adapter/API, client vertical slice, and verification/evidence. Omit a category that genuinely does not apply and record why; never create padding commits.

## 6. PR and promotion algorithm

1. Count commits and changed files against the batch base before opening anything.
2. Do not open the normal PR below 30 commits. At 30–50 commits, finish the current atomic task and prepare the PR. At 50, stop accepting new tasks and split at the next completed-task boundary. An exceptional boundary must never exceed 79 commits.
3. If the branch exceeds 260 changed files, split at a completed task boundary before review. Do not split a migration from its code/tests or a canonical schema from generated consumers.
4. Open `feat/*` or `fix/*` to `dev`. Run hosted checks and merge with a merge commit that preserves atomic commits. Do not invoke CodeRabbit.
5. Immediately open `dev` to `main`. When otherwise ready, request one full CodeRabbit review and record the invocation.
6. Reproduce every comment against the exact reviewed commit. Fix valid findings through focused commits merged back to `dev`; document rejected findings with tests or authoritative references. Do not request another review.
7. Merge the promotion only after required checks are green and all valid findings are resolved. Fetch both branches, record merge hashes, and activate the next dependency-ready batch.

Focused promotion-gate fixes may use a smaller PR to `dev` because they close an already-reviewed promotion. They do not reset or weaken the next normal batch’s 30-commit minimum.

## 7. First Luna Max session

The active B01 PR slice is `feat/foundation-identity-reconciliation`, based on the fetched `origin/dev` merge checkpoint. Continue B01 through additional branches after each 30–50 commit slice; do not claim the batch complete until its exit gate passes.

Run these commands sequentially:

```powershell
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
git rev-parse origin/dev
git rev-parse origin/main
gh pr list --state open --limit 100 --json number,title,headRefName,baseRefName,isDraft,statusCheckRollup,url
corepack pnpm install --frozen-lockfile
corepack pnpm orchestration:check
corepack pnpm requirements:check
```

Then resume `FND-003`:

1. Run the Docker-capable checks in `docs/operations/foundation-local-infrastructure-2026-08-02.md` when Docker Desktop/Compose v2 is available.
2. If Docker remains unavailable, preserve `FND-003` as incomplete, finish only credential-independent `FND-004..007` evidence, and record the external gate. Do not claim foundation verification.
3. Reconcile Plans 020–050 against merged code before implementing any missing behavior. For `B01`, complete Plan 020 only after the remaining foundation boundaries are explicit.
4. End every session with the handoff record from `003-luna-handoff-runbook.md`, including exact branch/HEAD, open PRs, checks, task/batch status, rollback points, and safest next command.

## 8. Completion and stop rules

The program is complete only when `GA-012` is released and all P0/P1 requirements are `released`; `B15` completes the separately authorized P2 scope. A plan file, UI mock, green unit test, or merged PR is not product completion.

Stop without widening scope when specs conflict, customer/user changes overlap, a migration risks unrecoverable data, a security/privacy boundary cannot fail closed, signing or production authority is missing, or a required test remains nondeterministic after diagnosis. Preserve the branch, commits, evidence, and exact smallest decision needed. Never reset, delete, force-push, or silently downgrade a gate to keep the schedule moving.
