# ADR-0001: Start a Clean Product Monorepo

**Status:** Accepted<br>
**Date:** 2026-07-31

## Context

The existing workspace contains separate backend and frontend repositories, an unusable root Git directory, a duplicated nested backend project, generated/runtime content, inconsistent stack documentation, and implementation assumptions tied to marketplace uploads.

The approved product now includes Web, Windows Desktop, native Android, a control-plane API, and a shared processing engine. Contracts and features regularly cross these boundaries.

## Decision

Create one new repository named `databreeze-platform` with independently buildable applications and services:

- `apps/web`
- `apps/desktop`
- `apps/android`
- `services/api`
- `services/engine`
- shared contracts, design assets, fixtures, infrastructure, tools, and documentation

The old repositories remain read-only archives after selective migration.

The documentation suite may be authored and reviewed in the existing backend repository before the new repository exists. That is a staging location, not a decision to reuse the backend codebase.

## Why

- A contract and every affected consumer can change atomically.
- One documentation and issue model prevents divergent product definitions.
- Cross-platform fixtures and acceptance tests remain synchronized.
- Automated agents and human developers can inspect the complete dependency graph.
- Path-filtered CI and separate release pipelines preserve deployable independence.
- The current repositories do not provide enough clean structure to justify retaining their boundaries.

## Alternatives

### Keep frontend and backend repositories and add Desktop, Android, and Engine repositories

Rejected because five repositories would make early contract changes, coordinated releases, fixtures, documentation, and refactoring unnecessarily expensive.

### Keep separate product and infrastructure repositories

Deferred. Infrastructure belongs with the product until access control, compliance, or ownership creates a demonstrated reason to split it.

### Repair the current workspace root

Rejected because the invalid Git state and nested histories create migration risk without product benefit. A new repository is clearer and recoverable.

## Consequences

- Tooling must support TypeScript, Kotlin, and Python in one CI graph.
- Ownership boundaries are enforced through directories and contracts rather than repository permissions.
- Large generated outputs and customer/runtime files require strict ignore rules.
- A future split remains possible through published interfaces.

## Guardrails

- One repository is not one deployable.
- Feature modules do not bypass domain boundaries.
- CI runs shared contract checks for every relevant change.
- A new repository requires a documented security or operational boundary, not preference.

## Documentation Migration Gate

The gate was completed before implementation planning:

1. `databreeze-platform` was created with the directory shape in the architecture document.
2. The accepted 49-file `docs/` suite was copied without semantic edits and every source/destination SHA-256 digest was verified before destination-only authority and provenance edits.
3. The immutable source-copy digest list is stored in [`docs/MIGRATION_MANIFEST.sha256`](../MIGRATION_MANIFEST.sha256).
4. `databreeze-platform/docs` is authoritative; the legacy staging branch is retained only as a frozen historical review archive that points to this repository.
5. Product implementation must not begin from the legacy backend or frontend histories.

### Migration record

| Field | Value |
|---|---|
| Completed | 2026-07-31 |
| Source repository | `DatabreezeService/BE_DataBreeze` |
| Source reviewed commit | `b97f864e699a50b59ff64e1337270b0770a371c8` |
| Destination repository | `DatabreezeService/databreeze-platform` |
| Destination initial migration commit | `150c310437214ff1f98370385aa52f7100ea4e90` |
| Verified copied files | 49 of 49 |
| Integrity algorithm | SHA-256 |

The destination initial commit identifies the imported suite and clean repository skeleton. This later provenance edit is intentionally separate so a commit is never required to contain its own hash.
