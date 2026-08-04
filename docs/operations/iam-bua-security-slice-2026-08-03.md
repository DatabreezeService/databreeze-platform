# IAM, audit, and entitlement security slice — 2026-08-03

## Scope

This evidence record covers the 30-commit `feat/iam-security-completion` batch based on
`origin/dev`. It is implementation evidence only. It does not claim that Plan 020 or any
P0/P1 release gate is complete.

## Delivered

- IAM service-account identities now use bounded permissions, digest-only secrets, one-time
  secret issuance, rotation, permanent revocation, last-use monotonicity, tenant-scoped
  repositories, Prisma persistence, and versioned lifecycle HTTP contracts.
- AUD action vocabulary includes service-account lifecycle actions. Audit seal attestations
  are canonical, independently signed, immutable, tenant-scoped, transaction-aware, and
  available through in-memory and Prisma adapters with API verification.
- BUA entitlement snapshots validate their complete provider-independent plan projection.
  Signed offline leases are bounded to 24 hours and snapshot expiry, bind revision and
  security epoch, persist immutably, verify canonical payloads, and use a replaceable HMAC
  signer or injected HSM/KMS-compatible signer.
- BUA and AUD module composition defaults to unavailable signing when key material is absent;
  no secret is generated, logged, or committed by the repository.

## Verification

- Domain build and 148 domain tests pass, including canonical lease acceptance, malformed plan
  rejection, attestation binding, tenant ancestry, and signature tampering cases.
- Focused API TypeScript compilation, ESLint, Prisma validation, OpenAPI generation/check,
  Redocly validation, and focused IAM/AUD/BUA tests pass.
- Prisma migrations are ordered and add only `bua.entitlement_leases` and
  `aud.audit_seal_attestations`; no migration was applied to a live environment.
- Traceability entries for IAM-013, AUD-015, AUD-016, BUA-017, and BUA-018 remain `partial`
  and `not-verified`. They point to the concrete code, tests, and this evidence record.

## Security and rollback notes

- Lease payloads are canonicalized before signature verification; malformed, stale, expired,
  overlong, wrong-scope, and tampered leases fail closed.
- Attestation storage never broadens a caller scope and rejects immutable-identity changes.
- HMAC keys must be at least 32 bytes and should be supplied by a secret manager. HMAC is a
  portable default, not a replacement for a production KMS/HSM policy.
- Every commit on the feature branch is independently reversible. The migration commits must
  be reverted only with a reviewed down-migration/restore procedure; no destructive rollback
  was executed here.

## Remaining gates

Full audit export/legal-hold/retention administration, atomic cross-module audit coordination,
offline authorization snapshots, entitlement reconciliation/usage exports, real PostgreSQL
integration, backup restoration, security assessment, and release evidence remain outstanding.
The feature PR targets `dev` without CodeRabbit; CodeRabbit remains reserved for the later
`dev` to `main` promotion PR and is invoked once there.
