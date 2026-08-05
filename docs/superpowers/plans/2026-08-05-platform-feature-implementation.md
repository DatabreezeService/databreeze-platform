# DataBreeze Platform Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ten DataBreeze product modules inside the canonical `databreeze-platform` monorepo, preserving its NestJS/Fastify API, Python engine, shared contracts, Web/Desktop/Android boundaries, and evidence-backed security model.

**Architecture:** The canonical repository remains the source of truth. Existing IAM, artifact/evidence, dataset, device, audit, entitlement, job, and contract foundations are extended through their public ports; the older `Databreeze` workspace is used only as a behavioral reference. Web and Desktop share typed contracts but retain their platform-specific capabilities, while Android remains native and the Python engine owns heavy/local processing.

**Tech Stack:** pnpm 11 + Turborepo, TypeScript/NestJS/Fastify, Prisma/PostgreSQL schema ownership, Python engine, React/Vite Web, Electron Desktop, Kotlin/Compose Android, generated TypeScript/Python/Kotlin contracts, Vitest/node:test/Playwright/Gradle tests.

## Global Constraints

- Preserve tenant scope, IAM authorization, evidence lineage, data-mode policy, retention, approvals, audit, idempotency, and safe error boundaries.
- Vietnamese is the default product language; English must remain complete for every delivered user-facing slice.
- Clients consume generated contracts and never import service implementation code.
- Web never receives filesystem paths or arbitrary commands; Desktop and Android receive only signed, typed, capability-scoped work.
- Follow the applicable approved child plans and stable requirement IDs in `docs/specs/`; do not mark a requirement implemented or verified without code, tests, and release evidence.
- Do not copy the older `Databreeze` package wholesale; port only behavior that fits the canonical architecture.

---

### Task 1: Canonical feature catalog and shared module contracts

**Files:**
- Create or modify the generated contract source under `packages/contracts/schemas/v1/` and its generator manifest.
- Modify `packages/domain/` only through its existing public v1 exports.
- Modify `services/api/src/features/system/` to expose a read-only module catalog endpoint.
- Test under `services/api/test/features/system/` and `packages/contracts/test/`.

**Interfaces:**
- Produces stable module IDs, display names, platform responsibilities, lifecycle state, and supported workflow stages for all ten modules.
- Consumes the platform feature matrix and does not expose implementation-only status as product authority.

- [x] Write failing domain/API tests for all ten module IDs, Vietnamese/English labels, and stable lifecycle values.
- [x] Run the focused domain/API tests and confirm they fail before the catalog/read model exists.
- [x] Implement the closed shared domain catalog, API read model, and deterministic ordering. The published v1 contracts registry remains unchanged because its compatibility policy requires a new contract version for additive schemas.
- [x] Run domain/API typecheck, OpenAPI generation, schema compatibility, and focused API tests.
- [x] Record requirement links and a release-evidence entry without claiming full module completion.

### Task 2: Deterministic Spreadsheet Auditor and Data Quality primitives

**Files:**
- Extend `services/engine/src/databreeze_engine/processors/spreadsheet_auditor.py` and existing dataset-quality processors.
- Extend `packages/domain` spreadsheet-audit/dataset-quality contracts only through existing public exports.
- Add API application ports/controllers under new feature-owned directories following the `iae`/`dsm` layering pattern.
- Add engine and API tests beside the existing processor and feature tests.

**Interfaces:**
- Read-only audit and deterministic quality evaluation return typed findings, stable hashes, evidence coordinates, and bounded summaries.
- No repair or mutation is admitted until the approval/job foundations are wired.

- [ ] Write failing tests for formula/value findings, null-vs-missing handling, Unicode, decimal precision, duplicate keys, and evidence coordinates.
- [ ] Run the tests to observe the expected missing-behavior failures.
- [ ] Implement the minimum deterministic processor/API boundary using existing evidence and result-manifest contracts. (The new checkpoint adds a DQG domain/API validation boundary; the existing SA engine remains a separate partial slice.)
- [ ] Run Python formatting/typecheck/tests and focused API tests.
- [ ] Update the traceability manifest only for requirements backed by those paths and tests.

