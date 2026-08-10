# DDA Analyst and Dashboard Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; use `superpowers:test-driven-development` for each task.

**Status:** Approved<br>
**Requirements:** DDA-015, DDA-016, DDA-017, DDA-018, DDA-019, DDA-020, DDA-021, DDA-022, DDA-023, DDA-024, DDA-025, DDA-026, DDA-047, DDA-048, DDA-049, DDA-050<br>
**Depends on:** Plan 081 G1 contract commit<br>
**Parallel with:** Plans 082 and 084-086, subject to plan 080 file locks

**Goal:** Let a user ask governed questions, preview a typed dashboard proposal, edit an accessible responsive canvas, and publish/share authorized immutable snapshots.

**Architecture:** The analyst planner produces only typed plans. Deterministic processors/materialized results supply all numeric values. The Web canvas stores versioned presentation and bindings, not executable chart code. DDA application services authorize every proposal, acceptance, publish, view, filter, drill, export, and share resolution against current permissions.

**Tech Stack:** NestJS/Fastify, React 19, React Router, TanStack Query, repository UI primitives, an approved bounded chart/layout dependency only after dependency review, Node/Vitest/Playwright.

## Global Constraints

- This lane owns `services/api/src/features/dda/analyst/`, `services/api/src/features/dda/dashboard/`, and `apps/web/src/features/dashboards/` plus the Web shell composition paths granted in plan 080.
- Do not edit generated contracts, Prisma/root API composition, ETL or refresh processors, Desktop, or Android.
- A novel question or canvas change is a proposal until explicit acceptance. Acceptance creates a draft DashboardVersion; publish is a separate authorized command.
- Every material number is a deterministic result cell with plan/metric provenance. Narrative text labels interpretation and links claims to result cells.
- Responsive behavior may reflow but may not hide evidence, warnings, freshness, or authorization limitations.

### Task 1: Plan and execute deterministic analysis

**Primary requirements:** DDA-015, DDA-016, DDA-017, DDA-018, DDA-019, DDA-050

**Files:**

- Create: `services/api/src/features/dda/analyst/application/analysis-proposal.service.ts`
- Create: `services/api/src/features/dda/analyst/application/analysis-execution.service.ts`
- Create: `services/api/src/features/dda/analyst/application/analysis-adapter.port.ts`
- Create: `services/api/src/features/dda/analyst/application/deterministic-result.port.ts`
- Create: `services/api/src/features/dda/analyst/api/analysis.controller.ts`
- Create: `services/api/src/features/dda/analyst/api/analysis.dto.ts`
- Create: `services/api/test/features/dda/analysis-proposal.service.test.ts`
- Create: `services/api/test/features/dda/analysis-execution.service.test.ts`
- Create: `apps/web/src/features/dashboards/analyst-panel.tsx`
- Create: `apps/web/src/features/dashboards/analysis-plan-review.tsx`
- Create: `apps/web/src/features/dashboards/result-evidence-drawer.tsx`
- Create: `apps/web/test/dashboard-analyst.test.tsx`

**Stable non-answer reasons:** `AMBIGUOUS_REQUEST`, `INSUFFICIENT_DATA`, `UNAUTHORIZED_DATA`, `STALE_INPUT`, `QUALITY_BLOCKED`, `SOURCE_UNAVAILABLE`, `UNSUPPORTED_PLAN`, `BUDGET_DENIED`, `ADAPTER_UNAVAILABLE`.

**TDD sequence:**

1. Add red tests that reject generated SQL/code/numeric values, missing semantic/metric versions, unauthorized joins/fields, unbounded outputs, missing units/grain, and value claims without result-cell references.
2. Add ambiguity tests requiring named alternatives for materially different metric/date/join interpretations and stable non-answer reasons for blocked inputs.
3. Add UI tests that show datasets, versions, metrics, dimensions, filters, range/grain, join path, units, assumptions, output, and estimated cost before execution.
4. Implement proposal, clarification, deterministic execution-port invocation, bounded AI rationale, evidence/provenance response, and metadata/result-based recommendations that never imply an unexecuted result.
5. Prove AI disabled/failure still permits manual typed plans and deterministic execution.
6. Run focused API/Web tests and commit `feat(dda): add typed governed analyst`.

### Task 2: Build the accessible versioned dashboard canvas

**Primary requirements:** DDA-020, DDA-021, DDA-022, DDA-023, DDA-024

**Files:**

