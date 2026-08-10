# Cursor Handoff — DataBreeze Data-to-Dashboard V1

**Status:** Current implementation handoff<br>
**Prepared:** 2026-08-10<br>
**Planning baseline:** `codex/dda-400-production` at commit `480eb8b` or a descendant<br>
**Immediate work package:** [`402-dda-code-first-completion.md`](402-dda-code-first-completion.md)<br>
**Owner-prioritized OpenAI subplan:** [`403-openai-development-validation.md`](403-openai-development-validation.md), after plan 402 Tasks 1-3<br>
**Overall mission:** Implement the complete post-pivot DataBreeze V1 described below and in plans `080` through `087`.

This file is a self-contained entry point for Cursor or another coding agent. It does not replace the canonical specification or approved plans; it tells the agent what the user meant, what the repository actually contains, what to read, and how to begin without confusing old placeholder surfaces with completed product behavior.

## Current Cursor resume prompt

```text
Resume DataBreeze from branch codex/dda-400-production at 480eb8b or a descendant. Preserve all existing commits and untracked .superpowers/sdd/400-production-readiness reports. Do not restart plans 081-087: their G1-G4 implementation is already integrated.

Read AGENTS.md, docs/README.md, docs/plans/CURSOR-HANDOFF.md, docs/plans/402-dda-code-first-completion.md, docs/plans/403-openai-development-validation.md, docs/specs/features/data-to-dashboard-agent.md, ADR-0004/0005, the orchestration ledger, and the production gate matrix. Execute plan 402 Tasks 1-3 in order with TDD and focused commits. The owner has prioritized OpenAI development validation next: execute plan 403 using offline tests first and use its pinned cheap development baseline `gpt-4o-mini-2024-07-18` with image detail `high`; do not silently select a more expensive model. Never ask for or accept the key in chat. When plan 403 Tasks 1-4 are green, stop only for the owner to run the request-capped synthetic live command manually; consume the sanitized aggregate report, not the secret. Then resume the next unfinished task in plan 402 and reuse plan-403 evidence when reaching Task 8.

Do not fabricate credentials or approvals. Do not hand-build cloud infrastructure in a console. The early development key is not a production credential and does not satisfy G5. When tasks 1-11 pass from a clean checkout, generate the owner activation packet and stop at Task 12 only for the exact remaining external actions. Keep productionReady false and G5 blocked until all live production evidence and owner approval exist.
```

## Original program prompt (historical after G4; do not restart it)

