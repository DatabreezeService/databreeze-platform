# CodeRabbit PR #37 disposition

Review run: `d034f311-c043-4139-8372-ed69b774a83f`  
Review policy: one automatic review run for this promotion PR; no rerun.

All seven inline findings were valid and are addressed below. The review also
included a general walkthrough/docstring coverage warning; it was not adopted
because the repository has no accepted coverage threshold for that warning and
the promotion gate is the executable repository check plus focused tests.

| Comment | Disposition | Fix commit | Evidence |
| --- | --- | --- | --- |
| OpenTofu README init should use `-lockfile=readonly` | Accepted | `7be00e3` | `infrastructure/aws/README.md` documents the locked native initialization command. |
| OpenAPI timestamp and integer schemas did not match runtime validation | Accepted | `1790f0d`, `8622586`, `4aecc99` | DTO patterns/types, regenerated `services/api/openapi/v1.json`, and parity assertions in `services/api/test/openapi.test.ts`. |
| Duplicate derived lineage P2002 escaped the repository port | Accepted | `dff8f01`, `2ded1f7` | P2002 maps to `IAE_DERIVED_LINEAGE_CONFLICT`; repository-save race test covers the path. |
| OpenTofu version checks allowed leading-zero components | Accepted | `2ff9018`, `1ff27ff` | Both validators use strict SemVer components; acceptance/rejection cases are tested. |
| Validation help/success wording understated the mocked plan test | Accepted | `7be00e3`, `238f619` | Help and source assertions describe mocked plan testing and no apply. |
| OpenTofu source mount was writable | Accepted | `7be00e3`, `238f619` | The container source bind is explicitly `readonly`; the test asserts the mount. |
| Infrastructure test did not verify the read-only mount | Accepted | `238f619` | Test asserts the mount, README lockfile option, and safety wording. |

No review comment authorized applying infrastructure or changing provider
boundaries; those remain outside this promotion slice.
