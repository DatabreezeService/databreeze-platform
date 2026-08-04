# DataBreeze Processing Engine

This directory is the shared Python 3.13 runtime for the Windows Desktop sidecar and future cloud
workers. It is a typed, deterministic foundation—not a document processor, job worker service, or
general plug-in host.

## Architecture and trust boundary

`databreeze_engine.models` defines strict Pydantic v2 envelopes backed by the generated
`databreeze-contracts` identifier, UTC timestamp, and correlation types. Models forbid unknown
fields and coercion, bound strings and collections, reject non-finite JSON, and carry opaque handle
descriptors rather than paths, credentials, URLs, source content, commands, or job envelopes. The
foundation action accepts only its closed `FoundationMetadataParameters` schema; it has no generic
JSON parameter map or locator, credential, envelope, or command field.

`databreeze_engine.registry` composes an immutable, built-in-only registry in code from reviewed
handlers. Its constructor accepts no definitions or callables, and production dispatch accepts no
registry override. Each entry binds an action/version to schema IDs, target/data modes,
capabilities, effect and risk classes, determinism, and finite resource limits. The fixed handler
digest is verified against the shipped reviewed processor artifact bytes before the registry opens;
changing that artifact requires reviewing and updating its digest. There is no entry-point
discovery, runtime registration API, import-string lookup, uploaded executable code, `eval`, `exec`,
shell command, or user plug-in path. Billing-provider effects and customer payment, funds-transfer,
withholding, reversal, or settlement action names are rejected. The reviewed registry includes the
read-only `spreadsheet-auditor.audit@1.0.0` action; its digest covers both the action wrapper and
the parser implementation.

Handlers receive only `HandlerContext`: validated IDs and locale, immutable resource limits, opaque
handles, deadline/cancellation views, a content-safe progress sink, and an optional host-provided
`read_input` callback. The dispatcher verifies the callback's byte length and SHA-256 against the
opaque handle before returning bytes; without a reader it fails closed with `INPUT_UNAVAILABLE`.
Handlers receive no stdio, environment, database connection, network client, filesystem root,
provider client, or control-plane credential. The included `foundation.metadata-digest@1.0.0`
processor only canonicalizes and hashes a small synthetic metadata fixture. The
`spreadsheet-auditor.audit@1.0.0` processor accepts one `spreadsheet-auditor.workbook.v1` handle,
never executes workbook content, and returns only geometry, blocked-feature disclosures, and
formula fingerprints bound to the supplied artifact/job/result IDs. It emits no source values or
formula text and declares no effects, network, filesystem writes, provider access, temporary
storage, randomness, clock, or locale dependency.

Both adapters call the same registry, dispatcher, and handler:

- `databreeze-engine-sidecar` loops over binary stdio frames: exactly four unsigned big-endian length
  bytes and one UTF-8 JSON value. Input is capped at 16 MiB; output at 1 MiB. EOF before a prefix is a
  clean stop. Reads and writes loop until their exact declared counts are complete. Invalid bounded
  JSON produces one JSON-RPC parse error before shutdown; truncated, zero, oversized, or other
  corrupt transport stops safely without attempting resynchronization. JSON nesting and numeric
  token lengths are bounded before Python parsing. Stdout contains frames only; this foundation
  emits no diagnostics.
- `databreeze-engine-cloud` accepts one bounded JSON payload and returns one validated result through
  the same dispatcher. It does not import the Desktop framing layer or connect to PostgreSQL, Redis,
  object storage, or providers.

JSON-RPC errors use the standard numeric codes and fixed messages for parse, request, method,
parameter, and internal errors. Engine failures use reserved server codes. The stable content-free
engine enumâ€”for example `UNSUPPORTED_ACTION`, `HANDLER_DIGEST_MISMATCH`, `DEADLINE_EXCEEDED`, or
`RESOURCE_LIMIT_EXCEEDED`â€”appears only as allowlisted `error.data.engineCode`; exception text, paths,
parameters, environment values, handles, and stack traces are never reflected. Input retrieval
failures use the allowlisted `INPUT_UNAVAILABLE` and `INPUT_HASH_MISMATCH` engine codes.

Before invoking a handler, dispatch enforces the manifest's aggregate declared input bytes and
output-handle capacity. After the handler returns, it checks the wall-clock deadline, monotonic
logical duration, and actual serialized output size. These are deterministic in-process checks, not
hard interruption: OS process, CPU, memory, and timeout supervision remain explicitly deferred.

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
locked Hatchling backend already present, checks their inventory and both exact console-entry
mappings, and imports the wheel in an isolated interpreter. Root `corepack pnpm lint`, `typecheck`, `test`, and `build`
include `@databreeze/engine` through Turborepo on Windows and other supported development hosts.

## Requirement coverage and explicit deferrals

This is partial typed-registry foundation coverage for JRA-004 and JRA-005, partial
protocol/runtime coverage for DSK-008, and partial engine coverage for SA-001..SA-007. It does not
complete those requirements. The sidecar and cloud entry points intentionally do not provide an
input reader yet; IAE/JRA must supply the authorized, job-bound reader before production execution.

Deferred work includes signed job/recipe envelope verification; nonce, expiry, and control-plane key
validation; authorization and entitlement leases; heartbeats and job leases; job-bound object grants;
attempt-directory or actual file-handle materialization; OS process/memory/CPU limits; encrypted
temporary storage, cleanup, and quarantine; Desktop bundling, spawning, supervision, cancellation, and
process-tree termination; cloud authentication, worker networking, or provider access; production
actions; evidence and result manifests; and equivalent local/cloud golden suites for future business
processors. Those boundaries belong to later approved tasks and must not be inferred from this shell.
