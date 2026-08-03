# IAM foundation checkpoint — 2026-08-03

This checkpoint records the work on `feat/foundation-fnd005-reconciliation-20260803` before the first 30-commit integration boundary. It is evidence for the partial IAM-001/IAM-003/IAM-004 slice; it does not claim that the IAM plan or the product is complete.

## Reversible implementation units

- `be7367d` accepts a scoped invitation only for the invited principal, rejects stale/expired requests, and clears invitation-only lifetime fields.
- `b90c9d4` persists cleared invitation lifetime fields through the Prisma membership adapter.
- `2b97550` exposes invitation acceptance through the versioned API and OpenAPI artifact.
- `7eb92f4` adds owner-only, revisioned atomic ownership promotion/demotion with transaction rollback coverage.
- `11484b1` exposes ownership transfer through the versioned API and OpenAPI artifact.
- `c4ed1e6`, `2419607`, `5f1d9b3`, `74582a2`, and `dcce9b3` compose, read, expose, and type the authenticated personal-tenant bootstrap state.
- `6ec3282`, `110848d`, and `98f1774` constrain owner invitations, authorize membership listing, and protect Owner membership removals.
- `66c91d9`, `9e80b73`, and `6593454` prove ownership rollback and stable availability failures.

## Verification recorded

- API TypeScript tests compile successfully with `tsconfig.test.json`.
- Membership service direct run: 12 passing tests.
- Identity bootstrap direct run: 5 passing tests.
- Bootstrap controller direct run: 2 passing tests.
- Deterministic OpenAPI test and `openapi:check` pass; the checked-in `services/api/openapi/v1.json` includes `/v1/me/bootstrap`, invitation acceptance, and ownership transfer.

## Deliberate remaining gaps

The following requirements remain partial and must not be promoted to `verified` from this checkpoint:

- durable invitation token hashing/email binding and single-use token redemption;
- recent-MFA step-up assertions and the specified seven-day signed ownership-transfer request/explicit recipient acceptance flow;
- audit/outbox events for every membership mutation and authorization-epoch invalidation;
- account registration/recovery orchestration and full organization enumeration for non-personal team tenants;
- production migration/restore evidence and the root `repo:check`/`repo:build` gates for this branch.

The next integration action is to complete those foundation boundaries, run the root checks from a clean tree, and only then prepare the feature PR to `dev`. A promotion PR to `main` receives the single CodeRabbit review cycle required by the repository workflow.
