# Monorepo Structure and Dependency Rules

**Status:** Product specification<br>
**Version:** 1.0

## 1. Repository Decision

DataBreeze is developed in one clean repository named `databreeze-platform`. The legacy backend and frontend repositories are archived after selected behavior, fixtures, and brand assets are evaluated.

One repository does not imply one release. Each application and service has an independent build, test, version, artifact, and deployment pipeline.

## 2. Required Layout

```text
databreeze-platform/
├── apps/
│   ├── web/                    React + TypeScript
│   ├── desktop/                Electron main/preload/renderer
│   └── android/                Kotlin + Jetpack Compose
├── services/
│   ├── api/                    NestJS + Fastify control plane
│   └── engine/                 Python package and cloud worker
├── packages/
│   ├── api-client/             Generated TypeScript client
│   ├── contracts/              OpenAPI, JSON Schema, events, typed jobs
│   ├── domain/                 Pure shared TypeScript value logic
│   ├── validation/             Client-side Zod schemas
│   ├── ui/                     Web/Desktop React components
│   ├── design-tokens/          Platform-neutral visual tokens
│   ├── i18n/                   Vietnamese and English catalogs
│   ├── telemetry/              Event names and safe metadata
│   └── test-fixtures/          Synthetic cross-runtime fixtures
├── infrastructure/
│   ├── local/                  Docker Compose and emulators
│   ├── environments/           Deployment definitions
│   └── observability/          Dashboards, alerts, and collectors
├── tools/
│   ├── repo-cli/               Cross-platform repository commands
│   ├── contract-generation/
│   └── fixture-validation/
├── docs/
├── .github/workflows/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## 3. Toolchain Ownership

| Area | Tooling |
|---|---|
| TypeScript workspace | `pnpm` with Corepack and Turborepo |
| Node version | Active LTS pinned in the repository and CI |
| Android | Gradle wrapper, version catalog, and Java toolchain pinned by the project |
| Python | `uv`, locked dependencies, Ruff, mypy or Pyright, pytest |
| API schema | OpenAPI generated from the API build and compatibility checked |
| Jobs/events | Canonical JSON Schema with generated TypeScript, Kotlin, and Pydantic models |
| Cross-repo commands | A TypeScript `tools/repo-cli` so Windows and CI use the same orchestration |

Exact dependency versions live in lockfiles and automated update policy, not in product specifications. Production uses supported release lines and scheduled upgrade windows.

## 4. Dependency Direction

Allowed dependencies:

```text
apps/web ---------> packages/*
apps/desktop -----> packages/*
services/api -----> packages/contracts, selected pure packages
apps/android -----> generated Kotlin contracts + design token outputs
services/engine --> generated Pydantic contracts + fixtures
```

Prohibited dependencies:

- A client importing API implementation code.
- The API importing Web or Desktop packages.
- Android importing generated JavaScript or depending on a Node runtime.
- Python importing application source from TypeScript.
- A feature module importing another feature’s database adapter.
- `packages/domain` performing network, filesystem, database, or framework work.
- Hand-maintained duplicate API models when generation is available.

## 5. API and Contract Workflow

1. API code and canonical job/event schemas change in the same pull request.
2. CI generates OpenAPI and language clients into a temporary directory.
3. CI fails if checked-in generated artifacts differ.
4. Compatibility checks reject accidental breaking changes.
5. Consumer tests validate Web, Desktop, Android, and Engine deserialization.
6. A breaking change requires a versioned endpoint or schema and a migration window.

Generated files are clearly marked and never edited manually.

## 6. Ownership and Change Isolation

Each directory includes a short `README.md` stating purpose, public interfaces, local commands, and forbidden dependencies. Code owners are assigned by area when a team exists.

Pull requests should prefer one vertical outcome but may update multiple areas atomically. Large mechanical dependency upgrades are separated from product behavior changes.

Feature flags allow clients and API deployments to roll forward independently, but a flag is not a substitute for schema compatibility.

## 7. Build and CI Strategy

The root repository exposes consistent commands:

```text
pnpm repo:bootstrap
pnpm repo:check
pnpm repo:test
pnpm repo:build
pnpm repo:dev
```

The repository CLI invokes TypeScript, Gradle, and `uv` tasks and reports a unified result. CI uses path-aware jobs but always runs contract, dependency-boundary, secret, and documentation-link checks.

Required pipelines:

- TypeScript lint, typecheck, unit, component, and build
- API integration tests with ephemeral PostgreSQL, Redis, and object storage
- Python lint, typecheck, unit, golden-fixture, and package build
- Android lint, unit, instrumentation smoke, and signed bundle build
- Desktop renderer/main/IPC tests and signed installer build
- Cross-runtime contract and fixture parity
- Dependency, license, secret, SAST, and artifact provenance checks

## 8. Versioning and Releases

- Web and API use independent deployment versions.
- Desktop and Android use semantic product versions plus monotonically increasing platform build numbers.
- Engine processor versions are immutable identifiers recorded in every job result.
- Public APIs and SDKs use explicit compatibility versions.
- The repository tag for a coordinated release records all component versions in a release manifest.
- Desktop and Android support at least the current and immediately previous compatible release unless a critical security issue requires an upgrade.

## 9. Repository Performance and Maintainability

- Build caches never contain secrets or customer data.
- Large synthetic fixtures use Git LFS only when normal Git becomes impractical; sensitive fixtures are prohibited.
- Generated installers, uploads, databases, and reports are ignored.
- Package boundaries are checked automatically.
- Dependency additions require a purpose, maintenance health, license review, and exit strategy for critical providers.
- Documentation links and requirement references are checked in CI.

## 10. When to Split a Repository

A component moves to another repository only when at least one condition is demonstrated:

- Separate access control or regulatory boundary
- Independent team ownership with release coordination becoming a bottleneck
- Repository size or build graph remains problematic after caching and path filtering
- Open-source or customer-distributed component needs a distinct lifecycle

The split preserves published contracts and history. Microservice enthusiasm alone is not a reason.
