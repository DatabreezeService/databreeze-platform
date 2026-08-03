# IAM recovery slice — 2026-08-03

This evidence records the partial account-recovery boundary delivered on `feat/iam-recovery`.
It does not claim that IAM-015 or the IAM plan is complete.

## Scope

- Validate a bounded recovery request and return the same accepted response for known and unknown email addresses.
- Generate a short-lived, single-use bearer, deliver the raw value only through the delivery port, and persist only keyed HMAC digests.
- Consume the bearer exactly once and atomically rotate the Argon2id credential, advance the user security epoch, revoke active sessions and MFA factors, and mark MFA re-enrollment required.
- Clear the re-enrollment gate in the same MFA transaction when a newly enrolled factor is successfully verified; failed proofs do not clear it.
- Carry the live gate through credential lookup, session lookup, protected request context, and sign-in/current-session projections without trusting client-supplied state.
- Apply a bounded, replaceable recovery-admission port before account lookup; unknown and throttled addresses receive the same generic response.
- The `RedisRecoveryAdmissionAdapter` implements that port for horizontally scaled deployments. It accepts only keyed digests, namespaces counter keys, requires an injected atomic `INCR`/`PEXPIRE` implementation, and fails closed on malformed input or counter failure. The in-memory adapter remains the alpha default until a Redis client is provisioned.
- Keep the public completion response free of bearer material; no session is automatically created.
- Select the Prisma recovery adapter only when persistence is configured, and fail closed when the delivery, digest, or password boundary is missing.

## Evidence

- Recovery state-machine tests: `packages/domain/test/recovery-v1.test.mjs`.
- Abuse-control tests: `services/api/test/features/iam/recovery-admission.test.ts` and `redis-recovery-admission.adapter.test.ts`.
- In-memory transaction/service tests: `services/api/test/features/iam/recovery.service.test.ts`.
- Durable schema adapter and atomic side-effect tests: `services/api/test/features/iam/prisma-recovery-repository.test.ts`.
- MFA re-enrollment transaction tests: `services/api/test/features/iam/mfa.service.test.ts` and `services/api/test/features/iam/prisma-mfa-repository.test.ts`.
- Live principal/context propagation tests: `services/api/test/features/iam/prisma-credential-lookup.test.ts`, `services/api/test/features/iam/prisma-session-lifecycle.test.ts`, and `services/api/test/platform/http/session-tenant-context.test.ts`.
- Composition/controller/HTTP tests: `services/api/test/features/iam/recovery-composition.test.ts`, `recovery-controller.test.ts`, and `recovery-http.test.ts`.
- Public routes: `services/api/openapi/v1.json` (`POST /v1/auth/recovery` and `POST /v1/auth/recovery/complete`).
- Bilingual problem copy: `packages/i18n/src/catalogs-v1.ts` and `packages/i18n/test/catalogs-v1.test.mjs`.

## Verification

The scoped API TypeScript build, recovery tests, i18n tests, OpenAPI generation/check, and Prisma validation passed on 2026-08-03. The requirement remains `partial` and `not-verified` until authenticated MFA re-enrollment enforcement, audit events, rate limits, abuse monitoring, restoration drills, and the complete IAM release gates are delivered.
