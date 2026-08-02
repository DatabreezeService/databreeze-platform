# Engineering Foundation Reconciliation

**Evidence date:** 2026-08-02

**Source commit:** `86e72d8`

**Scope:** the merged engineering-foundation implementation and the 23 tasks in `docs/plans/010-engineering-foundation.md`.

**Requirement status:** no requirement promoted to `verified`; the foundation plan supplies only the partial coverage explicitly recorded in `docs/plans/requirement-traceability.json`.

## Reconciliation method

This record was created from the current merged `dev` checkpoint, not from an earlier model report. Each task was matched to its repository paths, tests, generated artifacts, operational documentation, and release boundary. A task is marked `reconciled` only when its repository evidence is present and the applicable fresh command passes. A task with an unavailable external tool remains `reconciled-with-limit` and cannot promote a production or infrastructure requirement.

## Task outcomes

| Task | Outcome | Evidence boundary |
|---|---|---|
| Task 1 | reconciled | Root workspace, runtime pins, package discovery, and clean bootstrap are present and covered by repository checks. |
| Task 2 | reconciled | Dependency-boundary checker and allowed/rejected fixture tests pass through the root lint gate. |
| Task 3 | reconciled | Requirement parser/index, duplicate/gap fixtures, and the 611-record checked index pass. |
| Task 4 | reconciled | Versioned base schemas, validation fixtures, and generated envelope checks pass. |
| Task 5 | reconciled | TypeScript, Kotlin, and Python generated outputs are current and parity-tested. |
| Task 6 | reconciled | Compatibility policy and 28-case cross-runtime fixture parity pass. |
| Task 7 | reconciled | Permission/tenant primitives and narrowing tests are present; persistence remains owned by later IAM work. |
| Task 8 | reconciled | Typed configuration and provider-port packages are present with public API/build tests. |
| Task 9 | reconciled | Vietnamese-first and English-complete catalogs, negotiation, formatting, and completeness tests pass. |
| Task 10 | reconciled | Three canonical DataBreeze assets and checksum gates are present; bytes remain immutable. |
| Task 11 | reconciled | Deterministic Web/Desktop/Android derivative generation, source provenance, and visual/geometry gates pass. |
| Task 12 | reconciled | Shared design tokens, CSS/TypeScript/Android outputs, contrast, reduced-motion, and drift tests pass. |
| Task 13 | reconciled | Web shell, bilingual routing, governed navigation, error boundary, accessibility, and test/build gates pass. |
| Task 14 | reconciled | Fastify API shell, readiness, correlation, Problem Details, OpenAPI, Prisma schema inventory, and tests pass. |
| Task 15 | reconciled | Electron main/preload/renderer shell, context isolation, CSP/navigation policy, and IPC boundary tests pass. |
| Task 16 | reconciled | Python `uv` project, typed action registry, framed entry points, deterministic processor, and engine checks/build pass. |
| Task 17 | reconciled | Kotlin/Compose shell, generated resources, Room/WorkManager/Keystore ports, network security, backup policy, and debug unit tests pass. |
| Task 18 | reconciled | PostgreSQL/Redis/MinIO/Mailpit/OpenTelemetry Compose definitions, health checks, and static readiness checks pass; live Docker startup is separately environment-gated. |
| Task 19 | reconciled-with-limit | AWS OpenTofu modules, alpha composition, encryption/private-network/OIDC source checks, and non-applying infrastructure check pass; OpenTofu itself is not installed locally, so format/validate remain hosted-check obligations. |
| Task 20 | reconciled | Content-safe telemetry package, correlation propagation, redaction allowlists, and hostile-attribute tests are present and covered by repository checks. |
| Task 21 | reconciled | Path-aware quality/security/release workflows, pinned actions, least-privilege permissions, SBOM/provenance, and scan definitions are present and hosted checks pass. |
| Task 22 | reconciled | Development, deployment, rollback, secret-rotation, provider-adapter, release-channel, support, and local-infrastructure runbooks are present. |
| Task 23 | reconciled | This clean-checkout record is backed by the fresh verification commands below and contains no runtime artifacts, credentials, or customer data. |

## Fresh verification evidence

The following commands were run from a clean worktree at source commit `86e72d8` after locked dependency bootstrap:

| Command | Result |
|---|---|
| `corepack pnpm install --frozen-lockfile` | Pass; lockfile and all 15 workspace projects installed. |
| `uv sync --locked --offline` in `services/engine` | Pass; locked Python 3.13 environment created. |
| `corepack pnpm repo:check` | Pass; formatting, lint, typecheck, orchestration/requirements/contract checks, repository CLI tests, and all workspace tests passed. |
| `corepack pnpm repo:build` | Pass; API, Web, Desktop, shared packages, and Python engine builds passed. |
| `apps/android/gradlew :app:testDebugUnitTest --no-daemon` from `apps/android` with the existing SDK path supplied | Pass; 27 Android debug unit-test tasks completed. |
| `corepack pnpm infra:check` | Pass; static AWS/local infrastructure checks passed without applying resources. |
| `git diff --check` | Pass; no whitespace errors. |

The repository checks include generated-contract drift, brand checksum/derivative drift, dependency boundaries, 28-case TypeScript/Python/Kotlin parity, scan policy, and the orchestration checker. The Web bundle emits its existing chunk-size advisory while remaining inside the enforced gzip budget.

## Known environment limits

- OpenTofu is not installed on this workstation. No AWS infrastructure was applied; hosted CI must run the pinned OpenTofu format/validate checks before an infrastructure PR is accepted.
- Docker is installed but live local dependency startup was not required for this reconciliation. Run `corepack pnpm local:smoke` on a healthy Docker daemon before dogfood acceptance.
- Android instrumentation/emulator testing and signed release packaging remain Plan 400 gates; the debug unit suite passed with the local SDK path supplied through `ANDROID_HOME`/`ANDROID_SDK_ROOT`.
- No customer data or credentials were used. Ignored dependency caches, virtual environments, build output, and Gradle state remain untracked.

## Release and rollback decision

FND-001 is complete as an evidence-reconciliation task. Plan 010 remains `partial-needs-reconciliation` until FND-002 through FND-007 close their independent gates and hosted OpenTofu validation is available. The next orchestration task is `FND-002`. Reverting this record and its test removes only reconciliation evidence; it does not alter application code, generated contracts, migrations, assets, or runtime state.