```text
You are the implementation coordinator for DataBreeze V1 in the databreeze-platform repository.

Your single overall assignment is to implement the complete production-gated Data-to-Dashboard Agent across Web, Windows Desktop, Android, the NestJS API, the Python engine, OpenAI provider adapters, and AWS deployment/readiness. Treat plans 081-087 and applicable plan 400 gates as one dependency-ordered program. Begin with docs/plans/081-dda-contracts-and-authorities.md; do not start downstream lanes until its contract gate is freshly verified and committed. After each gate passes, continue to the next dependency-safe tasks without waiting for an hourly checkpoint. Stop only for a declared stop condition, missing external authority/credential, or a decision that would change the accepted specification.

Before editing anything:
1. Read AGENTS.md and docs/README.md.
2. Read docs/plans/CURSOR-HANDOFF.md completely.
3. Read docs/plans/MANUAL-PREREQUISITES.md and treat every applicable unchecked external-authority item as a production blocker, never as permission to fabricate a credential or approval.
4. Read docs/decisions/0004-data-to-dashboard-direction.md and docs/decisions/0005-openai-ai-ocr-on-aws-hosting.md.
5. Read docs/specs/features/data-to-dashboard-agent.md completely.
6. Read docs/plans/080-data-to-dashboard-program.md and docs/plans/data-to-dashboard-orchestration.json.
7. Read docs/plans/081-dda-contracts-and-authorities.md completely.
8. Run git status --short, git branch --show-current, corepack pnpm requirements:check, and corepack pnpm orchestration:check.

Important current reality:
- The plans and specifications are complete, but the new DDA implementation has not started on the planning baseline.
- All 51 DDA requirements are planned/not-verified.
- Do not interpret the existing ten-module Web/Desktop/Android workbench copy as implementation.
- Reuse the existing IAM, IAE, DSM, JRA, DSO, BUA, AUD, contract-generation, engine, and application-shell foundations through public contracts.
- JRA application services exist, but do not assume they are already exposed or composed as the DDA workflow requires.

Non-negotiable product intent:
- Vietnamese-first data-to-dashboard agent, with complete English support.
- Web is cloud-first: CSV/XLSX upload, visible ETL/data-quality review, analyst, editable dashboard canvas, publication, sharing, and refresh.
- Desktop is Local/Hybrid: the user explicitly selects an approved folder; actual paths stay local; new stable CSV/XLSX files are detected, reviewed/processed locally, and only approved projections synchronize.
- Android is cloud-connected initially: active receipt capture, encrypted staging, resumable upload, OCR review/correction, governed acceptance, dashboard viewing, and focused analysis. AWS Singapore hosts DataBreeze; the initial server-side OCR/AI implementation uses the OpenAI Responses API behind provider-neutral domain ports.
- ETL is visible and governed: show transformations, assumptions, before/after samples, changed/unchanged/rejected counts, exclusions, lineage, cost, and separate completeness/validity/uniqueness/consistency/freshness/extraction-confidence dimensions.
- Never claim “percentage correct” without ground truth.
- AI may propose typed plans, explanations, and canvas changes. It may not calculate authoritative numbers, execute arbitrary SQL/Python/JavaScript/shell, publish silently, broaden permissions, or transfer data across policy boundaries.
- Dashboards are interactive pages on an editable canvas, but ordinary views use permission-scoped materialized results and immutable complete snapshots to control cost.
- ON_CHANGE is the default refresh: accepted DatasetVersion event -> affected dependencies only -> idempotent materialization -> complete atomic snapshot -> content-safe client event. Preserve the last good snapshot on failure. MANUAL and SCHEDULED are also V1; genuine streaming is deferred.
- Execute the complete program by dependency-ordered tasks rather than an hourly schedule. A task is complete only when its requirement-linked evidence exists; fixture or fake behavior remains partial.

Engineering constraints:
- Follow test-driven changes and link tests to requirement IDs.
- Never weaken tenant isolation, authorization, evidence, data-mode, retention, audit, usage/admission, approval, idempotency, or recovery requirements.
- Feature modules use foundation public contracts and never read another feature’s persistence directly.
- Clients/workers consume generated contracts; never hand-edit generated TypeScript, Kotlin, or Python outputs.
- Originals and accepted versions are immutable. Rejections and unsupported scopes are counted and discoverable.
- OpenAI credentials remain server-side in AWS Secrets Manager. Receipt extraction uses egress/admission checks, strict structured output, `store: false`, tools disabled, versioned prompts/schemas/preprocessing, deterministic validation, and human review.
- Preserve unrelated work and never commit secrets, customer data, local paths, runtime artifacts, local databases, generated reports, or Office lock files.

Execution:
- Complete plan 081 first and record its commit hash, fixture hashes, requirement-linked tests, commands/results, migration/rollback notes, and contract decisions; then continue the same overall assignment with the dependency-safe lanes.
- After 081 is green, either continue sequentially or use isolated agents/worktrees for plans 082, 083, 084, 085, and 086. Respect the exact write ownership in data-to-dashboard-orchestration.json.
- Integrate in this order: 082, 084, 083, 085, 086; then execute 087.
- Do not mark a requirement partial/verified yourself unless you are the integration owner and exact evidence paths exist with fresh passing tests.
- Continue through applicable plan 401 production and staged-release gates (via plans 402/403); do not stop after the golden journey and call the program complete.

Stop and report instead of improvising if specifications conflict, a contract must change after downstream work begins, a lane needs another lane’s locked files, an action would weaken a security/data boundary, or completion needs unavailable external authority/provider credentials.

At every handoff report:
- Work package/task and requirement IDs
- Commit hash and exact changed files
- Fresh commands, exit codes, test counts, and skips
- Migrations and rollback behavior
- Security/data-mode/evidence implications
- Known limitations, fixture-only fakes, and production blockers
- Contract change requests or integration risks
- The next dependency-safe work package
```