- Create: `services/api/src/features/dda/dashboard/application/dashboard-draft.service.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-repository.port.ts`
- Create: `services/api/src/features/dda/dashboard/api/dashboard-draft.controller.ts`
- Create: `services/api/src/features/dda/dashboard/api/dashboard.dto.ts`
- Create: `services/api/test/features/dda/dashboard-draft.service.test.ts`
- Create: `apps/web/src/features/dashboards/dashboard-page.tsx`
- Create: `apps/web/src/features/dashboards/dashboard-canvas.tsx`
- Create: `apps/web/src/features/dashboards/widget-catalog.ts`
- Create: `apps/web/src/features/dashboards/widget-frame.tsx`
- Create: `apps/web/src/features/dashboards/widget-editor.tsx`
- Create: `apps/web/src/features/dashboards/filter-bar.tsx`
- Create: `apps/web/src/features/dashboards/dashboard-api.ts`
- Create: `apps/web/test/dashboard-canvas.test.tsx`
- Create: `apps/web/e2e/dashboard-authoring.spec.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/navigation.ts`
- Modify: `apps/web/src/app/messages.ts`
- Modify: `apps/web/src/styles.css`

**Widget allowlist:** KPI, table, bar, line/area, pie/donut, text/evidence note. Each catalog entry declares compatible field types, grain, units, maximum result shape, interaction support, accessibility description, evidence rendering, and fallback table.

**TDD sequence:**

1. Write red domain/service tests for stable page/widget IDs, immutable parented versions, canonical hashes, restore-after-remove, invalid widget/field/grain/unit combinations, filter scope, row/field restrictions, and certified-definition mutation.
2. Write red interaction/accessibility tests for keyboard add/move/resize/configure/remove/restore, focus order, screen-reader labels, chart fallback tables, responsive breakpoints, and always-visible warnings/evidence/freshness.
3. Implement leaf components and versioned draft commands. Prefer repository primitives; any chart or layout dependency requires a separate dependency-policy check and locked version.
4. Implement agent proposal preview with affected pages/widgets, before/after summary, assumptions, and cost. Accepting it creates a draft only.
5. Compose the Web route/navigation and complete Vietnamese/English messages. Run Vitest and Playwright.
6. Commit `feat(dda): build dashboard authoring canvas`.

### Task 3: Publish, view, and share without permission expansion

**Primary requirements:** DDA-025, DDA-026

**Files:**

- Create: `services/api/src/features/dda/dashboard/application/dashboard-publication.service.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-query.service.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-authorization.port.ts`
- Create: `services/api/src/features/dda/dashboard/api/dashboard-publication.controller.ts`
- Create: `services/api/src/features/dda/dashboard/api/dashboard-query.controller.ts`
- Create: `services/api/test/features/dda/dashboard-publication.service.test.ts`
- Create: `services/api/test/features/dda/dashboard-query-authorization.test.ts`
- Create: `apps/web/src/features/dashboards/publish-dialog.tsx`
- Create: `apps/web/src/features/dashboards/dashboard-viewer.tsx`
- Create: `apps/web/test/dashboard-viewer-authorization.test.tsx`
- Create: `apps/web/e2e/dashboard-sharing-security.spec.ts`

**TDD sequence:**

1. Add red tests proving dashboard share/view does not grant Dataset, original, evidence, analysis, folder, row, or field permission.
2. Cover read, filter, drill-down, download, event subscription, link resolution, permission revocation, audience change, and stale approval with current-scope reauthorization.
3. Implement separate draft acceptance and publish commands with idempotency, expected revision, material-change approval invalidation, and content-safe audit summaries.
4. Render permission-filtered results and explicit denied/removed states without exposing hidden field names or counts.
5. Run API/Web/E2E security tests and commit `feat(dda): publish authorized dashboard snapshots`.

### Task 4: Complete snapshot comparison, templates, and safe export

**Primary requirements:** DDA-047, DDA-048, DDA-049

**Files:**

- Create: `services/api/src/features/dda/dashboard/application/dashboard-comparison.service.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-template.service.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-export.service.ts`
- Create: `services/api/test/features/dda/dashboard-comparison.service.test.ts`
- Create: `services/api/test/features/dda/dashboard-template.service.test.ts`
- Create: `services/api/test/features/dda/dashboard-export.service.test.ts`
- Create: `apps/web/src/features/dashboards/snapshot-comparison.tsx`
- Create: `apps/web/src/features/dashboards/template-dialog.tsx`
- Create: `apps/web/src/features/dashboards/export-dialog.tsx`
- Create: `apps/web/test/dashboard-ga-tools.test.tsx`

1. Test compatible/incompatible comparisons, null/zero percentage rules, contribution changes, and exact changed input/definition/widget disclosure.
2. Test that templates contain presentation/binding patterns only and cannot embed another scope's IDs, values, secrets, permissions, or materialized results.
3. Test permission-filtered CSV/JSON chart data, declarative chart specification, metadata, and provenance-manifest exports through IAE; downloads reauthorize.
4. Implement and run focused tests. Commit `feat(dda): add dashboard ga tools`.

### Task 5: Produce the lane handoff

Run API/Web tests, Web typecheck/build, and the two DDA Playwright specs. Return commit hashes, requirement coverage, accessibility/security evidence, dependency additions, known limitations, and contract requests. Do not self-edit traceability status.
