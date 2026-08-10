# DDA Cloud Intake and Governed ETL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; use `superpowers:test-driven-development` for each task.

**Status:** Approved<br>
**Requirements:** DDA-002, DDA-004, DDA-005, DDA-006, DDA-007, DDA-008, DDA-009, DDA-010, DDA-011<br>
**Depends on:** Plan 081 G1 contract commit<br>
**Parallel with:** Plans 083-086, subject to plan 080 file locks

**Goal:** Turn supported Web CSV/XLSX inputs into reviewed immutable DatasetVersions through visible, typed, deterministic ETL.

**Architecture:** IAE owns resumable upload/finalization and immutable bytes. DDA coordinates profile and ETL proposals through public IAE/DSM/JRA ports. The Python engine executes allowlisted typed processors against exact versions and returns result manifests. Web shows proposal/review state and cannot create an accepted DatasetVersion until counts, hashes, rejects, schema, quality, lineage, and policy checks pass.

**Tech Stack:** NestJS/Fastify application services, existing IAE/DSM/JRA ports, Pydantic processing models, bounded Polars/XLSX readers, React/TypeScript, Vitest/Node/pytest.

## Global Constraints

- This lane owns `services/api/src/features/dda/intake/`, `services/api/src/features/dda/etl/`, processors prefixed `dda_etl_`, and `apps/web/src/features/data-intake/` leaf components.
- Do not edit JSON Schemas/generated contracts, Prisma/root API composition, Web router/navigation/messages/styles, dashboard/refresh paths, Desktop, or Android.
- Supported profiles and limits are explicit; actual content is inspected. Macros, external links, unsupported formula semantics, malformed archives, encoding failures, and limit overflows fail safely.
- No row or field disappears. Every excluded/rejected/truncated/unprocessed scope is counted and reason-coded.
- Quality dimensions remain separate. Never label profiling or AI output as “percentage correct.”

### Task 1: Govern Web file intake

**Primary requirement:** DDA-002

**Files:**

- Create: `services/api/src/features/dda/intake/application/web-intake.service.ts`
- Create: `services/api/src/features/dda/intake/application/intake-profile.port.ts`
- Create: `services/api/src/features/dda/intake/api/web-intake.controller.ts`
- Create: `services/api/src/features/dda/intake/api/web-intake.dto.ts`
- Create: `services/api/test/features/dda/web-intake.service.test.ts`
- Create: `services/api/test/features/dda/web-intake.controller.test.ts`
- Create: `services/engine/src/databreeze_engine/processors/dda_etl_intake.py`
- Create: `services/engine/tests/test_dda_etl_intake.py`
- Create: `apps/web/src/features/data-intake/intake-api.ts`
- Create: `apps/web/src/features/data-intake/upload-panel.tsx`
- Create: `apps/web/test/data-intake-upload.test.tsx`

**Behavior:** Publish a bounded V1 profile for CSV encodings/dialects and XLSX workbook/sheet/cell/formula/archive limits. Validate magic/content structure and checksum before IAE finalization. Formulas are treated according to the profile; no macros or external links execute.

**TDD sequence:**

1. Add failing service/processor tests for renamed executables, malformed CSV encoding, zip bombs, macro-enabled workbooks, excessive rows/columns/sheets/size, formula limits, checksum mismatch, duplicate finalization, and valid small CSV/XLSX fixtures.
2. Run `corepack pnpm --filter @databreeze/api test` and `cd services/engine; uv run pytest tests/test_dda_etl_intake.py`; expect focused failures.
3. Implement content inspection, explicit limits, idempotent IAE session finalization, and stable Problem codes. The controller returns IDs/status only, not source values.
4. Add upload progress/retry/cancel UI with Vietnamese default and English fallback supplied to plan 083's composition owner as leaf content.
5. Run focused API/engine/Web tests and commit `feat(dda): govern web tabular intake`.

### Task 2: Propose visible ETL and quality review

**Primary requirements:** DDA-005, DDA-006, DDA-008, DDA-009, DDA-010, DDA-011

**Files:**