## What the user asked for

The user deliberately replaced the original “ten products at once” direction with one coherent first product:

1. A data-to-dashboard agent with several ways to receive and store data.
2. An easier analyst for both cloud and local governed data.
3. An ETL/data-quality screen because uploaded data may be wrong, inconsistent, duplicated, incomplete, or ambiguous.
4. An agent that proposes a comprehensive interactive dashboard as both a page and an editable canvas.
5. A Desktop application where the user approves a folder, adds CSV/XLSX files over time, and lets the local agent recognize compatible updates.
6. A cloud-first Website and initially cloud-connected Android application, with AWS as the intended hosted environment.
7. Android receipt/document capture with OCR and explicit field-level review.
8. A cost-aware path from dashboard creation to update-after-new-data behavior: do not repeatedly query raw data for every viewer and do not poll every fifteen minutes without a trusted change.
9. Hybrid operation: Local/Hybrid Desktop plus cloud Web/mobile, with explicit user-controlled publication projections.
10. All of the above in one complete task-driven V1 program, including production-readiness and staged-release gates in the same assignment.

The ten earlier specialist modules remain later extensions. They are not the first-release implementation queue.

## Canonical reading order

Cursor must resolve ambiguity in this order:

1. `AGENTS.md`
2. `docs/README.md`
3. Accepted ADRs, especially `docs/decisions/0004-data-to-dashboard-direction.md` and `docs/decisions/0005-openai-ai-ocr-on-aws-hosting.md`
4. `docs/specs/features/data-to-dashboard-agent.md` (`DDA-001` through `DDA-051`)
5. Applicable foundation/platform specifications in `docs/specs/`
6. `docs/plans/000-platform-program.md`
7. `docs/plans/080-data-to-dashboard-program.md`
8. `docs/plans/data-to-dashboard-orchestration.json`
9. The active child plan from `081` through `087`
10. `docs/plans/401-dda-production-readiness.md`, `docs/plans/402-dda-code-first-completion.md`, and `docs/plans/MANUAL-PREREQUISITES.md` for production execution (legacy WEB control remains `400-production-readiness.md`)
11. `docs/plans/requirement-traceability.json`

If a plan conflicts with a specification, the specification wins and the ambiguity must be reported before implementation continues.

## Current repository reality

At the planning baseline:

- All 51 DDA requirements are `planned`, `not-verified`, and have no verified evidence paths.
- `DDA-081` is the only ready work package. Plans `082` through `087` are dependency-blocked.
- None of the 205 paths marked `Create` in plans `081` through `087` exists yet.
- No `services/api/src/features/dda/`, DDA Prisma schema, DDA JSON Schemas, Web dashboard/data-intake feature, materialization refresh service, Desktop folder binding/watcher, or Android receipt feature exists.
- The current Web/Desktop/Android product registries still display the original ten-module workbench. Those registries describe intended surfaces; they do not prove working DDA features.

Reusable, implemented foundations include:

- IAM identity, authentication, tenant scope, roles/permissions, and session boundaries.
- IAE artifact intake/upload, immutable artifact metadata, lineage, evidence grants, retention, placement, and export services.
- DSM dataset definitions/versions, mappings, rules, profiling, quality results, governed datasets, and exports.
- Python dataset-profile and dataset-quality processors plus the typed cloud/sidecar engine shell.
- JRA domain/application services for typed jobs, dispatch, attempts, result manifests, findings, approvals, recipes, and admission; DDA must still compose/expose the required workflow safely.
- DSO device authorization, capabilities, data-mode policy, sync packages/receipts, and Android Room/WorkManager queue foundations.
- BUA entitlement/admission and AUD ledger/attestation foundations.
- Secure Web, Electron, and Android application shells.
- Bounded domain prototypes for Private Data Analyst, Client Report Factory, Operations Capture, Folder Autopilot, and other earlier modules. These are reusable references, not the DDA product.

