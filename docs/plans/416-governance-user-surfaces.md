# Plan 416 — Governance user surfaces

Status: Approved by the product owner in the active implementation conversation.

## Goal

Replace the dead Approvals and Audit navigation entries with useful, server-backed
read surfaces. The pages must use the authenticated workspace context, preserve
tenant isolation, render bounded closed data, and distinguish loading, empty,
integrity, and unavailable states in Vietnamese and English.

## Scope

- Add Web clients with strict runtime parsing for the existing approval-request
  and audit-event endpoints.
- Add premium blue Web pages for approval queue/detail links and audit history.
- Wire the pages into the existing authenticated router without changing the
  published v1 contract baseline.
- Add focused API/client/page tests and preserve server ProblemDetails behavior.

## Non-goals

- Inventing approval decisions, audit mutations, exports, or fake seed rows.
- Adding a new public contract major version solely for these existing read
  envelopes; generated-contract migration remains a separate task.
- Changing authorization, audit persistence, or JRA/AUD sources of truth.

## Requirements and acceptance

- WEB-001, WEB-038: approvals and audit history are reachable from the Web
  management surface.
- AUD-017/019: audit queries remain bounded, deterministic, safe, and content
  minimized; integrity failures are visible and never shown as an empty feed.
- JRA approval reads remain tenant-scoped and server-authorized.
- A failed request is never presented as a successful empty state.
- `corepack pnpm --filter @databreeze/web typecheck`, focused Vitest, API test
  compile, and `git diff --check` pass.

