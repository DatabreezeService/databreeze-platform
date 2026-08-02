# FND-006 CI and supply-chain evidence

Observed at (UTC): 2026-08-02
Branch: `feat/fnd003-local-infra-batch`
Task: `FND-006 — Close CI and supply-chain gaps`

## Implemented boundaries

- Path-aware scope detection treats infrastructure, tooling, contracts, plans,
  and workflows as shared quality-gate inputs.
- Every required workflow uses SHA-pinned actions, least-privilege top-level
  permissions, discarded checkout credentials, bounded runner timeouts, and
  no `pull_request_target` or long-lived AWS credentials.
- Artifact uploads fail when an expected output is missing.
- SBOM and provenance generators reject malformed output arguments; provenance
  fails closed when a declared artifact is missing and records sorted SHA-256
  subjects.
- Container image, secret-pattern, license, SBOM, and provenance checks remain
  non-deploying repository operations.

## Verification

Passed:

- `node --test tools/repo-cli/test/ci-policy.test.mjs`
- `node --test tools/repo-cli/test/provenance.test.mjs`
- `node --test tools/repo-cli/test/sbom.test.mjs`
- `node tools/repo-cli/src/check-ci-policy.mjs`
- `node tools/repo-cli/src/check-container-policy.mjs`
- `node tools/repo-cli/src/check-secret-patterns.mjs`
- `node tools/repo-cli/src/check-license-policy.mjs`
- `node tools/repo-cli/src/generate-sbom.mjs --output <temporary-file>`
- `node tools/repo-cli/src/generate-provenance.mjs --output <temporary-file> --artifact <temporary-sbom>`
- `git diff --check`

Hosted CI remains authoritative for the complete dependency, SAST, container,
OpenTofu, build, and release-environment gates. The generators never write
runtime evidence inside the repository during these checks.

The `release` environment's required reviewers and branch restrictions are
GitHub repository settings rather than workflow YAML. Before promoting to
`main`, an administrator must verify those settings and record the check in
the release evidence; the repository policy checker deliberately verifies the
workflow's environment reference but cannot infer external protection rules.

## Rollback

Revert the focused CI or generator commit that introduced the behavior, rerun
the scoped tests and `pnpm ci:policy`, then record the resulting gap before
merging. No cloud resource, credential, or customer data is changed by these
checks.