Do not rebuild a foundation merely because its eventual DDA adapter does not exist. Do not call a foundation “DDA complete” merely because its package tests pass.

The fresh baseline audit on 2026-08-10 produced:

- domain: 174 tests passed;
- API: 494 tests passed;
- Python engine: 107 tests passed, plus one Windows-only launcher probe skipped;
- Web: 24 tests passed;
- Desktop package test command passed;
- DDA requirement/orchestration checks passed; and
- Android unit tests were not executable because the local Android SDK was not configured.

These results prove reusable foundations only. Cursor must rerun them in its own environment and must not reuse these historical counts as completion evidence.

## Full V1 product boundary

### Web/cloud

- Supported CSV/XLSX upload through immutable IAE intake.
- Profiling and typed ETL proposal.
- Before/after, rejection, quality, assumption, evidence, lineage, and cost review.
- Accepted immutable DSM DatasetVersion.
- Typed analyst with clarification and stable non-answer reasons.
- KPI, table, bar, line/area, pie/donut, and text/evidence widgets.
- Responsive editable canvas with stable IDs, filters, drill-down, and accessibility.
- Separate draft acceptance and immutable snapshot publication.
- Permission-safe viewing, sharing, evidence, export, and current-scope reauthorization.
- Materialized, dependency-aware `ON_CHANGE`, `MANUAL`, and `SCHEDULED` refresh.

### Windows Desktop/Hybrid

- OS-picker-approved folder only; actual canonical path and display name remain local.
- Versioned manifest for file profiles, grouping, append/replace/version policy, period overlap, duplicate keys, mappings, stability/debounce, and publication projection.
- Stable-file detection, content fingerprinting, replay deduplication, drift/overlap/duplicate/path-escape review or quarantine.
- Local typed execution and explicit projection preview.
- Resumable/idempotent sync with honest offline/revoked/stale/waiting states.

### Android/cloud-connected capture

- Explicit CameraX/document capture for an authorized Hybrid/Cloud destination.
- Immutable original plus encrypted account/workspace-scoped staging.
- Unique idempotent WorkManager upload.
- Provider-neutral receipt OCR profile implemented initially with a server-side OpenAI Responses adapter: merchant, date/time, currency, subtotal, tax, total, optional payment method/reference and line items, confidence, model/adapter/prompt/schema version, evidence coordinates, strict structured output, and deterministic validation.
- Deterministic total/type/currency/date and probable-duplicate validation.
- Field-level correction/versioning and review before DSM acceptance.
- Dashboard viewing, freshness/caveats, and focused analyst questions.

## Refresh and cost decision

The user specifically wanted interactive dashboards without paying continuous raw-query cost. Implement this model:

```text
accepted DatasetVersion commit
  -> content-safe outbox event
  -> versioned dependency lookup
  -> compatible debounce/deduplication
  -> affected typed materialization jobs only
  -> complete cache-key and manifest verification
  -> atomic DashboardSnapshot commit
  -> content-safe SSE notification
  -> authorized REST reconciliation
```

Ordinary page views read the last authorized complete snapshot/materializations. A failure keeps the last good snapshot visible with an exact freshness/source reason. Never substitute a partial or mixed-version snapshot.

## Quality-language decision

The UI must not invent one “correctness percentage.” Report these separately, with denominator, coverage, rule/expectation, sampling, and limitations:

- completeness;
- validity;
- uniqueness;
- consistency;
- freshness; and
- extraction confidence.

An optional aggregate quality summary must disclose its deterministic formula and cannot claim factual correctness.

## Complete cross-platform acceptance journey

