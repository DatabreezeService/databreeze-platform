# Engineering foundation handoff

**Observed at:** 2026-08-03 (UTC)

**Repository:** `databreeze-platform`

## Current checkpoint

- Integration base: `origin/dev` at `9265e15125c2e50cfcaca455524c903b6b92383e`.
- Stable base: `origin/main` at `8a4c0af52ed872715103710e3c89ca832f999bd4`.
- Active worktree branch: `feat/foundation-fnd005-reconciliation-20260803`.
- Active delivery batch: `B01` (foundation verification and identity completion).
- Foundation evidence units: FND-005 telemetry reconciliation is recorded;
  FND-006 hosted supply-chain protection remains an explicit external gate;
  FND-007 is this handoff record plus the linked runbooks.
- Next implementation boundary after this reconciliation: `IAM-001`.

The implementation program remains conservative: merged code and green tests
do not promote product requirements to `verified` or `released`.

## Verification record

The following evidence is reproducible from the checkpoint:

- `corepack pnpm --filter @databreeze/telemetry test` — TypeScript package,
  hostile-input, exporter-isolation, and cross-runtime source parity tests pass.
- `uv run pytest tests/test_telemetry.py` from `services/engine` — Python
  telemetry tests pass.
- `ANDROID_HOME=%LOCALAPPDATA%\\Android\\Sdk apps/android/gradlew.bat
  :app:testDebugUnitTest --offline --no-daemon` — Android/Kotlin unit suite
  passes when the SDK is supplied by the workstation/toolchain.
- `corepack pnpm orchestration:check` and `corepack pnpm requirements:check`
  pass with 611 requirement records and the B01 dependency graph intact.
- Existing root checks, API tests, OpenAPI drift checks, infrastructure static
  checks, and build evidence remain in the prior foundation records.

No customer data or credentials were used. No AWS infrastructure, database
migration against a customer environment, or production release was applied.

## Explicit external gates

- FND-006 protected GitHub release-environment reviewers and administrator
  branch restrictions still require hosted evidence; the local policy tests do
  not assert that an administrator configured those controls.
- OpenTofu live format/validate and Docker collector health remain hosted or
  workstation gates recorded by the FND-003/FND-004 evidence.
- Android instrumentation, signed packaging, hosted exporter health, and
  release provenance remain production-readiness gates.

These gaps are not hidden, weakened, or represented as product completion.

## B01 resume point

Resume on a short-lived feature branch from the fetched `origin/dev` base.
Read Plan 020 and the IAM-001 task, then use the TDD loop to reconcile tenant
transaction context, ancestry checks, authorization epochs, and atomic
mutation/audit boundaries before implementing later IAM lifecycle surfaces.
Keep feature PRs targeted to `dev` without CodeRabbit; only the subsequent
promotion to `main` receives the single full CodeRabbit review allowed for that
promotion PR.

## Rollback points

- `adba0aa` — telemetry diagnostics reconciliation evidence and its guard test.
- The containing handoff commit can be reverted independently without touching
  runtime code, tenant data, or infrastructure state.
- Existing merged foundation promotion commits remain available through the
  fetched `origin/dev`/`origin/main` refs and the local historical branches.
