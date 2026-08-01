# DataBreeze Processing Engine

This directory is the shared Python 3.13 runtime for the Windows Desktop sidecar and future cloud
workers. It is a typed, deterministic foundation—not a document processor, job worker service, or
general plug-in host.

## Architecture and trust boundary

`databreeze_engine.models` defines strict Pydantic v2 envelopes backed by the generated
`databreeze-contracts` identifier, UTC timestamp, and correlation types. Models forbid unknown
fields and coercion, bound strings and collections, reject non-finite JSON and unsafe locator or
execution shapes, and carry opaque handle descriptors rather than paths, credentials, URLs, source
content, commands, or job envelopes.

`databreeze_engine.registry` composes an immutable registry in code from reviewed handlers. Each
entry binds an action/version to canonical handler and manifest digests, schema IDs, target/data
modes, capabilities, effect and risk classes, determinism, and finite resource limits. There is no
entry-point discovery, runtime registration API, import-string lookup, uploaded executable code,
`eval`, `exec`, shell command, or user plug-in path. Billing-provider effects and customer payment,
funds-transfer, withholding, reversal, or settlement action names are rejected.

Handlers receive only `HandlerContext`: validated IDs and locale, immutable resource limits, opaque
handles, deadline/cancellation views, and a content-safe progress sink. They receive no stdio,
environment, database connection, network client, filesystem root, provider client, or control-plane
credential. The included `foundation.metadata-digest@1.0.0` processor only canonicalizes and hashes a
small synthetic metadata fixture. It emits no input values and declares no effects, network,
filesystem writes, provider access, temporary storage, randomness, clock, or locale dependency.

Both adapters call the same registry, dispatcher, and handler:

- `databreeze-engine-sidecar` loops over binary stdio frames: exactly four unsigned big-endian length
  bytes and one UTF-8 JSON value. Input is capped at 16 MiB; output at 1 MiB. EOF before a prefix is a
  clean stop. Truncated, zero, oversized, invalid UTF-8/Unicode, duplicate-key, malformed, or
  concatenated JSON frames stop safely without attempting resynchronization. Stdout contains frames
  only; this foundation emits no diagnostics.
- `databreeze-engine-cloud` accepts one bounded JSON payload and returns one validated result through
  the same dispatcher. It does not import the Desktop framing layer or connect to PostgreSQL, Redis,
  object storage, or providers.

JSON-RPC errors use stable content-free codes such as `MALFORMED_REQUEST`, `UNSUPPORTED_PROTOCOL`,
`UNSUPPORTED_ACTION`, `UNSUPPORTED_ACTION_VERSION`, `HANDLER_DIGEST_MISMATCH`, `VALIDATION_FAILED`,
`DEADLINE_EXCEEDED`, and `INTERNAL_ERROR`. Error data is an empty allowlisted object; exception text,
paths, parameters, environment values, handles, and stack traces are never reflected.

## Reproducible commands

The engine pins CPython 3.13.14 in `.python-version`, uv 0.11.32 in the cross-platform launcher, and
every production, test, lint, type-check, and build dependency in `uv.lock`. `DATABREEZE_UV` may point
to the required uv executable; otherwise `uv` is resolved from `PATH`. Normal workspace commands run
with the lock, offline, without syncing or downloading. A clean checkout must bootstrap explicitly:

```text
cd services/engine
uv python install 3.13.14
uv sync --locked
node scripts/run-engine.mjs format
node scripts/run-engine.mjs lint
node scripts/run-engine.mjs typecheck
node scripts/run-engine.mjs test
node scripts/run-engine.mjs build
```

The build command checks lock freshness, builds the wheel and source distribution offline with the
locked Hatchling backend already present, checks their inventory and both console entries, and imports
the wheel in an isolated interpreter. Root `corepack pnpm lint`, `typecheck`, `test`, and `build`
include `@databreeze/engine` through Turborepo on Windows and other supported development hosts.

## Requirement coverage and explicit deferrals

This is partial typed-registry foundation coverage for JRA-004 and JRA-005 and partial
protocol/runtime coverage for DSK-008. It does not complete those requirements.

Deferred work includes signed job/recipe envelope verification; nonce, expiry, and control-plane key
validation; authorization and entitlement leases; heartbeats and job leases; job-bound object grants;
attempt-directory or actual file-handle materialization; OS process/memory/CPU limits; encrypted
temporary storage, cleanup, and quarantine; Desktop bundling, spawning, supervision, cancellation, and
process-tree termination; cloud authentication, worker networking, or provider access; production
actions; evidence and result manifests; and equivalent local/cloud golden suites for future business
processors. Those boundaries belong to later approved tasks and must not be inferred from this shell.
