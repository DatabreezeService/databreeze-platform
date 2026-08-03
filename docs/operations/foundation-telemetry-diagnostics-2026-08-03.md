# Foundation telemetry and diagnostics reconciliation

**Evidence date:** 2026-08-03 (UTC)

**Source checkpoint:** `origin/dev` at `9265e15125c2e50cfcaca455524c903b6b92383e`

**Scope:** FND-005 content-safe telemetry and the diagnostics boundary across
the TypeScript control plane/shared clients, Python engine, and native Android
client. This record is task evidence only. No requirement record was promoted
to `verified`.

No requirement record was promoted to `verified`.

## Scope and safety boundary

The canonical record and allowlist live in `packages/telemetry/schemas/v1.json`
and `packages/telemetry/src/v1.ts`. TypeScript, Python, and Kotlin mirrors are
checked against the same safe attribute set. Telemetry carries bounded IDs,
route/operation/outcome tokens, counters, durations, status, and correlation
context only. Paths, filenames, source values, formulas, evidence excerpts,
prompts, contact data, credentials, tokens, provider payloads, and raw
exception messages are outside the contract.

Provider/exporter failures are isolated from domain work. Diagnostics use a
generic unreadable result when a provider mapping, clock, header collection, or
attribute map cannot be safely inspected; the provider's cause is never copied
into a record or Problem response.

## Cross-runtime verification

The following checks passed from the source checkpoint:

| Runtime/boundary | Command | Result |
| --- | --- | --- |
| TypeScript package and source parity | `corepack pnpm --filter @databreeze/telemetry test` | 12 tests passed, including the canonical TypeScript/Python/Android allowlist parity check. |
| Python engine | `uv run pytest tests/test_telemetry.py` from `services/engine` | 14 tests passed. |
| Android/Kotlin | `ANDROID_HOME=%LOCALAPPDATA%\\Android\\Sdk apps/android/gradlew.bat :app:testDebugUnitTest --offline --no-daemon` | Build and unit suite passed; 31 Gradle tasks completed. |
| API propagation | `corepack pnpm --filter @databreeze/api test` | Trace-context propagation and safe failure tests passed as part of the API suite. |

The Android invocation uses the workstation SDK path only as an environment
configuration; it is not committed and no device credentials are required.

## Failure and privacy probes

The suites exercise hostile getter/proxy-backed attributes and headers,
ambiguous or malformed correlation/traceparent values, invalid timestamps,
oversized and path-like values, email/source-like values, provider exporter
exceptions, clock failures, and Python/Kotlin mapping failures. Assertions
verify that sanitized output is empty or bounded, stable generic errors are
returned, and provider causes do not appear in serialized records or messages.

## Known environment limits

- A clean shell without `ANDROID_HOME` cannot locate the Android SDK; CI and
  release workspaces must provide the SDK through the documented toolchain
  setup. With the local SDK path configured, the Kotlin suite passed above.
- OpenTofu formatting/validation, live Docker collector health, hosted
  OpenTelemetry delivery, and protected release-environment approvals remain
  external gates recorded by FND-003/FND-004/FND-006. No infrastructure was
  applied and no collector was treated as domain authority.
- Android instrumentation, signed packaging, and production exporter health
  are later release gates; this record does not claim them complete.

## Release decision

FND-005 has cross-runtime implementation and privacy evidence at this
checkpoint. Keep product requirements conservative and retain FND-006 as
`implemented` until protected hosted release-environment evidence is supplied.
This task record is reversible with the documentation/test commit and does not
change customer-data handling or application authority.
