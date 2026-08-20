# Plan 414 — Reloadable upload-to-preparation review

**Status:** Approved for implementation by the product owner in this task.

**Requirements:** DDA-002, DDA-005, DDA-006, DDA-008, DDA-009, DDA-010, DDA-011,
WEB-005, WEB-021

## Goal

Make a normal authenticated CSV/XLSX upload enter a server-owned, reloadable
cleaning review without a manually configured ETL proposal ID. The existing
workspace data-import record is the local preparation command/read model; a
canonical project-scoped ETL proposal is created only when its approved
resolver and foundation bindings are available. The server derives the exact
artifact, tenant scope, immutable bindings, and bounded review from the
approved public ports. The browser may request a review and corrections, but
never supplies authority, policy, identity, or source values as authority.

## Scope

- Make the existing data-import create/replay command the server-owned local
  preparation command and return its review projection from the persisted
  import record. Do not require a manually configured proposal ID.
- Preserve the separate ETL proposal route as an optional project-scoped
  integration. It must remain explicitly unavailable when its resolver or
  foundation authorities are not composed; it must not be faked from a
  workspace import.
- Resolve only through the existing data-import, artifact, dataset, DSO policy,
  and IAM/IAE/DSM ports. Missing foundations remain an explicit unavailable
  state; no UUIDs are fabricated for policy or source authority.
- Make Web use the returned import ID from the upload session and preserve it
  in the route/state so reload opens the same scoped review.
- Keep acceptance revisioned/idempotent and leave the certified JRA/materialized
  dashboard path unchanged. A local deterministic preview may be shown only as
  a clearly labelled preparation preview.

## Non-goals

- No arbitrary SQL/code or client-authored transforms.
- No claim that a proposal is AI-validated; AI suggestions remain labelled
  non-authoritative.
- No production fallback to demo or in-memory authority.

## Verification

- API tests cover exact import scope, replay, cross-tenant denial, missing
  foundation/unavailable behavior, closed transform allowlist, and revisioned
  corrections.
- Web tests cover upload → proposal URL → reload → review → correction and
  unavailable/forbidden states.
- API/Web typechecks, contract generation, OpenAPI validation, and diff hygiene
  must pass. The local journey must use real Postgres/Redis/Mailpit/MinIO when
  Docker is available.

## Implementation checkpoint (2026-08-18)

- The local production-shaped composition now has a regression test proving
  that configured MinIO wires the durable multi-file intake object store and
  exact artifact-processing content reader (`[DDA-053, WEB-021, IAE-022]`).
  The test intentionally does not claim a live object-store journey when
  Docker is unavailable; the authenticated upload/review/approval smoke still
  belongs to the local-stack gate above.
- The legacy Reviews route no longer exposes its low-level Inbox upload control
  unless an explicitly authorized ETL proposal is configured. Without that
  proposal it hands the user to Dữ liệu, the canonical reloadable upload →
  preparation → review → approval flow, so a live upload cannot appear to
  succeed without creating a reviewable server record.
- The Dữ liệu drawer now treats each subsequent chooser/drop action as an
  additive upload batch, deduplicates identical file selections, and keeps the
  accumulated files in the same server-owned review handoff. The regression
  test covers two separate chooser selections (`[DDA-002, WEB-021]`).

## Product-owner profile decision (2026-08-20)

- The canonical V1 Web CSV/XLSX intake profile sets a maximum row ceiling of
  exactly 1,000,000 data rows while retaining the 100 MiB file cap and its
  independent size, column, worksheet, formula, ZIP, cell, and XML safety
  bounds. The exact acceptance fixture is CSV. Boundary tests must prove
  1,000,000 accepted and 1,000,001 rejected without constructing million-row
  payloads where a direct profile-boundary unit is available (`[DDA-002]`).
- The 20,000-row dashboard preview/materialization bound is a separate output
  constraint and must not be changed as part of this intake-profile decision.
