# CodeRabbit disposition for promotion PR 33

Promotion PR [#33](https://github.com/DatabreezeService/databreeze-platform/pull/33)
received exactly one automatic CodeRabbit review (`4843018511`) for the
historical range `56011dc633fe8d999d96a6ea26fdc64319447a8e..12d92716ad287544e0d6149925e0496273306d51`.
The review contained seven inline findings and eight review-body findings. Each
claim was reproduced against current `dev` before disposition. CodeRabbit was
not invoked again.

| ID | Claim | Disposition | Evidence |
|---|---|---|---|
| CR33-01 | Spreadsheet evidence lookup compared canonical coordinates with an unnormalized geometry name. | Accepted and fixed. | `2886d00`; domain regression for a whitespace-normalized sheet name. |
| CR33-02 | Placement mutation authorized the caller-supplied scope instead of the persisted placement scope. | Accepted and fixed in both adapters. | `4c8bd91`; Prisma and in-memory sibling-workspace mutation regressions. |
| CR33-03 | In-memory MFA state allowed record removal and invalid initial revisions. | Accepted and fixed to match the Prisma invariants. | `677d981`; factor and recovery-code removal/new-revision regressions. |
| CR33-04 | Prisma MFA updates were not revision-conditional. | Rejected as already resolved on current `dev`. | `e668bd4` uses `updateMany` with the prior revision and requires `count === 1` for factors and recovery codes; existing race tests pass. |
| CR33-05 | The lineage repository test double did not enforce the derived-version unique constraint. | Accepted and fixed. | `924c48b`; the fake reports a Prisma-style `P2002` and retains one row. |
| CR33-06 | The migration test asserted only the lineage index name. | Accepted and fixed. | `55d0c6c`; the assertion binds the unique index, schema-qualified relation, and column. |
| CR33-07 | Formula-gap detection paired rows before grouping by formula family. | Accepted and fixed. | `151524e`; a different intervening formula now produces the expected value-free gap finding. |
| CR33-08 | The public Prisma artifact adapter dropped an optional scan state. | Accepted and fixed. | `843a85d`; direct adapter regression proves `PENDING` to `CLEAN` persistence. |
| CR33-09 | Capability and grant replacements did not require exactly one revision step. | Accepted and fixed. | `5a9cff1`; invalid same/skipped revisions fail with `DSO_REVISION_CONFLICT`. |
| CR33-10 | Quarantined evidence could resolve to a live placement handle. | Accepted and fixed. | `0fc77d6`; quarantined cloud evidence resolves only to `UNAVAILABLE`. |
| CR33-11 | The bootstrap test passed the base client as its transaction client. | Accepted and strengthened. | `454043b`; a distinct transaction client records all four hierarchy writes. |
| CR33-12 | The application composition test did not prove audit and entitlement option forwarding. | Accepted and strengthened. | `71acbc9`; child-module providers retain the exact repository identities. |
| CR33-13 | The lineage unique index should be built concurrently. | Rejected for this migration stage. | Plan 010 introduces no customer workflow or production data migration; ADR-0002 uses ordinary Prisma SQL migrations. `CREATE INDEX CONCURRENTLY` cannot run in Prisma's ordinary transactional migration path, while the production expand/migrate/verify/contract gate remains in Plan 400. |
| CR33-14 | A retention test could pass without asserting failed authorization. | Accepted and strengthened. | `32b6ace`; the unexpected result branch now fails explicitly. |
| CR33-15 | `requestedBy` remained required although attribution uses the authenticated actor. | Accepted and fixed compatibly. | `9702160`; the field is optional/deprecated, omission succeeds, generated OpenAPI records authenticated attribution. |

The generic docstring-coverage warning is informational rather than a repository
gate: DataBreeze has no accepted 80% docstring requirement, and adding comments
solely to satisfy an external heuristic would not repair behavior. Existing
documentation and lint/type/test gates remain authoritative.

The accepted changes are collected on `fix/coderabbit-promotion-33`. They are
not pushed directly into the historical promotion branch, so PR 33's reviewed
commit range remains immutable. They will enter `dev` through the next
30–50-commit feature batch and reach `main` through a later single-review
promotion slice.
