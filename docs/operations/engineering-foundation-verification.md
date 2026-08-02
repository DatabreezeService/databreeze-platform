# Engineering Foundation Verification

**Evidence date:** 2026-08-02

**Scope:** clean `dev` checkout plus the Task 23 contract-drift correction

This record is a reproducible engineering-foundation check, not a claim that
business modules are implemented. It records commands, outcomes, and the
environment limits that remain explicit.

## Passed checks

| Area | Command | Result |
|---|---|---|
| JavaScript workspace | `corepack pnpm repo:check` | Pass; formatting, lint, typecheck, requirements, contracts, infrastructure policy, repository tests, and 19 Turborepo test tasks passed. |
| JavaScript builds | `corepack pnpm repo:build` | Pass; API, Web, Desktop, shared packages, and engine package build completed. |
| Contracts | `corepack pnpm --filter @databreeze/contracts contract:check` | Pass; generated models, compatibility baseline, and 28-case TypeScript/Python/Kotlin parity passed. |
| Engine | `uv sync --locked --offline`; engine test/lint/typecheck/build through the root gates | Pass; locked Python 3.13 environment and package build verified. |
| Android | `apps/android/gradlew :app:testDebugUnitTest --no-daemon` | Pass; 27 Gradle tasks completed. |
| Brand | `corepack pnpm brand:check` and design-token build checks | Pass; canonical legacy asset checksums and derivatives remain unchanged. |
| AWS/static infrastructure | `corepack pnpm infra:check`; `node tools/repo-cli/src/local-services.mjs config` | Pass; static AWS checks and daemon-free local Compose validation passed; no infrastructure or containers were applied. |

The contract drift check ignores only `uv`/Hatch editable-install products
under `generated/python/build` and `generated/python/*.egg-info`; a regression
test proves that unexpected public contract files still fail. These local build
products are never committed.

## Environment limits

- OpenTofu is not installed on this workstation, so `fmt`/`validate` were not
  executed locally. CI must run them with the pinned OpenTofu release before
  an infrastructure change is approved.
- Docker was not required for the repository gates and live local dependency
  startup was not claimed. Run `corepack pnpm local:services check` and then
  `corepack pnpm local:services restart-check` on a machine with a healthy
  Docker daemon before dogfood acceptance. See
  `foundation-local-infrastructure-2026-08-02.md` for the FND-003 boundary.
- Android instrumentation/emulator and signed release packaging are separate
  production-readiness gates; the shell unit test is the evidence recorded here.

## Cleanliness

Ignored `.venv`, Gradle, `node_modules`, `dist`, and editable-install metadata
were created only by the checks. No credentials, customer files, runtime
databases, APKs, installers, or generated reports are part of the commit.
