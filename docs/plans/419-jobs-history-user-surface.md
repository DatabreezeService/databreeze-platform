# Plan 419: Tenant-scoped Jobs history surface

**Status:** Approved for implementation by the product owner in this task.

## Goal

Replace the authenticated Web Jobs placeholder with a real, read-only history
surface backed by JRA PostgreSQL rows. The surface must show durable execution
state and safe metadata for the current workspace, while keeping job creation,
worker execution, cancellation, retry, result bytes, and report generation on
their existing server-owned boundaries.

## Authority and requirements

- `JRA-001`, `JRA-012`, `JRA-013`, `JRA-014`, `JRA-017`, and `JRA-029`: job
  state/history and result-manifest identity remain durable JRA authority.
- `IAM-002`, `IAM-009`, and `IAM-019`: every read is authenticated, permission
  checked, and exact-scope; guessed IDs and sibling workspaces are
  non-enumerating.
- `WEB-001`, `WEB-002`, and `WEB-019`: the Web route uses server responses,
  generated contracts, localized loading/empty/error states, and no browser
  authority fields.

## Bounded implementation

1. Add unpublished v4 closed response contracts for a bounded Jobs page and a
   single Job detail. Responses contain only safe identifiers, action type and
   version, state, revision, timestamps, and bounded result/review status; they
   never expose input hashes, object IDs, paths, credentials, raw parameters,
   source values, or worker leases.
2. Add a JRA read-only application port and Prisma adapter. Use full
   organization/workspace/project scope predicates, deterministic `(createdAt,
   id)` keyset pagination, row validation, and non-enumerating missing/denied
   behavior. Add an in-memory adapter for focused Web/API tests.
3. Add authenticated `GET /v1/jobs` and `GET /v1/jobs/:jobId` controllers. The
   request context supplies actor and scope; IAM supplies
   `JOB_EXECUTION_READ`; query limits/cursors are bounded and client tenant or
   actor fields are rejected. Regenerate OpenAPI after the DTOs are closed.
4. Compose the read adapter from the existing generated Prisma client without
   changing JRA mutation/worker protocols. Keep production fail-closed when the
   durable JRA read adapter is absent.
5. Replace only the Web Jobs placeholder with a premium cobalt/blue list/detail
   page. Provide Vietnamese-first and English copy, explicit loading, empty,
   forbidden, unavailable, stale/integrity, and retry states. Link to the
   existing Reviews/Approvals surfaces when a job requires attention.

## Verification

- Contract generation/parity and fixture checks; published v1-v3 baselines
  unchanged.
- API tests for exact scope, permission denial, cursor bounds, malformed rows,
  missing IDs, deterministic ordering, and result-state projection.
- Web transport/page tests for real response parsing, reload-safe navigation,
  localized states, and no authority fields.
- API/Web typecheck, scoped ESLint, Prettier, OpenAPI validation, and
  `git diff --check`.
- Local seeded journey: sign in as Owner, open Jobs, inspect a seeded job, try a
  sibling workspace/Viewer read, and reload the page.

## Explicit non-goals

- No browser-created jobs, cancellation, retry, approval decisions, or worker
  leases in this slice.
- No report-generation or report-output API; that requires a separate approved
  report contract and IAE/JRA result-manifest slice.
- No synthetic job rows or client-side fallback data in production-shaped mode.
