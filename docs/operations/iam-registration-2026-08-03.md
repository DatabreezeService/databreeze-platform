# IAM registration slice — 2026-08-03

This evidence records the partial account-registration boundary delivered on `feat/iam-registration`.
It does not claim that IAM-001 or the IAM plan is complete.

## Scope

- Normalize and validate the email, display name, locale, and password at the application boundary.
- Hash the password through the existing Argon2id password port; raw passwords never enter persistence.
- Create the user, credential, personal organization, workspace, internal project, and owner membership in one transaction.
- Keep duplicate-email responses generic and map persistence races to a safe rejection.
- Return only hierarchy identifiers and locale from `POST /v1/auth/register`; the endpoint never returns bearer material or automatically creates a session.
- Select the Prisma registration adapter only when durable registration storage and the password boundary are configured; otherwise the endpoint fails closed.

## Evidence

- Service and in-memory transaction tests: `services/api/test/features/iam/registration.service.test.ts`.
- Durable adapter and rollback tests: `services/api/test/features/iam/prisma-registration-repository.test.ts`.
- Composition and controller tests: `services/api/test/features/iam/registration-composition.test.ts` and `services/api/test/features/iam/registration-controller.test.ts`.
- HTTP and problem-details tests: `services/api/test/features/iam/registration-http.test.ts`.
- OpenAPI route: `services/api/openapi/v1.json` (`POST /v1/auth/register`).
- Bilingual error catalog coverage: `packages/i18n/src/catalogs-v1.ts` and `packages/i18n/test/catalogs-v1.test.mjs`.

## Verification

The scoped API TypeScript build, registration tests, i18n tests, OpenAPI generation/check, and Redocly validation passed on 2026-08-03. The requirement remains `partial` and `not-verified` until the complete IAM release gates, audit integration, recovery, MFA, and restoration evidence are delivered.
