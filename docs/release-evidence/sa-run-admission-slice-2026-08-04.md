# Spreadsheet Auditor run-admission evidence

This is a partial SA-001 checkpoint. It adds the content-free run admission boundary; it does
not release Spreadsheet Auditor or mark SA-001 through SA-027 verified.

## Traceability

- Requirement: `SA-001` (P0), run admission and tenant-scoped execution handle.
- Domain contract: `packages/domain/src/spreadsheet-audit-run/v1.ts`.
- API port/service: `services/api/src/features/sa/application/spreadsheet-audit-run-{repository.port,service}.ts`.
- HTTP boundary: `POST /v1/spreadsheet-audit-runs` and
  `GET /v1/spreadsheet-audit-runs/:runId`.
- Tests: `packages/domain/test/spreadsheet-audit-run-v1.test.mjs`,
  `services/api/test/features/sa/spreadsheet-audit-run.service.test.ts`, and
  `services/api/test/features/sa/spreadsheet-audit-run.controller.test.ts`.

The request carries only an opaque `artifactVersionId` and a bounded processor version. Tenant
scope and the idempotency key come from the authenticated request context. The response exposes
only a run ID, job ID, artifact version, processor version, state, and creation time; it never
returns a path, URL, source bytes, formula, source value, or stored idempotency key.

The in-memory repository is a local/test adapter. The durable JRA admission/outbox transaction,
artifact status admission, entitlement reservation, audit append, and engine dispatch remain
explicit follow-up work in the JRA/IAE foundation plans.

## Verification

- Domain typecheck and full domain tests pass (152 tests).
- API typecheck passes.
- Focused service and HTTP tests pass (4 tests).
- Unknown-field validation rejects source-path input without reflecting it in the response.

## Rollback

Revert the commits on `feat/spreadsheet-auditor-run-api` in order. This slice has no database
migration and does not enqueue work or read artifact bytes.
