# Implementation Plans

Implementation starts only after the applicable product, architecture, foundation, platform, feature specification, ADR, and child plan are approved.

Every plan must name requirement IDs, exact repository paths and interfaces, a vertical test-first sequence, migrations and rollback, security/failure/telemetry behavior, release evidence, and intentionally deferred scope. A plan never weakens tenant isolation, authorization, evidence, data mode, retention, approval, usage, audit, or client/worker trust boundaries.

## Current V1 authority

DataBreeze V1 is the Data-to-Dashboard Agent. Use these authorities in order:

Agent entry point: [`CURSOR-HANDOFF.md`](CURSOR-HANDOFF.md) contains the self-contained product context, current repository reality, and copy/paste master prompt. It links to, but does not replace, the authorities below.

1. [`000-platform-program.md`](000-platform-program.md) — stable program and release policy.
2. [`080-data-to-dashboard-program.md`](080-data-to-dashboard-program.md) — approved V1 dependency graph, OpenAI/AWS provider boundary, complete task-gated program, ownership locks, dispatch packets, production sequence, and stop conditions.
3. [`data-to-dashboard-orchestration.json`](data-to-dashboard-orchestration.json) — machine-readable gates, dependencies, work packages, branches, requirements, writable ownership, checks, and next-work pointer.
4. [`requirement-traceability.json`](requirement-traceability.json) — 662 unique requirement assignments: P0 490, P1 158, P2 14.
5. Child plans `081` through `087` — the executable contract, product-lane, integration, parity, and evidence tasks.

Dependency order:

1. `081-dda-contracts-and-authorities.md`
2. After `081` is green, run `082-dda-cloud-intake-etl.md`, `083-dda-analyst-dashboard-canvas.md`, `084-dda-materialization-refresh.md`, `085-dda-desktop-hybrid-folders.md`, and `086-dda-android-receipts.md` in isolated parallel worktrees.
3. `087-dda-integration-readiness.md`
4. `400-production-readiness.md` before any production claim or release.

Run `corepack pnpm orchestration:check` before dispatch, handoff, or integration. The DDA checker confirms all 51 DDA requirements, plan/task references, dependency acyclicity, and non-overlapping parallel write ownership.

## Preserved foundation and historical plans

Plans `010` through `060` remain authoritative for already delivered or unfinished shared foundation evidence. Plans `001` through `004` and `execution-orchestration.json` preserve the pre-pivot ten-module execution history and continue to validate its 611-requirement partition; they are not the dispatch authority for DDA V1.

Plans `070`, `100`-`320`, and `500` describe the former dogfood sequence and specialist extensions. Their stable requirement IDs remain valid for each capability's eventual release, but those plans are post-V1 unless an approved change explicitly promotes a slice. Do not dispatch them merely because their legacy ledger has an active pointer.

Git and fetched pull-request state override historical checkpoint hashes. Requirement records become verified only after exact evidence paths exist and linked tests pass.
