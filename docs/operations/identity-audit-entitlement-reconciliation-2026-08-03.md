# Identity, audit, and entitlement reconciliation — 2026-08-03

## Scope

This evidence record covers the 30-commit `feat/foundation-identity-reconciliation` batch based on `dev`. The batch hardens existing IAM, AUD, and BUA foundations; it does not claim completion of Plan 020 or any production release gate.

## Implemented in this batch

- IAM persistence now compares only owned immutable fields, scopes membership and Device lookups before row materialization, applies optimistic revisions to MFA state, binds sessions to the exact sign-in organization/workspace, expires access credentials, separates rejected credentials from authority outages, authorizes sign-out ownership, and bounds cookie/CSRF parsing.
- Membership authority flows only from a containing tenant scope, and the narrowest applicable membership wins. A project or workspace membership cannot authorize its parent or a sibling.
- AUD append paths use scoped, bounded replay/latest lookups; immutable comparisons ignore persistence metadata; read outages return safe retryable `AUDIT_UNAVAILABLE` problems.
- BUA tenant-owned identity lookups and usage reads are scope-bound; immutable comparisons ignore persistence metadata; reservations allow only one terminal transition; API failures return stable Problem Details.

## Conservative requirement state

The traceability manifest marks only requirements with concrete implementation and tests as `partial`. All remain `not-verified`; no P0/P1 release status is promoted. Requirements whose primary behavior is absent—such as invitations, service accounts, account recovery, audit exports/legal holds, commercial billing reconciliation, and usage exports—remain `planned`.

## Evidence

- Domain tests: `packages/domain/test/identity-v1.test.mjs`, `packages/domain/test/audit-v1.test.mjs`, `packages/domain/test/entitlements-v1.test.mjs`, and tenant/authorization/CSRF/MFA suites.
- API tests: `services/api/test/features/iam/`, `services/api/test/features/aud/`, `services/api/test/features/bua/`, `services/api/test/platform/http/`, and `services/api/test/http-contract.test.ts`.
- Persistence: `services/api/prisma/schema/iam.prisma`, `services/api/prisma/schema/aud.prisma`, `services/api/prisma/schema/bua.prisma`, and the ordered IAM session-scope migration.
- Focused verification passed throughout the batch, including TypeScript compilation, Prisma schema validation, 122 domain tests, and the affected API suites.

## Remaining gates

- Plan 020 still requires invitations, ownership transfer workflows, service accounts, signed offline authorization issuance, full permission enforcement, audit action-definition governance, signed independent seals, legal holds/retention/export/restore, provider-independent subscriptions, offline entitlement issuance, reconciliation/exports, client administration surfaces, and real PostgreSQL/backup/security evidence.
- FND-003 remains blocked only on live Docker daemon evidence; this batch does not change its status.
- The feature PR targets `dev` without CodeRabbit. CodeRabbit remains reserved for the later `dev` to `main` promotion PR and is invoked once there.
