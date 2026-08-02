# Engineering Foundation Implementation Plan

**Status:** Approved<br>
**Parent:** `000-platform-program.md`<br>
**Branch:** `feat/platform-foundation`

## Outcome

Create the reproducible monorepo foundation required by Stage 0 of the product roadmap. This plan introduces no customer workflow or production data migration. It establishes tested build, contract, brand, application-shell, infrastructure, observability, security, and delivery boundaries on which every normative requirement will depend.

## Global constraints

- Node.js 24 LTS, pnpm/Corepack, Turborepo, strict TypeScript, Python 3.13 through `uv`, JDK 21, PostgreSQL 17, and Redis 7.4 are pinned by repository-controlled configuration.
- Web and Desktop may share React packages. Android consumes generated contracts and tokens but remains native Kotlin/Compose.
- Clients never import service implementation packages.
- No client or processing worker receives database credentials.
- Generated artifacts must be reproducible and checked for drift in CI.
- New behavior follows test-first red/green/refactor development.
- Canonical legacy brand sources retain their exact bytes and documented SHA-256 values.
- No secret, credential, runtime database, customer file, generated report, signing key, APK, or installer is committed.

## Tasks

### Task 1: Root workspace and runtime pins

Create the root pnpm/Turborepo workspace, package scripts, TypeScript base configurations, editor-neutral formatting/linting configuration, runtime-version files, and package-manager pin. Add a smoke test that validates workspace package discovery and runtime policy. Commit as `chore(repo): bootstrap the monorepo toolchain`.

### Task 2: Repository dependency-boundary enforcement

Add executable checks that prevent clients from importing service implementations, prevent feature-to-feature persistence imports, and require public package exports. Cover allowed and rejected fixture graphs before enabling the check in root `lint`. Commit as `test(architecture): enforce repository dependency boundaries`.

### Task 3: Requirement traceability tooling

Implement a read-only parser that discovers all stable requirement IDs, rejects duplicates or malformed priorities, and produces a deterministic traceability index. Add fixtures for duplicates, gaps, and valid documents, then generate the initial index for all 611 requirements. Commit as `feat(traceability): index normative requirements`.

### Task 4: Contract source layout and base envelopes

Create versioned JSON Schemas for UUID identifiers, UTC timestamps, revisions, tenant scope, correlation metadata, RFC 7807-compatible problems, idempotent commands, cursor pages, and the canonical event envelope. Test valid and invalid examples with a standards-compliant validator. Commit as `feat(contracts): define shared protocol envelopes`.

### Task 5: Cross-language contract generation

Create deterministic generators and generated-package layouts for TypeScript, Kotlin, and Python. Add a drift command that regenerates into a temporary directory and byte-compares outputs. Commit as `feat(contracts): generate typescript kotlin and python models`.

### Task 6: Contract compatibility and fixture package

Add schema compatibility policy, shared valid/invalid protocol fixtures, and consumer tests proving all three generated model sets accept and reject equivalent payloads. Commit as `test(contracts): enforce cross-language parity`.

### Task 7: Permission and tenant-scope primitives

Create versioned permission constants, the six initial role bundles, tenant-scope value objects, and deny-by-default helpers without implementing IAM persistence. Test narrowing and cross-scope rejection. Link IAM-001 through IAM-004, IAM-009, and IAM-019 as partial foundation coverage. Commit as `feat(permissions): add scoped authorization primitives`.

### Task 8: Configuration and provider ports

Create typed configuration loading with explicit development/test/preview/staging/production profiles and ports for object storage, email, push, OCR, AI, payments, telemetry, and secrets. Reject missing production configuration and unknown keys. Commit as `feat(config): define portable provider boundaries`.

### Task 9: Vietnamese and English terminology package

Create the canonical `vi-VN` and `en` message catalogs, locale negotiation, formatting helpers, and completeness tests. Vietnamese is the default and missing keys fail CI. Commit as `feat(i18n): establish complete bilingual catalogs`.

### Task 10: Immutable legacy brand sources

Copy the three canonical named logo files into the design-system source directory. Add a manifest containing dimensions, intended use, and the approved SHA-256 hashes, plus a checksum test that fails on byte changes. Commit as `feat(brand): preserve canonical databreeze assets`.

### Task 11: Reproducible brand derivatives

Build a deterministic image pipeline for Web favicons/social assets, Desktop icons, and Android launcher/notification sources. Preserve aspect ratio, colors, and safe zones; prohibit wordmark duplication. Add dimension, checksum, and visual-regression fixtures. Commit as `feat(brand): generate platform logo derivatives`.

### Task 12: Design tokens and accessible UI primitives

Create shared color, typography, spacing, motion, focus, status, and logo-usage tokens. Export TypeScript/CSS and generated Android resources. Add contrast, reduced-motion, and generation-drift tests. Commit as `feat(design-system): add shared accessible tokens`.

