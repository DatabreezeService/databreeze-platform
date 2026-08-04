# CodeRabbit PR #37 disposition

Review run: `d034f311-c043-4139-8372-ed69b774a83f`
Review policy: one automatic review run for this promotion PR; no rerun.

After the fixes were pushed, the CodeRabbit app automatically queued a
follow-up status check (`6fd78011-f34d-414f-a9a8-2a696e772375`). No review was
manually invoked; its two additional findings were verified and included below.

All seven inline findings were valid and are addressed below. The same review
body also contained three outside-diff findings and two nitpicks. Those were
verified against the current code and addressed where they described an
observable correctness, isolation, or test gap. The general walkthrough/
docstring coverage warning was not adopted because the repository has no
accepted coverage threshold for that warning and the promotion gate is the
executable repository check plus focused tests.

| Comment | Disposition | Fix commit | Evidence |
| --- | --- | --- | --- |
| OpenTofu README init should use `-lockfile=readonly` | Accepted | `7be00e3` | `infrastructure/aws/README.md` documents the locked native initialization command. |
| OpenAPI timestamp and integer schemas did not match runtime validation | Accepted | `1790f0d`, `8622586`, `4aecc99` | DTO patterns/types, regenerated `services/api/openapi/v1.json`, and parity assertions in `services/api/test/openapi.test.ts`. |
| Duplicate derived lineage P2002 escaped the repository port | Accepted | `dff8f01`, `2ded1f7` | P2002 maps to `IAE_DERIVED_LINEAGE_CONFLICT`; repository-save race test covers the path. |
| OpenTofu version checks allowed leading-zero components | Accepted | `2ff9018`, `1ff27ff` | Both validators use strict SemVer components; acceptance/rejection cases are tested. |
| Validation help/success wording understated the mocked plan test | Accepted | `7be00e3`, `238f619` | Help and source assertions describe mocked plan testing and no apply. |
| OpenTofu source mount was writable | Accepted | `7be00e3`, `238f619` | The container source bind is explicitly `readonly`; the test asserts the mount. |
| Infrastructure test did not verify the read-only mount | Accepted | `238f619` | Test asserts the mount, README lockfile option, and safety wording. |

## Outside-diff and nitpick follow-ups

| Finding | Disposition | Fix commit | Evidence |
| --- | --- | --- | --- |
| `DatasetQualitySafeValueDto.value` skipped validation for `null` | Accepted | `3d27012` | `ValidateIf` keeps `undefined` optional while rejecting `null`; the controller test covers the nested null payload. |
| DSM version/profile/quality saves decoded a sibling row before checking visibility | Accepted | `ffcaffb` | All three Prisma adapters check tenant visibility before `rowToDomain`; malformed sibling-row tests expect the stable immutable error. |
| Upload transfer issuance could use a stale session around expiry | Accepted | `7da3e77` | Issuance runs in the repository transaction, re-reads the session, aborts the storage grant on state/revision change, and has a simulated expiry race test. |
| Android telemetry tests did not assert exception causes were absent | Accepted | `6324072` | Tests assert both provider-backed exception causes are `null`. |
| Prisma P2002 predicates were duplicated across feature adapters | Accepted | `7255556` | The predicate now lives in `src/platform/prisma-error.ts`; DSM and IAE adapters share it. |

## Automatic follow-up findings

| Finding | Disposition | Fix commit | Evidence |
| --- | --- | --- | --- |
| Lineage P2002 handling treated every unique conflict as a derived-version conflict | Accepted | final review-fix commit | P2002 `meta.target` distinguishes `id` from `derivedArtifactVersionId`; same-ID races re-run immutable comparison and have a regression fixture. |
| `AdmitArtifactDto.maxByteSize` was documented as a number despite `@IsInt()` | Accepted | final review-fix commit | DTO metadata, regenerated OpenAPI, and assertions now document both byte-size fields as integers. |

No review comment authorized applying infrastructure or changing provider
boundaries; those remain outside this promotion slice.
