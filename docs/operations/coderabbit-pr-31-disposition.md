# CodeRabbit PR 31 Disposition

Date: 2026-08-03
Promotion PR: [#31](https://github.com/DatabreezeService/databreeze-platform/pull/31)
Automatic review ID: `4842552845`
Reviewed range: `8695eed4bd5b988af9f4bea17e724ef5e1ac101d..688896af0af45281f8d9f379837d95abed04ac6c`

CodeRabbit ran once automatically on the promotion PR. No manual review or rerun was requested. All 32 code findings were reproduced against the current `dev` state: 29 were accepted and fixed with regression coverage, and 3 were rejected after checking the later invariants and public result types.

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| I-01 | Request input could replace the repository-loaded artifact during admission. | Accepted and fixed. The trusted artifact is applied last and a runtime-key injection regression test proves the stored version remains authoritative. | `68e0e4a` |
| I-02 | XLSX XML members were fully decompressed before the size check. | Accepted and fixed. XML members now use a bounded `ZipExtFile` read and tests reject use of unbounded `ZipFile.read`. | `069c0cd` |
| O-01 | Prisma intake and export fixtures accepted duplicate primary keys. | Accepted and fixed. Both fixtures now emulate Prisma `P2002` behavior. | `718b406` |
| M-01 | Sparse quality `stateCounts` could raise `KeyError`. | Accepted and fixed with zero defaults and a sparse-profile regression test. | `5ed2cb4` |
| M-02 | Spreadsheet `blockedReasons` accepted duplicates. | Accepted and fixed with `ArrayUnique`. | `96553d0` |
| M-03 | A direct in-memory spreadsheet-audit save could be discarded by transaction rollback. | Accepted and fixed. Public saves use the transaction queue and callbacks use unwrapped helpers. | `6d67783` |
| M-04 | Spreadsheet-audit `createdAt` accepted non-UTC timestamps. | Accepted and fixed with strict ISO validation and an uppercase-`Z` timestamp pattern. | `8b31681` |
| M-05 | Several request arrays lacked matching runtime and OpenAPI bounds. | Accepted and fixed for version IDs, fields, mapping steps, rules, artifact inputs, evidence IDs, and findings. | `3bfe600` |
| M-06 | The intake transition test did not verify the persisted revision. | Accepted and fixed. | `fd508f9` |
| M-07 | Inbox content-leak assertions were case-sensitive. | Accepted and fixed. | `812e0c5` |
| M-08 | Readiness 503 responses documented the wrong media type. | Accepted and fixed as `application/problem+json`, with a generated-contract assertion. | `42ff542` |
| M-09 | Expired upload transfer requests were reported as generic storage unavailability. | Accepted and fixed with `UPLOAD_SESSION_EXPIRED`. | `f4af924` |
| M-10 | Export processor-version text was validated before normalization and trimming. | Accepted and fixed; empty normalized text is rejected and valid trimmed text is retained. | `e5c4976` |
| M-11 | Aggregate public API smoke coverage omitted retention and export schema versions. | Accepted and fixed. | `533e7b7` |
| M-12 | The dataset-profile negative test allegedly mixed a sampling error with its count error. | Rejected. `samplingMethod` is required for both completeness modes; the fixture removes only the sample seed when switching to `COMPLETE`, so the first negative case already isolates `INVALID_COUNT`. Clearing `samplingMethod` would create the ambiguity the comment sought to remove. | `packages/domain/test/dataset-profile-v1.test.mjs` |
| M-13 | The spreadsheet value-free test inspected the manifest root rather than the finding. | Accepted and fixed. | `eec8df5` |
| M-14 | Premature upload expiration returned `EXPIRED`. | Accepted and fixed as `INVALID_TIMESTAMP`. | `6173abf` |
| M-15 | Spreadsheet finding parser errors collapsed into `INVALID_COUNT`. | Accepted and fixed. Coordinate, kind, severity, identifier, and hash errors now retain their structural codes. | `3f769e2` |
| M-16 | The upload completion test read `.value` without proving acceptance. | Accepted and fixed. | `adb45ef` |
| M-17 | Premature protected-document expiration returned `EXPIRED`. | Accepted and fixed as `INVALID_STATE`. | `d477368` |
| M-18 | Dataset profiles allowed `rowCountScanned` above `resourceLimits.maxRows`. | Accepted and fixed. | `afb3fdc` |
| M-19 | Spreadsheet `maxRow` stopped below the XLSX row limit. | Accepted and fixed across domain validation, DTO validation, and generated OpenAPI at 1,048,576. | `3311f2a` |
| M-20 | Inbox mutation context contained an unreachable conditional branch. | Accepted and simplified after the existing undefined guard. | `4a4c781` |
| M-21 | Prisma export saves lacked visibility-safe collision handling, transaction-wrapped direct saves, and create-race translation. | Accepted and fixed with tenant-safe checks and stable immutable-manifest errors. | `34495dd` |
| M-22 | Artifact-lineage lookup should use `findMany` to select a visible row. | Rejected against current `dev`. Later commits `68e69df` and `6431c9a` enforce one globally unique lineage per derived version; the unique lookup then checks tenant visibility. `findMany` would weaken that invariant and conceal duplicate persisted state. | `services/api/src/features/iae/adapter/prisma-artifact-lineage-repository.adapter.ts` |
| M-23 | Retention and content-placement service-only error unions omitted domain result codes. | Rejected. `ArtifactRetentionServiceResultV1` already includes `ArtifactRetentionResultV1`, and `ContentPlacementServiceResultV1` already includes `ArtifactResultV1`; both public unions therefore expose the cited codes without duplicating them in their service-only error aliases. | Service result type definitions |
| M-24 | The default request-tenant-context adapter produced a generic 500. | Accepted and fixed. The shared problem error now maps the unconfigured provider to retryable `AUTHENTICATION_UNAVAILABLE`/503. | `5c0b1d4` |
| M-25 | Artifact admission accepted fractional byte sizes at the DTO boundary. | Accepted and fixed with integer runtime validation and OpenAPI type. | `b6603eb` |
| M-26 | Artifact-export controllers returned failed service envelopes with HTTP 200. | Accepted and fixed. Invalid requests map to 400 problems and missing resources to 404 problems. | `c59b5b0` |
| M-27 | Retention and inbox date-time DTOs accepted date-only or offset values. | Accepted and fixed with strict ISO/UTC validation while preserving nullable inbox `dueAt`. | `ea3c4ed` |
| M-28 | DSM immutable repositories leaked Prisma create races. | Accepted and fixed for dataset profiles, quality results, and dataset versions by translating `P2002` into their stable immutable error codes. | `bc9e266` |
| M-29 | Dataset quality safe values accepted objects and arrays despite the scalar OpenAPI contract. | Accepted and fixed with a finite scalar validator and an object-injection regression test. | `e634d65` |

## Release handling

- Fixes are applied through a dedicated PR to `dev`; CodeRabbit is not invoked on that PR.
- After the fix PR merges, the two critical inline discussions receive the fixing commit references and the promotion PR receives a link to this disposition.
- PR #31 remains a historical promotion slice. It receives no second CodeRabbit run and is merged only after the repair PR and required checks pass.
- The generic docstring-coverage warning was not treated as a code finding: it did not identify a changed runtime defect, and bulk comments would add noise without improving the reviewed behavior.
