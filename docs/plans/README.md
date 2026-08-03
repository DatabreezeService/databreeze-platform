# Implementation Plans

Implementation plans are created here only after the applicable product, architecture, foundation, platform, and feature specifications are approved.

Each plan must:

- name the requirements it implements
- identify exact repository paths and contract changes
- use a vertical, testable sequence
- include migrations, security, failure behavior, telemetry, documentation, and rollback
- preserve deployable independence
- state which requirements remain for a later slice

The planning authorities are:

1. `000-platform-program.md` — stable program policy and release gates.
2. `001-plan-package.md` — historical record for creating the child-plan and traceability package.
3. `002-complete-execution-orchestration.md` — implementation DAG, atomic task catalog, cross-plan gates, and edge cases.
4. `003-luna-handoff-runbook.md` — deterministic session resume, Git/PR, CodeRabbit, recovery, and handoff protocol.
5. `004-luna-max-execution-plan.md` — live checkpoint, 15 delivery batches, commit/file budgets, parallel lanes, and the exact Luna Max starting packet.
6. `execution-orchestration.json` — machine-readable plan/task/batch dependency ledger and active batch/next-task pointer.
7. `requirement-traceability.json` — 611 unique requirement assignments (P0 444, P1 154, P2 13) and their implementation/test/release evidence.

The dependency-ordered child plans are:

1. `010-engineering-foundation.md`
2. `020-identity-audit-entitlements.md`
3. `030-artifacts-datasets-evidence.md`
4. `040-jobs-processing-approvals.md`
5. `050-devices-sync-offline.md`
6. `060-collaboration-integrations.md`
7. `070-dogfood-folder-spreadsheet.md`
8. `100-folder-autopilot.md`
9. `110-spreadsheet-auditor.md`
10. `120-quote-intelligence.md`
11. `130-operations-capture.md`
12. `200-invoice-leak-detector.md`
13. `210-client-report-factory.md`
14. `220-private-data-analyst.md`
15. `300-migration-ready.md`
16. `310-data-quality-guard.md`
17. `320-embedded-importer.md`
18. `400-production-readiness.md`
19. `500-post-ga-extensions.md`

Run `corepack pnpm orchestration:check` before selecting or handing off an implementation task. A child plan owns requirement scope; the orchestration plan owns task order; the Luna Max execution plan owns delivery batching; the traceability manifest owns evidence status. Git and fetched pull-request state override historical checkpoint hashes.

A plan does not change product scope. Any conflict returns to the specification review process.
