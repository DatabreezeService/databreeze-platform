# Control-Plane API

This deployable is the strict TypeScript NestJS/Fastify control-plane shell. Task 14 establishes
transport behavior, module boundaries, deterministic OpenAPI, and the PostgreSQL schema/migration
layout. It does not yet establish business APIs or durable runtime dependencies.

## Architecture and dependency direction

`src/bootstrap.ts` is the composition root. `src/platform/http` owns transport-wide request context,
closed validation, safe problems, and OpenAPI. A feature slice lives under `src/features/<feature>`:

```text
api -> application -> domain
adapter or persistence -> application ports and domain
feature module/composition root -> every layer
```

The real `system` reference slice contains `api`, `application`, `domain`, and `adapter` layers.
It has no persistence adapter because API boot is deliberately database-free. Domain code imports
only its own domain layer; application code may depend on domain but not transport or adapter code.
Adapters implement inward-facing application ports, while feature module composition may wire its
own persistence implementation but never another feature's persistence. Features expose typed
application contracts for cross-feature composition; they do not call another feature's domain
service or read another feature's tables. Clients must never import this service package. The root
dependency-boundary checker enforces these layer-direction and repository-wide rules.

## Commands

Run from `services/api` after the root bootstrap:

```text
corepack pnpm test
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
corepack pnpm start
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm prisma:validate
corepack pnpm prisma:generate
```

Tests compile with `tsc` before execution so Nest receives the same decorator metadata as the
production build. OpenAPI generation also builds first. `prisma:generate` writes only to ignored
`build/prisma-client`; neither Prisma command nor application boot connects to PostgreSQL.

## HTTP and health semantics

- `GET /health/live` proves only that this process and event loop can respond. It does not inspect
  PostgreSQL, Redis, providers, migrations, or tenant state.
- `GET /health/ready` calls the injectable `ReadinessPort`. Success returns only
  `{ "status": "ready" }`; false or thrown checks return a content-minimized `503 NOT_READY`.
- Health routes are operational exceptions to `/v1`, are tagged as operational in OpenAPI, and are
  not public business APIs.
- `GET /v1/system/compatibility` and `POST /v1/system/compatibility/check` are content-safe,
  unauthenticated shell metadata routes used to exercise closed query/body contracts. They create
  no state and grant no authority.

Fastify accepts JSON bodies up to 64 KiB. CORS is not enabled. Framework request logging is disabled,
no framework-identifying response header is emitted, and the executable installs deterministic
`SIGINT`/`SIGTERM` shutdown hooks. Task 20 will add shared allowlisted observability and redaction.

## Correlation, validation, and errors

The earliest registered Fastify hook creates a unique UUID request ID. A request may supply zero or
one bounded UUID `X-Correlation-Id`; absence defaults correlation to the request ID. Malformed,
repeated, comma-combined, CR/LF-shaped, or oversized values fail closed and are never reflected.
Every success and error response contains `X-Request-Id` and `X-Correlation-Id`.

DTO validation whitelists declared properties, rejects unknown properties and unknown objects, does
not enable implicit conversion, and emits only allowlisted field paths/codes. Validation, routing,
readiness, known HTTP failures, body-limit failures, and unexpected errors become
`application/problem+json` documents compatible with `@databreeze/contracts/v1` `ProblemDetails`.
Bodies contain stable code, status, message key, correlation ID, retryability, and optional safe
field errors; they exclude exception messages, stack traces, SQL, raw paths/query strings, header
text, provider detail, tenant existence, and customer content.

## OpenAPI

`openapi/v1.json` is generated from the configured application and checked in as OpenAPI 3.1 with
the JSON Schema 2020-12 dialect. The generator is deterministic, the drift command byte-compares a
fresh generation, and `openapi:check` runs Redocly's standards validator. The same document is
served at `GET /v1/openapi.json`. Public paths use `/v1`; operational health exceptions are marked
consistently. The document includes correlation/request headers, closed compatibility input,
representative Problem responses, and the closed shared v1 Problem schema with local component
references. Edit controllers or contracts, then run `openapi:generate`; never hand-edit the
artifact.

## Prisma schema ownership and migrations

`prisma/schema/` is the multi-file Prisma schema. `platform.prisma` declares the generator,
datasource, and composition metadata; module files own their PostgreSQL schema:

- `platform`: composition/infrastructure-owned metadata, currently the reference
  `schema_registry` model.
- `system`: reserved for persistence owned by the real system feature; no runtime repository is
  present in this task.
- `iam`: identity, sessions, memberships, devices, MFA references, and signed authorization
  snapshots owned by the IAM feature.

All migrations live in one chronologically ordered `prisma/migrations` directory. A migration may
create or alter only the schemas/tables its owning module declares; cross-module transactions are
composed above features and never authorize cross-feature persistence imports. Migration names use
`YYYYMMDDHHMMSS_description`, SQL remains reviewable, and production migration execution must always
receive an explicit `DATABASE_URL` through deployment configuration.

For validate/generate only, `prisma.config.ts` falls back to validation-only invalid credentials on
loopback port `1` with a one-second timeout. Those commands do not connect. Any accidentally invoked
mutating/status command without an explicit database URL therefore fails closed and cannot target
Task 18 local state.

## Coverage and deferred boundaries

- `INT-006`: partial foundation coverage for explicit `/v1` routing and a versioned deterministic
  OpenAPI artifact. Deprecation lifecycle, compatibility publication, and generated SDK releases are
  deferred.
- `INT-021`: partial foundation coverage for schema-valid, correlated, content-safe Problem bodies.
  Localization rendering and the full business error catalog are deferred.
- Authentication/service accounts (`INT-001`, `INT-003`), server-side tenant authorization
  (`INT-002`), idempotency persistence (`INT-004`), pagination (`INT-005`), rate/concurrency limits
  (`INT-007`), provider webhooks, outbox/dispatch, audit persistence, business-domain APIs, and
  PostgreSQL-backed readiness are not implemented or claimed here.
- Task 18 supplies local PostgreSQL/Redis/object-storage dependencies. Task 20 supplies shared safe
  diagnostics. Later domain plans supply repositories, authorization, durable transactions, and
  business behavior.