### Task 3: Governed intake and import slices

**Files:**
- Add feature-owned API layers for Folder Autopilot, Embedded Importer, and Operations Capture under `services/api/src/features/`.
- Extend `services/engine/src/databreeze_engine/processors/` with bounded local processing adapters.
- Add typed contract schemas and Web route/query adapters.
- Add tests for path opacity, origin allowlists, row accounting, idempotency, and offline draft scope.

- [ ] Write failing tests for opaque folder handles, safe importer origins, accepted/rejected/skipped accounting, and scoped offline drafts.
- [ ] Implement read-only preview/intake first, then add approval-bound mutation boundaries. (FA API preview is delivered; EI/OC remain domain-only primitives.)
- [ ] Verify API/engine/client contract generation and tenant isolation.

### Task 4: Decision and analysis slices

**Files:**
- Add feature-owned API/application/domain/adapter layers for Quote Intelligence, Invoice Leak Detector, and Private Data Analyst.
- Add deterministic engine processors and result/evidence manifests.
- Extend Web workbench routes and Desktop capability status only through public contracts.
- Add requirement-linked tests for scoring, expected-charge reconciliation, governed query plans, and non-fabrication.

- [ ] Write failing tests for landed-cost scoring, invoice variance controls, deterministic query plans, and unsupported-source states.
- [ ] Implement minimal deterministic paths without optional AI/provider calls. (QI/ILD domain
  primitives and stateless API previews are delivered; PDA feature-owned API/engine persistence
  remains pending.)
- [ ] Verify approval, data-mode, evidence, and egress policies before exposing mutations.

### Task 5: Migration and report publication slices

**Files:**
- Add feature-owned API/application/domain/adapter layers for Migration Ready and Client Report Factory.
- Extend engine processors for profiling, mapping, reconciliation, and versioned report outputs.
- Add Web/Android review and approval surfaces through generated contracts.
- Add tests for source/plan hashes, stale-source blocking, report approval binding, and release projections.

- [ ] Write failing tests for profile/map/dry-run/reconcile flows and exact report version/hash approval binding.
- [ ] Implement export-first, no-destination-write behavior and deterministic JSON/HTML/CSV or platform-approved outputs. (CRF/MR domain primitives are delivered; feature-owned API/engine persistence remains pending.)
- [ ] Verify evidence manifests, approval gates, and repeatability before release status changes.

### Task 6: Web, Desktop, and Android workflow coverage

**Files:**
- Extend `apps/web/src/` through the existing route/registry/query/i18n patterns.
- Extend `apps/desktop/src/` only through its secure main/preload/renderer boundaries.
- Extend `apps/android/app/src/` through native ports, scoped queues, and generated Kotlin contracts.
- Add Web/desktop/Android tests and accessibility/localization evidence.

- [x] Add failing UI tests for module navigation, unavailable API states, keyboard/focus behavior, and locale parity.
- [x] Implement the shared Web workbench and the Desktop/Android platform-specific review/status surfaces.
- [x] Run Web, Desktop, Android, and accessibility checks; do not claim workflow completeness for unwired APIs.

### Task 7: Verification, evidence, and publication

**Files:**
- Update `docs/plans/requirement-traceability.json` only for evidence-backed statuses.
- Add release evidence under `docs/release-evidence/`.
- Update relevant README and operations/runbook pages.

- [x] Run contract generation and compatibility checks.
- [x] Run API, Web, Desktop, Android unit/compile, and security test suites appropriate to delivered slices. The Python engine and Android connected instrumentation remain environment-gated.
- [x] Review the full diff for secrets, runtime artifacts, generated outputs, and cross-feature persistence violations.
- [x] Commit atomic verified slices on the feature branch.
- [x] Push the branch and report exact commit hashes and remaining planned/partial requirements.
