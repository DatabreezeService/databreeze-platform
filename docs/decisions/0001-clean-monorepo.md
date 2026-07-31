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

Before implementation planning begins:

1. Create `databreeze-platform` once, with the directory shape in the architecture document.
2. Copy the accepted `docs/` tree without semantic edits and verify a file manifest and SHA-256 digest list.
3. Record the source staging commit and destination commit in this ADR.
4. Make `databreeze-platform/docs` authoritative and replace this staging copy with a frozen pointer or archive reference.
5. Do not begin product implementation from the legacy backend or frontend histories.
