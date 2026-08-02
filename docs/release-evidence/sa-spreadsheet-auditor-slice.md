# Spreadsheet Auditor vertical-slice evidence

This record describes the implemented checkpoint on the Spreadsheet Auditor plan. It is
deliberately marked **partial**: it does not release SA-001..SA-027 or replace the full
module gate in `docs/plans/110-spreadsheet-auditor.md`.

## Included in this checkpoint

- Safe deterministic XLSX inventory and formula-family anomaly detection in
  `services/engine/src/databreeze_engine/processors/spreadsheet_auditor.py`.
- A Python manifest bridge that adds server-issued opaque identities and tenant scope without
  copying workbook values in
  `services/engine/src/databreeze_engine/processors/spreadsheet_auditor_manifest.py`.
- The canonical value-free TypeScript result contract in
  `packages/domain/src/spreadsheet-audit/v1.ts`.
- Tenant-scoped API registration, lookup, and artifact-version listing under
  `/v1/spreadsheet-audits`.
- Immutable in-memory and Prisma adapters with the `sa` PostgreSQL schema and migration.
- Unknown-field rejection tests proving formulas, source values, and raw rows cannot enter the
  HTTP result boundary.

## Evidence collected

- Domain build, public API smoke test, and domain test suite pass.
- API typecheck, API test compilation, targeted API controller/adapter tests, OpenAPI generation,
  Prisma validation/generation, and migration inventory checks pass.
- Python sources and tests pass `python -m py_compile`.

The Python `uv` test command remains blocked by the existing Windows engine environment: the
checked-in `.venv\Scripts\python.exe` exits with `0xc0e90002` before pytest starts. Recreate or
repair that environment in a dedicated follow-up task; do not mark the engine requirement
verified from the compile-only result.

## Safety and rollback

- The parser rejects archive traversal, duplicate members, XML entity/DTD payloads, and resource
  exhaustion; macros and external links are disclosed as blocked reasons and never executed.
- Result persistence is immutable and tenant scoped. Replaying the same audit ID is idempotent;
  conflicting content fails closed.
- The slice is independently reversible through the commits on
  `feat/artifacts-datasets-completion`; the next integration step is a reviewed PR to `dev`.