The integrated product journey must demonstrate:

1. A messy sales CSV/XLSX is uploaded, profiled, visibly reviewed, accepted, and turned into an editable published dashboard.
2. A compatible file added to an approved Desktop folder creates a reviewed Local/Hybrid update and refreshes only affected dashboard results.
3. A receipt captured on Android is uploaded, OCR-reviewed/corrected, accepted, and reflected in an expense view.
4. OpenAI disabled, refused, rate-limited, or unavailable and source-device-offline states still leave deterministic/manual behavior and the last good snapshot usable with clear caveats.

Fixture-backed adapters and constrained volumes are useful for isolated tests but remain partial evidence. Production additionally requires the live server-side OpenAI adapter, pinned-model evaluation, tenant isolation, provider retention/egress approval, disaster recovery, accessibility, signing, load/cost controls, and the 60-second p95 evidence.

## Explicit non-goals and prohibited shortcuts

- Do not implement all ten old specialist modules as V1.
- Do not claim genuine streaming; `DDA-051` is deferred.
- Do not execute generated SQL, Python, JavaScript, macros, shell, filesystem, or remote-control instructions.
- Do not overwrite originals or accepted DatasetVersions.
- Do not silently omit rejected, unsupported, truncated, quarantined, or unprocessed data.
- Do not put raw data, local paths, OCR text, cells, secrets, or evidence snippets in telemetry/events.
- Do not let dashboard sharing grant broader source/evidence permissions.
- Do not hand clients/workers database credentials or let one feature read another feature's persistence.
- Do not hand-edit generated contracts.
- Do not mark fixture-only or in-memory behavior production verified.
- Do not bypass plan 081 even when Cursor can implement multiple lanes quickly.

## One complete task-driven execution program

### Gate 1 — sequential

Implement and verify `081-dda-contracts-and-authorities.md`. This freezes domain models, JSON Schemas, cross-language generated contracts, persistence ownership, public ports, untrusted-content policy, AI-egress policy, retention, and audit behavior.

### Gate 2 — independent after 081

- `082-dda-cloud-intake-etl.md`
- `083-dda-analyst-dashboard-canvas.md`
- `084-dda-materialization-refresh.md`
- `085-dda-desktop-hybrid-folders.md`
- `086-dda-android-receipts.md`

If Cursor can coordinate isolated agents/worktrees, these five lanes may run in parallel using the exact ownership from `data-to-dashboard-orchestration.json`. If Cursor works alone, execute them one at a time. Never allow parallel agents to edit shared generated contracts or root composition.

### Gate 3 — integration

Execute `087-dda-integration-readiness.md`. Integrate lanes in order `082`, `084`, `083`, `085`, `086`; reconcile root composition/generated files/migrations; run parity and the golden journey; update evidence honestly.

### Gate 4 — production and release

Execute all applicable `401-dda-production-readiness.md` gates (agent-first via `402`, OpenAI development validation via `403`), configure and evaluate the live OpenAI project/model, sign Desktop/Android artifacts, prove backup/restore and rollback, deploy through staged AWS environments, run real-device and synthetic smoke checks, and approve the monitored production release.

## Baseline and handoff verification

Run before starting and after every integrated work package:

```powershell
git status --short
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm requirements:check
corepack pnpm orchestration:check
corepack pnpm contracts:check
corepack pnpm test
```

Run the active child plan's focused API, engine, Web, Desktop, or Android commands as well. Android tests require a configured Android SDK; missing SDK is an environment blocker to record, not evidence of a passing Android lane.

Completion claims require fresh command output, zero failures, and exact evidence paths. A work package handoff must include:

```text
Work package and tasks:
Requirements attempted:
Commit hash:
Changed files:
Commands, exit codes, test counts, and skips:
Migrations and rollback:
Security/tenant/data-mode/evidence review:
Prototype fakes or incomplete adapters:
Known limitations:
Contract requests/integration risks:
Next dependency-safe work package:
```
