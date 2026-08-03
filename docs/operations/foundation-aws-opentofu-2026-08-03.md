# FND-004 portable AWS validation evidence

Observed at (UTC): 2026-08-03T08:43:33Z

Task: `FND-004 — Close portable AWS foundation gaps`

## Verified boundary

- OpenTofu is pinned to `1.12.5`; the official container image is
  `ghcr.io/opentofu/opentofu:1.12.5`.
- The alpha composition locks the signed `hashicorp/aws` provider at `6.0.0`
  and initialization treats the lock file as read-only.
- Official formatting covers every module, environment file, and OpenTofu test.
- Backend-disabled initialization and configuration validation run with provider
  data isolated outside the repository.
- A mocked plan exercises the Singapore alpha composition without AWS
  credentials or provider API calls. It verifies that NAT, managed data, ECS
  services, CloudFront, and GitHub deployment trust remain disabled by default.
- Static tests continue to verify private networking, encryption, recovery,
  least-privilege OIDC scope, production image digests, destroy protection, and
  the absence of credentials or state backends.

## Commands and results

Passed:

- `node --test tools/repo-cli/test/aws-infrastructure.test.mjs`
- `corepack pnpm infra:check`
- `corepack pnpm infra:validate`
- OpenTofu `fmt -check -recursive`
- OpenTofu `init -backend=false -input=false -lockfile=readonly -no-color`
- OpenTofu `validate -no-color`
- OpenTofu `test -no-color`: one mocked plan passed

The first provider download ended with `unexpected EOF`; a fresh isolated retry
installed the same locked, signed provider successfully. No source or lock drift
was accepted from that transient failure.

## Safety and rollback

No AWS credentials were loaded, no remote state backend was configured, and no
real plan or apply command ran. Provider caches were created under a guarded
temporary directory and removed after validation.

Rollback is source-only: revert the version pin, provider lock, formatter,
runner, and plan-test commits together, then restore FND-004 to `implemented` in
the execution ledger. Reverting does not change any AWS resource because this
slice created none.