### Task 13: Web application shell

Create the React/Vite shell with React Router, TanStack Query, Tailwind, accessible primitives, bilingual routing/layout, error boundaries, and placeholder authenticated navigation. Add Vitest/Testing Library and Playwright smoke coverage. Commit as `feat(web): create the governed workspace shell`.

### Task 14: Control-plane API shell

Create the NestJS/Fastify modular-monolith shell, health/readiness endpoints, request correlation, RFC 7807 errors, structured validation, OpenAPI generation, Prisma multi-schema layout, and domain boundary structure. Test boot, validation, and error behavior. Commit as `feat(api): create the modular control plane shell`.

### Task 15: Windows Desktop security shell

Create the Electron/React/Vite shell with sandboxing, context isolation, disabled Node integration, restrictive navigation/CSP, a versioned allowlisted preload API, local-state abstraction, and sidecar lifecycle port. Add security preference and IPC rejection tests. Link DSK-001, DSK-002, and DSK-008 as partial coverage. Commit as `feat(desktop): create the secure local agent shell`.

### Task 16: Python engine shell

Create the `uv` project, Pydantic protocol models, versioned action-manifest registry, deterministic handler interface, framed JSON-RPC entry point, cloud-worker entry point, Ruff/type/pytest configuration, and a test processor. Test malformed frames, unsupported actions, deterministic output, and resource metadata. Commit as `feat(engine): create the typed processing runtime`.

### Task 17: Native Android shell

Create the Gradle wrapper/version catalog and Kotlin/Compose application with bilingual resources, navigation, Room/WorkManager boundaries, Keystore and sync ports, network security configuration, backup exclusions, and baseline unit/instrumentation tests. Commit as `feat(android): create the offline companion shell`.

### Task 18: Local development infrastructure

Create Docker Compose definitions for PostgreSQL 17, Redis 7.4, MinIO, Mailpit, and an OpenTelemetry collector. Add health checks, an isolated project network, named development volumes, `.env.example`, initialization scripts without credentials, and lifecycle commands for daemon-free config validation, safe start/stop/reset, port and disk preflight, status, and restart-persistence checks. Commit as `feat(infra): add portable local dependencies`.

### Task 19: AWS OpenTofu foundation

Create reusable OpenTofu modules and environment compositions for AWS Singapore networking, S3/CloudFront Web hosting, ECS API/worker services, RDS, ElastiCache, KMS, Secrets Manager, logs, and GitHub OIDC. Use safe alpha defaults and explicit production scaling/PITR variables. Validate and lint without applying. Commit as `feat(infra): define the portable aws baseline`.

### Task 20: Shared observability and safe diagnostics

Create structured logging, correlation propagation, OpenTelemetry conventions, safe attribute allowlists, and content-redaction tests shared by API, Web, Desktop, Android, and engine adapters. Commit as `feat(observability): establish content-safe telemetry`.

### Task 21: Continuous integration and supply-chain gates

Create path-aware GitHub Actions for format, lint, typecheck, contract drift, unit/integration tests, builds, SBOM, dependency/license/secret scanning, container scanning, and release provenance. Workflows use least-privilege permissions and no long-lived AWS keys. Commit as `ci: add monorepo quality and security gates`.

### Task 22: Developer workflow and operational foundations

Document clean-checkout setup, branch/commit/PR policy, local services, contract changes, troubleshooting, provider adapters, release channels, and initial deployment/rollback/secret-rotation runbooks. Commit as `docs: document foundation development and operations`.

### Task 23: Clean-checkout verification and release evidence

Run the complete root verification from a clean worktree, build each deployable, regenerate contracts/assets, validate Compose and OpenTofu, and record requirement/test/build evidence without committing runtime artifacts. Fix only failures within this plan. Commit any necessary corrections in narrowly scoped `fix(...)` commits, then prepare the pull request to `dev`.

## Acceptance and rollback

- One documented bootstrap path prepares every available toolchain.
- Root format, lint, typecheck, contract, unit, integration, and build commands exit successfully.
- Web, API, Desktop, engine, and Android empty deployables build independently.
- Local dependencies reach healthy state and can be torn down without deleting user-owned files.
- Contract and brand regeneration is reproducible and drift-free.
- CI uses synthetic fixtures only and emits no secrets or customer content.
- Every task is a separate rollback unit. Reverting an application shell must not remove shared contracts used by another completed shell.
- AWS resources are not applied by this plan; rollback is therefore repository reversion plus removal of local disposable containers/volumes when explicitly requested.

## Deferred requirements

All business workflows and persistent IAM/IAE/DSM/JRA/DSO/NCO/INT/BUA/AUD behavior beyond the explicitly named primitives remain deferred to the subsequent child plans. A passing engineering-foundation build does not mark those requirements implemented.
