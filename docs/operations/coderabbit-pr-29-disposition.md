# CodeRabbit PR 29 Disposition

Date: 2026-08-03
Promotion PR: [#29](https://github.com/DatabreezeService/databreeze-platform/pull/29)
Automatic review run: `f61cec20-123e-4694-9265-e71aa976b01b`
Reviewed range: `3ed3d77d..86f25c85`

CodeRabbit ran once automatically on the promotion PR. No manual rerun was requested. Every inline, outside-diff, and review-body finding was reproduced against the later `dev` state. Valid gaps were fixed on `fix/coderabbit-promotion-29`; findings already addressed by later `dev` commits are recorded rather than duplicated.

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| I-01 | Reservation settlement lacked a revision predicate. | Accepted; already fixed on later `dev`. | `216f4a1`, Prisma reservation race test. |
| I-02 | Membership updates could lose a concurrent write. | Accepted; already fixed on later `dev`. | `237ba56`, Prisma membership race test. |
| I-03 | Bootstrap immutability used `JSON.stringify`. | Accepted; already fixed on later `dev`. | `e6800db`, owned-field comparison tests. |
| I-04 | Sign-out did not prove session ownership. | Accepted; already fixed on later `dev`. | `295b911`, cross-user sign-out rejection test. |
| O-01 | API composition did not expose audit and entitlement database options. | Accepted; already fixed on later `dev`. | `4d3f40d`, foundation composition test. |
| M-01 | BUA dropped project scope from usage rows. | Accepted and fixed. Project IDs are persisted, indexed, reconstructed, and included in inherited reads. | `ccbb9d3`, project usage round-trip test, migration `20260803020000_bua_project_usage_scope`. |
| M-02 | Public audit reads were unbounded. | Accepted and fixed. Public event/seal reads now use limits of 1–100 and tenant-bound opaque cursors; event pages verify each immutable digest. | `a5ba31b`, `72064d6`, `bbca81c`, cursor/Prisma/HTTP tests. |
| M-03 | Direct BUA usage persistence was not transactional. | Accepted and fixed. | `a8a5a47`, transaction invocation test. |
| M-04 | Audit append loaded the complete scope history. | Accepted; already fixed on later `dev`. | `ebe73cf`, bounded duplicate/latest lookups. |
| M-05 | Audit reads allegedly verified multiple scopes as one chain. | Rejected as a false positive. The reviewed domain implementation already groups events by canonical scope before verifying each chain. | `packages/domain/src/audit/v1.ts`, multi-scope grouping in `verifyAuditChainV1`. |
| M-06 | Cookie-name validation rejected valid token characters. | Accepted and fixed. | `0615d54`, hyphenated/dotted cookie-name test. |
| M-07 | Production CSRF origins were not configured explicitly. | Accepted; already fixed on later `dev`. | `8ea5ec9`, production-origin configuration test. |
| M-08 | `GET /v1/auth/me` lacked bearer security and a regression guard. | Accepted. The endpoint annotation was already fixed; a contract-wide protected-operation guard was added. | `295b911`, `21eb825`, generated OpenAPI. |
| M-09 | Refresh response declared `refreshToken` as write-only. | Accepted and fixed. | `0483b4b`, generated-schema assertion. |
| M-10 | `sessionDatabase` composition did not create request tenant context. | Accepted and fixed with one shared session adapter instance. | `1bf5650`, foundation composition test. |
| M-11 | MFA factor activation required no factor proof. | Accepted and fixed with a fail-closed proof-verifier port. | `66a9a56`, invalid/valid proof tests. |
| M-12 | IAM membership reads loaded memberships outside the organization. | Accepted; already fixed on later `dev`. | `b7ee10a`, scoped query tests. |
| M-13 | Entitlement endpoints broke the Problem Details convention. | Accepted; already fixed on later `dev`. | `2328dd4`, HTTP problem tests. |
| M-14 | Unsafe-principal test used a malformed bearer token and asserted the wrong path. | Accepted; already fixed on later `dev`. | `44c1fae`, valid-token unsafe-principal test. |
| M-15 | Session authority outages were reported as credential rejection. | Accepted; already fixed on later `dev`. | `7c94a11`, `a62e515`, availability-boundary tests. |
| M-16 | Mutation requests fabricated idempotency keys from request IDs. | Accepted and fixed. Unsafe methods now require an explicit `Idempotency-Key`; read-only methods may use the request ID. | `85d60cc`, adapter and HTTP sign-out tests. |
| M-17 | One malformed membership row could block unrelated reads. | Accepted and fixed. Read paths skip invalid rows while mutation paths remain strict. | `259c92a`, malformed-row isolation test. |
| M-18 | `mfaRequired` should centrally block protected operations. | Rejected as proposed and retained as planned work. The field currently reports enrolled-factor presence, so blocking when true would lock out MFA-enrolled users. Endpoint risk classification and authenticated step-up assertions remain `partial` under Plan 020/IAM-012 and must be implemented as a dedicated vertical slice. | `PrismaSessionLifecycleAdapter.findPrincipal`, `MfaService.requireStepUp`, requirement traceability status. |
| M-19 | Sign-out lacked caller authorization. | Accepted; duplicate of I-04 and already fixed. | `295b911`. |
| M-20 | IAM transaction callbacks incorrectly required root `$transaction`. | Accepted and fixed with a transaction-scoped client type. | `d83eeb9`, compile-time transaction double and repository tests. |
| M-21 | Personal bootstrap chose unstable first matches and display-name markers. | Accepted and fixed. Selection now finds the unique personal organization and deterministically chooses the earliest active workspace/internal project while preserving renamed display values. | `222910a`, multi-organization and rename tests. |
| M-22 | MFA compare-and-set did not enforce the revision in the update predicate. | Accepted; already fixed on later `dev`. | `e668bd4`, stale-revision tests. |
| M-23 | Direct bootstrap save was not transactional. | Accepted; already fixed on later `dev`. | `868c573`, rollback test. |
| M-24 | Organization membership fallback selected an arbitrary workspace. | Accepted; already fixed on later `dev`. | `26ff403`, deterministic workspace selection test. |
| M-25 | Refresh fell back to the presented token when no active family token existed. | Accepted and fixed. Missing or multiple active tokens fail closed and revoke the family. | `cf47989`, missing-active-token test. |
| M-26 | Refresh ignored the session inactivity deadline. | Accepted and fixed. Session, refresh tokens, and access tokens expire atomically at the deadline. | `a5478ae`, inactivity-boundary test. |
| M-27 | MFA lifecycle timestamps were client-controlled. | Accepted and fixed. Enrollment, verification, and recovery timestamps now come from an injected server clock; forged timestamp fields are rejected. | `774d4d5`, application and HTTP tests. |
| M-28 | Response DTO `refreshToken` was marked write-only. | Accepted; duplicate of M-09. | `0483b4b`. |
| M-29 | Documented and machine-enforced commit-budget minimums disagreed. | Accepted; already fixed on later `dev`. | `2c12a91`, orchestration checker and docs. |

## Release handling

- PR #29 remains a historical promotion slice. Review fixes are applied to `dev` first, following the repository rule that feature/fix PRs target `dev` without CodeRabbit.
- Main is not considered releasable until every ordered promotion slice, including this fix branch, has landed and passed its one automatic CodeRabbit review.
- The rejected M-18 proposal does not mark IAM-012 complete; the traceability record remains `partial` until the planned step-up authorization slice is implemented and verified.
