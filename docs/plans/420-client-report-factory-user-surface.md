# Plan 420: Client Report Factory user surface

**Status:** Approved for implementation by the product owner in this task.

## Goal

Make the authenticated Reports area a real, evidence-backed workflow rather
than a placeholder. The first release must let an authorized user discover
report definitions, inspect a report run and its frozen manifest, review output
state, and navigate to the existing approval/release history without exposing
client data or pretending that an output exists.

## Authority and requirements

- `CRF-001`–`CRF-020`: report definitions, immutable versions, frozen runs,
  deterministic facts, evidence lineage, approval binding, release state, and
  idempotent reads/mutations remain Client Report Factory authority.
- `JRA-001`, `JRA-012`, `JRA-013`, and `JRA-029`: execution state and result
  manifest identity remain JRA authority; CRF stores only the scoped projection.
- `IAE-002`, `IAE-005`, and `IAE-012`: report outputs and evidence remain
  artifact/version authority; the Web never receives storage paths or URLs from
  a report list response.
- `IAM-002`, `IAM-009`, and `WEB-001`/`WEB-002`/`WEB-019`: all reads and
  mutations are authenticated, exact-scope, permission checked, generated
  contract validated, localized, and reload-safe.

## Current prerequisite gap

The repository currently has no `services/api/src/features/crf` module, CRF
Prisma schema, report persistence, report controller, or generated report
transport. The existing Web Reports navigation entry therefore cannot be wired
to real data yet. This plan intentionally does not create synthetic report rows
or reuse dashboard/JRA rows as reports; those would violate CRF ownership and
would make the UI look functional while hiding a missing backend.

## Bounded implementation

1. Add the CRF schema/model and migration for scoped report definitions,
   immutable report versions, frozen run manifests, output projections, and
   release/approval bindings. Keep source datasets, JRA jobs, and IAE bytes in
   their owning modules; CRF stores opaque references and verified hashes only.
2. Add unpublished v4 closed contracts for report list/detail, run detail,
   output status, and evidence summary. Reject tenant, actor, path, URL, raw
   source values, and provider fields from browser input/output.
3. Add read-only exact-scope APIs first (`GET /v1/reports`,
   `/v1/reports/{id}`, `/runs/{id}`, `/manifest`, `/outputs`, and `/evidence`),
   then add definition/run/review mutations with server-owned idempotency and
   CRF/JRA/IAE transaction participants.
4. Replace the Web placeholder with a premium blue Reports workspace showing
   truthful loading, empty, blocked, draft, review-ready, released, stale, and
   evidence-unavailable states. Keep Vietnamese-first copy and complete English
   parity; link report creation to Dữ liệu only when the server has a governed
   dataset binding to choose.
5. Add local fixtures and an authenticated journey: create/bind a report,
   freeze a run, inspect facts/evidence/output status, submit for approval,
   reload, and verify that a sibling workspace cannot enumerate it.

## Verification

- Contract generation/parity with published v1–v3 compatibility unchanged.
- Prisma migration inventory, exact-scope repository/controller tests, and
  CRF/JRA/IAE binding tests.
- Web transport/page tests for real response parsing, reload-safe navigation,
  localized state handling, and absence of authority/storage fields.
- API/Web typechecks, scoped ESLint, OpenAPI validation, Prettier, and
  `git diff --check`.

## Implementation checkpoint (2026-08-18)

- CRF schema/migration, exact-scope Prisma/in-memory read repositories, and
  server-bound idempotent definition creation are implemented.
- Unpublished v4 contracts, generated models, fixtures, API routes, and Web
  transport/page states are implemented. Reports now load real definitions and
  detail from `/v1/reports`; an empty workspace is explicit and links back to
  approved data rather than inventing report rows. The Web now also offers a
  server-bound creation form that selects an active IAM client project and a
  published, quality-ready dataset version; arbitrary client IDs and
  cross-workspace bindings are rejected by the API.
- Focused CRF API tests, Prisma inventory/validation, OpenAPI validation, Web
  Reports tests, Web typecheck, and scoped lint/format checks are green. Full
  local Docker verification is still pending when the Docker engine is
  available.
- Run freezing, JRA result binding, evidence/output mutations, approval, and
  release remain intentionally unexposed until their owning transaction
  participants are composed.

## Explicit non-goals

- No fake metrics, report rows, output links, or client-side report database.
- No direct reads from another feature's persistence.
- No report release or share grant without the canonical JRA approval binding
  and IAE output/evidence policy.
- No provider-specific AI narrative or payment behavior in the first CRF slice.
