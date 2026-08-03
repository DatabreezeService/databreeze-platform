# CodeRabbit disposition for promotion PR 35

Promotion PR [#35](https://github.com/DatabreezeService/databreeze-platform/pull/35)
received exactly one automatic CodeRabbit review
(`9880ed80-ef8e-4545-8823-97499ec88913`) for its promotion range. CodeRabbit
was not invoked again. The review's ten actionable inline comments, two
outside-diff claims, and review-body suggestions were reproduced against the
current `dev`-bound fix branch before disposition.

## Actionable inline comments

| ID | Claim | Disposition | Evidence |
|---|---|---|---|
| CR35-01 | The platform-program branch/PR budget still described the old 30–70 policy. | Accepted and fixed. | `ed1e130` aligns the normal 30–50, exceptional-under-79, and 280 hard-stop language. |
| CR35-02 | The Luna handoff runbook repeated stale 30–70/99/280 limits. | Accepted and fixed. | `ed1e130` aligns the runbook with the same branch and promotion limits. |
| CR35-03 | Audit event pagination must preserve scope key, chain sequence, and deterministic event identity. | Accepted and fixed. | `f381341`, `66b3548`, and `68632db`; both adapters use the canonical ordering and forged-cursor regressions pass. |
| CR35-04 | An invalid audit chain must not be reported as a retryable outage. | Accepted and fixed. | `2406de7` and `00e688c`; integrity failures map to a non-retryable 500 problem without the raw chain marker. |
| CR35-05 | Membership writes could treat a cross-organization identifier collision as a generic uniqueness error. | Accepted and fixed. | `28268b1` and `cf159c7`; identity lookup is organization-independent before the scope guard and P2002 races map to `IAM_REVISION_CONFLICT`. |
| CR35-06 | Bootstrap could silently discard malformed non-null membership timestamps. | Accepted and fixed. | `f93d44e` and `f8f7747`; invalid `startsAt`/`expiresAt` values are rejected and covered. |
| CR35-07 | MFA revision conflicts need an explicit HTTP conflict response. | Accepted and fixed. | `1c4ef10` and `3a7bcae`; `IAM_MFA_REVISION_CONFLICT` maps to HTTP 409. |
| CR35-08 | Request-context resolution was inside the sign-out catch and could hide authentication failures. | Accepted and fixed. | `3197edd` and `b513053`; the HTTP contract preserves `AUTHENTICATION_FAILED`. |
| CR35-09 | Device problem-message keys were absent from the bilingual catalogs. | Accepted and fixed. | `dd5ad9a` and `6e318ff`; all five device keys now exist in Vietnamese and English and are required by the catalog test. |
| CR35-10 | The migration test should exercise existing-session migration behavior. | Rejected as an unsafe backfill request; the safe migration contract was strengthened. | The migration explicitly has no legacy-data migration because tenant scope cannot be inferred safely. `366d787` resolves the migration by stable name and asserts that no unsafe backfill is present. Existing sessions must be recreated under the locked no-legacy-migration assumption. |

## Outside-diff claims

| ID | Claim | Disposition | Evidence |
|---|---|---|---|
| CR35-OD-01 | `GET /v1/entitlements/usage` should publish a success response schema. | Accepted and fixed. | `1add34b`; the generated OpenAPI now declares the usage page shape. |
| CR35-OD-02 | `GET /v1/entitlements/snapshots/{snapshotId}` should publish a success response schema. | Accepted and fixed. | `1add34b`; the generated OpenAPI now declares the snapshot success shape. |

## Review-body suggestions

The following suggestions were also considered. Accepted suggestions are
implemented in the cited commits; suggestions that conflict with the locked
architecture are explicitly rejected rather than implemented speculatively.

| Suggestion | Disposition |
|---|---|
| Do not cite reconciliation evidence for planned traceability rows. | Accepted: `ca2df3d` separates planned entries from reconciled evidence. |
| Resolve migrations by stable name rather than an inventory index. | Accepted: `366d787`. |
| Centralize the BUA reservation transition invariant. | Accepted: `bbe0723` and `67790d2`; both adapters call one application policy and a direct policy test protects it. |
| Add forged audit-cursor coverage. | Accepted: `68632db`. |
| Add an audit-seal descendant scheduler and alerting loop. | Rejected for this slice: the current AUD contract has no active-scope scheduler port or alert ownership; inventing one would bypass the ordered audit/sealing plan. Deferred to the AUD sealing task. |
| Add a page response schema to the audit controller. | Accepted: `89002da`; generated OpenAPI includes the bounded page envelope. |
| Share the audit page-offset validator and maximum. | Accepted: `e640373`. |
| Document the audit ordering contract. | Accepted: `66b3548` and `89002da`; the port and API docs state the chain ordering. |
| Remove unused transaction-level audit list methods. | Accepted: `66b3548`; the transaction port no longer exposes unrelated enumeration methods. |
| Share the canonical tenant scope-key helper. | Accepted: `f381341` and `3412961`. |
| Flatten inherited BUA usage reads and avoid one query per scope. | Accepted: `fa42a5f`; one `scopeKey IN (...)` query is issued per record family. |
| Add query-count/performance regression coverage for inherited usage. | Accepted: `e9f0f90`. |
| Share the IAM session-revocation lifecycle. | Accepted: `e33ad17` and `9888494`; repeated revocation preserves the original timestamp. |
| Add safe malformed-membership diagnostics. | Accepted: `663fdbc`, `aab57cb`, and `f7fa8d3`; malformed rows are skipped, diagnostics are best-effort, and the fixture remains visible to the scoped query. |
| Push IAM membership visibility into the database query and preserve scoped reads. | Accepted: `56df707` and `0e13e95`; the adapter emits organization/workspace/project predicates and tests inspect them. |
| Share membership-authority selection across adapters. | Accepted: `f54976d` and `d8a2f13`. |
| Test two personal organizations and reject ambiguity. | Accepted: `f93d44e` and `f8f7747`. |
| Batch bootstrap organization lookup. | Accepted: `f93d44e` and `f8f7747`; candidates are selected with one bounded `findMany`. |
| Export cookie parser limits for fixtures and test exact boundaries. | Accepted: `25f9017` and `3a94fb5`. |
| Backfill existing sessions in the scope-binding migration. | Rejected: inferring organization/workspace from a legacy session is unsafe and contradicts the repository's explicit no-legacy-data assumption. `366d787` tests that the migration preserves this guard. |
| Change audit ordering to created-at/ID ordering. | Rejected: chain pagination must follow the persisted per-scope sequence and deterministic event ID so cursor pages reconstruct the verified chain. |

The accepted changes are collected on
`fix/coderabbit-pr-35-reconciliation` and will enter `dev` through its focused
fix PR. Promotion PR 35 remains a single-review, immutable review packet; no
second CodeRabbit run will be requested for it.
