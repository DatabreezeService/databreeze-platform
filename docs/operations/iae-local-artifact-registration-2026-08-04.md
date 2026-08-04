# Local artifact registration and evidence slice — 2026-08-04

## Scope

This record covers the first HTTP vertical path for the Folder Autopilot and
Spreadsheet Auditor dogfood flow. It is a partial implementation of IAE-001,
IAE-004, IAE-006, and IAE-019; it does not promote any requirement to
`verified` or complete Plan 030/070.

## Implemented

- `POST /v1/artifact-versions/local` accepts only artifact metadata, a SHA-256
  digest, byte size, media type, display name, a typed evidence coordinate, and
  an opaque Desktop placement handle.
- Tenant scope and `Local` data mode are derived from the authenticated request
  context. Caller-supplied scope, paths, bytes, URLs, excerpts, and other
  undeclared fields are rejected by the closed validation pipe.
- Registration persists the immutable version, local placement, and optional
  evidence in one artifact transaction. Replaying the same stable identities
  returns the same result without creating a second version or evidence row.
- Existing content-free reads resolve the exact evidence to
  `OPEN_ON_SOURCE_DEVICE` and return only the opaque handle; no local path or
  source bytes are relayed.
- The generated OpenAPI v1 artifact documents the route and closed DTOs.

## Evidence

- Red/green HTTP coverage: `services/api/test/features/iae/local-artifact-registration.controller.test.ts`
- Application mapping: `services/api/src/features/iae/application/artifact.service.ts`
- HTTP adapter and closed input DTO:
  `services/api/src/features/iae/api/local-artifact-registration.controller.ts` and
  `services/api/src/features/iae/api/local-artifact-registration.dto.ts`
- Contract artifact: `services/api/openapi/v1.json`
- Verified commands for this slice:
  `corepack pnpm --filter @databreeze/api exec tsc --project tsconfig.test.json`
  and the compiled focused test (`2/2` passing), plus
  `corepack pnpm --filter @databreeze/api openapi:check`.

## Remaining gates

Registration still requires the planned Desktop admission/scanning path before
production use. Full audit/outbox integration, durable PostgreSQL evidence,
device grants, signed authorization, generated client parity, and the complete
Plan 030/070 acceptance harness remain outstanding. The authoritative
`docs/plans/requirement-traceability.json` statuses therefore remain unchanged.
