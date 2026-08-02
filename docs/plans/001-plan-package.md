# Complete Plan Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Persist the approved complete DataBreeze implementation plan as child plans and a machine-readable requirement traceability manifest before product implementation continues.

**Architecture:** Keep the existing numbered delivery plans authoritative, add one child plan per platform/foundation/feature phase, and assign each requirement exactly one primary task while allowing supporting tasks and later P2 extensions.

**Tech Stack:** Markdown plans, JSON traceability manifest, Node-based repository checks.

## Global Constraints

- Preserve the approved `databreeze-platform` monorepo and existing `docs/specs` requirements.
- Cover exactly 611 requirement IDs from `docs/specs/requirement-index.json`.
- Keep P0 as release gates, P1 as GA completion, and P2 as post-GA extensions.
- Do not change product behavior or implementation code in this task.
- Validate Markdown links, JSON shape, requirement uniqueness, and formatting before commit.

---

### Task 1: Persist the complete child-plan and traceability package

**Files:**
- Create: `docs/plans/020-identity-audit-entitlements.md`
- Create: `docs/plans/030-artifacts-datasets-evidence.md`
- Create: `docs/plans/040-jobs-processing-approvals.md`
- Create: `docs/plans/050-devices-sync-offline.md`
- Create: `docs/plans/060-collaboration-integrations.md`
- Create: `docs/plans/070-dogfood-folder-spreadsheet.md`
- Create: `docs/plans/100-folder-autopilot.md`
- Create: `docs/plans/110-spreadsheet-auditor.md`
- Create: `docs/plans/120-quote-intelligence.md`
- Create: `docs/plans/130-operations-capture.md`
- Create: `docs/plans/200-invoice-leak-detector.md`
- Create: `docs/plans/210-client-report-factory.md`
- Create: `docs/plans/220-private-data-analyst.md`
- Create: `docs/plans/300-migration-ready.md`
- Create: `docs/plans/310-data-quality-guard.md`
- Create: `docs/plans/320-embedded-importer.md`
- Create: `docs/plans/400-production-readiness.md`
- Create: `docs/plans/500-post-ga-extensions.md`
- Create: `docs/plans/requirement-traceability.json`
- Modify: `docs/plans/README.md`
- Modify: `docs/plans/000-platform-program.md`

**Interfaces:**
- Consumes: `docs/specs/requirement-index.json`, all foundation/feature/platform specifications, and `docs/plans/010-engineering-foundation.md`.
- Produces: implementation-ready child plans and one trace record for every requirement ID.

- [ ] Extract the complete requirement index and assert the expected 611 IDs and priority totals before writing the manifest.
- [ ] Write each child plan with its goal, architecture, global constraints, exact requirement ownership, dependency order, repository paths, interfaces, migrations, tests, telemetry, failure behavior, rollback, and release gate.
- [ ] Assign every requirement exactly one `primaryPlan` and `primaryTask`; use `partial` only where the existing foundation already provides explicitly partial coverage.
- [ ] Add a repository check that validates IDs, plan/task references, path existence for verified records, status transitions, and P0/P1 release completeness.
- [ ] Run `corepack pnpm format:check`, `corepack pnpm requirements:check`, and the new traceability test.
- [ ] Commit as `docs(plans): persist complete implementation program`.
