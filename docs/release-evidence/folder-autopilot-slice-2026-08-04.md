# Folder Autopilot module release evidence

Status: implementation in progress. This record is updated only when the
corresponding code, contract, and test evidence exists in the same branch.

## Scope

This direct-to-`main` feature slice covers the first independently testable
Folder Autopilot boundary: content-free folder bindings, typed profile and
assignment validation, safe local observation and action planning, review-safe
Web/Android surfaces, and deterministic failure behavior. It does not create a
second JRA recipe/job/approval authority or copy DSO grants, paths, or
revocation state.

## Acceptance evidence

- [ ] FA-001–FA-007: binding/profile/assignment contracts contain only opaque
  DSO/JRA references and are immutable, tenant scoped, revision guarded, and
  idempotent.
- [ ] FA-008–FA-009: bounded previews expose collision, permission, resource,
  recursion, and approval outcomes without source paths or values.
- [ ] FA-010–FA-017: Desktop stabilization, fingerprinting, path containment,
  typed allowlisted actions, collision policy, derivative-only conversion, and
  recovery-folder semantics are covered by tests.
- [ ] FA-018–FA-027: plan-bound approval, pre-commit revalidation, staged
  compensation, idempotent execution projections, pause, and DSO revocation
  fail closed.
- [ ] FA-028–FA-034: module intake, reconciliation, authorized retry/undo,
  constraint narrowing, output-lineage prevention, health projections, and
  redacted ledger export are covered or explicitly tracked for the next slice.
- [ ] Cross-runtime contract generation and drift checks pass for TypeScript,
  Kotlin, and Python.
- [ ] Root repository checks, builds, accessibility checks, tenant isolation,
  path-escape tests, restart/replay tests, and `git diff --check` pass.

## Privacy and rollback notes

Folder Autopilot never persists a canonical path, local handle, source bytes,
independent DSO grant/status/revocation fields, or an independent JRA recipe,
job, or approval decision. A failed or rolled-back step leaves the original
artifact and immutable audit history intact. Reverting this feature branch
removes the module-owned projections and adapters without deleting IAE, DSO,
JRA, or Desktop-local records.

## Traceability

The authoritative requirement records are `docs/plans/requirement-traceability.json`.
Statuses remain `planned` until each requirement has a concrete code path, test
path, and this evidence record is approved by the release gate.