- Create: `services/api/src/features/dda/etl/application/etl-proposal.service.ts`
- Create: `services/api/src/features/dda/etl/application/etl-proposal-repository.port.ts`
- Create: `services/api/src/features/dda/etl/adapter/in-memory-etl-proposal-repository.adapter.ts`
- Create: `services/api/src/features/dda/etl/api/etl-proposal.controller.ts`
- Create: `services/api/src/features/dda/etl/api/etl-proposal.dto.ts`
- Create: `services/api/test/features/dda/etl-proposal.service.test.ts`
- Create: `services/api/test/features/dda/etl-proposal.controller.test.ts`
- Create: `services/engine/src/databreeze_engine/processors/dda_etl_profile.py`
- Create: `services/engine/src/databreeze_engine/processors/dda_etl_preview.py`
- Create: `services/engine/tests/test_dda_etl_profile.py`
- Create: `services/engine/tests/test_dda_etl_preview.py`
- Create: `apps/web/src/features/data-intake/etl-review-page.tsx`
- Create: `apps/web/src/features/data-intake/quality-dimensions.tsx`
- Create: `apps/web/src/features/data-intake/rejects-table.tsx`
- Create: `apps/web/test/etl-review-page.test.tsx`

**Typed V1 transformation allowlist:** select/rename columns; trim/normalize text; parse date/time/number/currency with declared locale; cast type; deterministic null replacement; filter with explicit reject reason; deduplicate with declared keys/winner rule; derive a field from registered deterministic operators; union compatible sheets/files; bounded lookup/join against an authorized pinned reference; aggregate with declared grain.

**TDD sequence:**

1. Write red tests for arbitrary expression/code fields, cycles, missing exact version bindings, unstable transform order, ambiguous headers, breaking drift, overlap, duplicate-key changes, rejected/truncated rows satisfying a complete gate, and undisclosed sampling/exclusions.
2. Write UI tests that require source/inferred/target schemas, ordered steps, assumptions, before/after samples, changed/unchanged/rejected counts, excluded/unsupported scopes, quality effects, evidence status, and cost before acceptance.
3. Write quality tests for completeness, validity, uniqueness, consistency, freshness, and extraction confidence, each with denominator, coverage, rule/expectation, sample state, and limitations. Add a negative assertion for “percentage correct.”
4. Implement deterministic profiling/preview and proposal persistence through the frozen contracts. Treat AI mapping suggestions as labeled proposals with no validation authority.
5. Run API, engine, and Web focused tests. Commit `feat(dda): add governed etl review`.

### Task 3: Execute accepted transformations and register the output

**Primary requirements:** DDA-004, DDA-007

**Files:**

- Create: `services/api/src/features/dda/etl/application/etl-acceptance.service.ts`
- Create: `services/api/src/features/dda/etl/application/etl-foundation-ports.ts`
- Create: `services/api/src/features/dda/etl/api/etl-acceptance.controller.ts`
- Create: `services/api/test/features/dda/etl-acceptance.service.test.ts`
- Create: `services/api/test/features/dda/etl-acceptance.controller.test.ts`
- Create: `services/engine/src/databreeze_engine/processors/dda_etl_execute.py`
- Create: `services/engine/tests/test_dda_etl_execute.py`

**Execution transaction:** authorize current scope and policy; pin proposal and inputs; admit usage; create idempotent typed JRA job; execute; verify result manifest/counts/hashes/schema/lineage/reject accounting/policy; register IAE derivatives and DSM DatasetVersion through their APIs; audit outcome. Any failed check leaves no accepted version and preserves retry-safe state.

**TDD sequence:**

1. Add red tests for replay, expected-revision conflict, stale/drifted proposal, partial output, mismatched counts/hash/schema, missing reject bundle, policy change, JRA retry, DSM registration failure, and AUD failure policy.
2. Add a golden messy-sales fixture whose accepted output has fixed row counts, quality dimensions, reasons, hashes, and lineage IDs.
3. Implement the orchestration and deterministic executor. Never compensate by deleting IAE artifacts or rewriting DSM versions; resume or create a new explicit attempt/version.
4. Run `corepack pnpm --filter @databreeze/api test`, `cd services/engine; uv run pytest`, and the existing IAE/DSM/JRA focused suites.
5. Commit `feat(dda): execute accepted etl plans`.

### Task 4: Produce the lane handoff

1. Run `corepack pnpm --filter @databreeze/api test`, `corepack pnpm --filter @databreeze/web test`, and `cd services/engine; uv run pytest`.
2. Report exact requirement coverage, commit hashes, test commands/results, golden fixture IDs/hashes, Problem codes, known prototype shortcuts, and any requested contract change.
3. Do not edit orchestration or traceability status; the integration owner records evidence.
