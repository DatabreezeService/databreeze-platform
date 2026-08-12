# Implementation Plans

Implementation starts only after the applicable product, architecture, foundation, platform, feature specification, ADR, and child plan are approved.

Every plan must name requirement IDs, exact repository paths and interfaces, a vertical test-first sequence, migrations and rollback, security/failure/telemetry behavior, release evidence, and intentionally deferred scope. A plan never weakens tenant isolation, authorization, evidence, data mode, retention, approval, usage, audit, or client/worker trust boundaries.

## Current V1 authority

DataBreeze V1 is the Data-to-Dashboard Agent. Use these authorities in order:

Agent entry point: [`CURSOR-HANDOFF.md`](CURSOR-HANDOFF.md) contains the self-contained product context, current repository reality, and copy/paste master prompt. It links to, but does not replace, the authorities below.

Product-owner entry point: [`MANUAL-PREREQUISITES.md`](MANUAL-PREREQUISITES.md) centralizes external accounts, credentials, signing, legal/privacy, test-data, operational, budget, and approval actions that an implementation agent cannot fabricate. Applicable unchecked items block production approval.

Current implementation resume: [`402-dda-code-first-completion.md`](402-dda-code-first-completion.md) starts from the integrated `codex/dda-400-production` branch, finishes all agent-only product and hardening work first, and defers only live provider/cloud/signing/store/legal/release evidence.

Focused OpenAI development validation: [`403-openai-development-validation.md`](403-openai-development-validation.md) is the approved subplan for completing the server-only receipt, mapping, analyst, narrative, and dashboard-proposal adapters and running a request-capped synthetic live evaluation without exposing a key. It may start only after plan 402 Tasks 1-3 are green and never changes the production gate.

Dashboard workspace redesign: [`404-dashboard-workspace-redesign-design.md`](404-dashboard-workspace-redesign-design.md) records the approved Vietnamese-first canvas and dashboard-local agent experience. [`405-dashboard-workspace-redesign-implementation.md`](405-dashboard-workspace-redesign-implementation.md) is the executable requirement-linked plan for its contracts, scoped APIs, immutable authoring commands, premium Web shell, responsive chart canvas, agent proposal picker, and verification.

Unified workspace transition: [`406-unified-data-workspace-implementation.md`](406-unified-data-workspace-implementation.md) is the proposed master delta plan for the approved unified Web, Desktop, and Android experience. Its canonical specification and execution-authority gates must complete before conflicting product code begins; it reuses plans 402 and 405 rather than rebuilding their DDA and dashboard work.

1. [`000-platform-program.md`](000-platform-program.md) — stable program and release policy.
2. [`080-data-to-dashboard-program.md`](080-data-to-dashboard-program.md) — approved V1 dependency graph, OpenAI/AWS provider boundary, complete task-gated program, ownership locks, dispatch packets, production sequence, and stop conditions.
3. [`data-to-dashboard-orchestration.json`](data-to-dashboard-orchestration.json) — machine-readable gates, dependencies, work packages, branches, requirements, writable ownership, checks, and next-work pointer.
4. [`requirement-traceability.json`](requirement-traceability.json) — 662 unique requirement assignments: P0 490, P1 158, P2 14.
5. Child plans `081` through `087` — the executable contract, product-lane, integration, parity, and evidence tasks.

Dependency order:

1. `081-dda-contracts-and-authorities.md`
2. After `081` is green, run `082-dda-cloud-intake-etl.md`, `083-dda-analyst-dashboard-canvas.md`, `084-dda-materialization-refresh.md`, `085-dda-desktop-hybrid-folders.md`, and `086-dda-android-receipts.md` in isolated parallel worktrees.
3. `087-dda-integration-readiness.md`
4. `401-dda-production-readiness.md` (DDA production/G5) and code-first resume `402-dda-code-first-completion.md` before any production claim or release. Legacy WEB production control remains `400-production-readiness.md`.

Run `corepack pnpm orchestration:check` before dispatch, handoff, or integration. The DDA checker confirms all 51 DDA requirements, plan/task references, dependency acyclicity, and non-overlapping parallel write ownership.

## Preserved foundation and historical plans

Plans `010` through `060` remain authoritative for already delivered or unfinished shared foundation evidence. Plans `001` through `004` and `execution-orchestration.json` preserve the pre-pivot ten-module execution history and continue to validate its 611-requirement partition; they are not the dispatch authority for DDA V1.

Plans `070`, `100`-`320`, and `500` describe the former dogfood sequence and specialist extensions. Their stable requirement IDs remain valid for each capability's eventual release, but those plans are post-V1 unless an approved change explicitly promotes a slice. Do not dispatch them merely because their legacy ledger has an active pointer.

Git and fetched pull-request state override historical checkpoint hashes. Requirement records become verified only after exact evidence paths exist and linked tests pass.
