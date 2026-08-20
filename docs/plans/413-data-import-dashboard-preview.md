# Plan 413 — Approved-data dashboard preview

Status: Approved for implementation by the product owner in this task.

## Goal

Close the local user journey after DDA-053 data import approval: an approved
CSV/XLSX must produce a truthful, reloadable dashboard preview from the
server-owned artifact bytes. The preview is not a fabricated snapshot and is
not presented as a certified DDA publication. It is a bounded read model for
the current approved dataset version until the full JRA/IAE materialization
worker path is available.

## Scope

- Add a server-owned, workspace-scoped dashboard-preview query for a READY
  import/dataset. It must reopen the exact approved artifact through the IAE
  processing-content port, verify the immutable hash/media/size, parse only
  CSV/XLSX, and return bounded rows, detected measure/dimension, and
  deterministic aggregates.
- Add an unpublished v4 closed contract, generated TypeScript/Python/Kotlin
  models, and accepted/rejected fixtures for the preview response.
- Add a Web dashboard route that consumes the preview when opened from an
  approved import, shows the selected dataset/version and truthful freshness
  copy, and renders premium KPI/table/chart cards from the response. Missing
  or unavailable preview data must be an explicit unavailable state.
- Keep the existing certified dashboard/snapshot path unchanged. Never create
  a fake ResultManifest, snapshot, materialization proof, metric definition,
  or publication record from this preview.

## Authority and safety

- Derive tenant/workspace/actor context from the authenticated request;
  reject client authority fields and cross-workspace imports.
- Resolve the import and approved sources through the existing data-import and
  IAE ports. Never read another feature's persistence directly or expose
  object-store keys/URLs.
- Bound input bytes, rows, columns, and aggregate output; preserve exact source
  hash and dataset-version identifiers in the response.

## Verification

- API focused tests cover exact scope, approval state, hash/media failures,
  CSV/XLSX parsing, bounds, deterministic totals, replay, and unavailable
  provider behavior.
- Contract generation/check and fixture parity (where the local toolchain is
  available) must pass without changing published v1-v3 compatibility.
- Web focused tests cover loading/error/empty/ready states, dataset query
  parameters, reload-safe response parsing, and premium rendering.
- API/Web typechecks, OpenAPI validation, formatting, and diff hygiene must be
  green before claiming the slice complete.
