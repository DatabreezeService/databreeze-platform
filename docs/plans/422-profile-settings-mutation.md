# Plan 422: revisioned account profile settings

**Status:** Approved for implementation by the product owner in the active
settings request.

## Goal

Make the authenticated account settings surface editable for the two safe,
non-security preferences already owned by IAM: display name and interface
locale. Security-sensitive changes remain behind the existing password recovery,
MFA, and session authorities.

## Requirements

- IAM-002/IAM-003/IAM-019: derive the actor from the authenticated request and
  never accept user or tenant authority from the browser.
- IAM-016: persist only `vi-VN` or `en` locale values without changing business
  data semantics.
- IAM-023: use the authenticated session and server-side authorization epoch.
- IAM-018: make the mutation idempotent and revision-guarded.
- WEB-001/WEB-002: render loading, success, conflict, forbidden, and unavailable
  states in Vietnamese and English.

## Scope

1. Add a closed unpublished v4 command/result contract for profile updates.
2. Add a revisioned IAM profile port and Prisma/in-memory adapters. The update
   changes only the authenticated user's display name and locale, and returns a
   server-derived bootstrap projection.
3. Add `PATCH /v1/me/profile` with bounded DTO validation, idempotency, and
   optimistic revision checks.
4. Add editable Web controls to the existing account settings section.

## Explicit non-goals

- No browser-authored user ID, tenant scope, role, MFA secret, or session token.
- No password mutation in this endpoint; password recovery remains the existing
  email-bound flow.
- No MFA enrollment or recovery-code mutation until the configured proof
  provider is available.

## Verification

- Contract generation/parity and fixture checks; published v1-v3 compatibility
  remains unchanged.
- API controller/service/Prisma/in-memory tests, including replay, conflict,
  cross-actor rejection, and malformed input.
- Web settings tests in Vietnamese and English, Web/API typechecks, formatting,
  and local authenticated profile-save journey when Docker is available.
