# Task 20 Independent Review Report

## Outcome

`REQUEST_CHANGES` for commit `c3e3ce0327009329dc01c3829804bcd99470c3e9`
(`feat(observability): establish content-safe telemetry`).

The TypeScript package has a useful bounded allowlist, correlation helpers, and
focused unit coverage, and the scoped TypeScript/Python checks pass. The current
implementation is not yet a safe cross-runtime observability boundary: several
allowed string values can contain source content, the runtime allowlists diverge,
and correlation parsing accepts ambiguous headers. These are release-blocking for
Task 20 because the task explicitly promises content-redaction tests and shared
behavior across API, Web, Desktop, Android, and the engine.

## Findings

### 1. High — allowlisted string values are forwarded without content redaction

`packages/telemetry/src/v1.ts:94-103` only applies the path-like check to keys
matching `id|route|operation|reasonCode|errorCode|providerCode`. Values supplied
for other allowlisted string fields (`status`, `outcome`, `dataClass`, versions,
and counts represented as strings) are emitted verbatim. For example,
`sanitizeTelemetryAttributesV1({ status: 'C:\\Users\\me\\customer.xlsx' })`,
`{ outcome: 'customer@example.com' }`, and `{ dataClass: 'invoice total 123' }`
all survive sanitization. The Python adapter has the same behavior at
`services/engine/src/databreeze_engine/telemetry.py:46-63`.

This violates the architecture/privacy rules that telemetry excludes paths,
filenames, extracted values, and contact data, and it is not caught by the
current tests because they only exercise a forbidden key (`path`) or an
unknown key (`sourceValue`). The sanitizer must either enforce per-key typed
vocabularies/identifier formats and numeric types, or apply a conservative
value scrubber to every emitted string (including control/path/email/content
canaries); add equivalent TypeScript and Python regression cases for every
string-valued allowlist class.

### 2. High — allowlists are not a shared cross-runtime contract

The canonical TypeScript list at `packages/telemetry/src/v1.ts:35-65` contains
28 names. Python omits `organizationId`, `principalId`, `artifactId`,
`artifactVersionId`, `datasetId`, and `datasetVersionId` (`telemetry.py:13-38`),
while Android exposes only 17 names (`TelemetryContract.kt:8-13`). A record
created on one runtime is therefore silently dropped or impossible to represent
on another runtime. There is no generated contract or parity test to prevent
future drift.

Make one canonical schema/list (or generate the Kotlin and Python constants
from it) and add a test that compares all runtime sets and sanitizer semantics.
The generated contract should also cover record shape, correlation metadata, and
bounded scalar rules rather than only the names.

### 3. High — ambiguous correlation headers are accepted

`packages/telemetry/src/v1.ts:164-178` selects the first element of an array for
both `x-correlation-id` and `traceparent`. Thus a request with two different
correlation IDs is accepted and attributed to the first one. The API's existing
request-context parser deliberately rejects multiple values; telemetry
propagation must preserve that invariant. Reject arrays unless they contain
exactly one value, and add a test for both correlation and traceparent arrays.

### 4. Medium — HTTP header lookup is not fully case-insensitive

The same parser only checks lowercase and all-uppercase spellings
(`v1.ts:167-173`). Arbitrary valid HTTP spellings such as `X-Correlation-Id`
are ignored. Normalize header names before lookup (or accept a `Headers` object)
and test mixed-case input so propagation does not unexpectedly lose the
correlation chain.

### 5. Medium — traceparent validation is incomplete and traces are not represented in records

`v1.ts:72-73,174` accepts all-zero trace/span IDs and any flags, and silently
ignores a malformed `traceparent` while retaining only the correlation ID. In
addition, `TelemetryRecordV1` (`v1.ts:19-27`) omits `traceId` and `spanId`, so a
sink receiving a structured record cannot continue an OpenTelemetry trace
without out-of-band state. Validate W3C traceparent version/flags and non-zero
IDs, reject malformed values when supplied, and include the normalized trace/span
fields (or explicitly document and enforce an adapter-side span context contract)
with tests for valid, malformed, and zero identifiers.

### 6. Medium — platform adapters are mostly declarations, not shared emitters

The API and Web files export thin logger wrappers, Desktop exports only a port,
Android exports only constants, and Python exports only an attribute sanitizer.
There is no Android record sanitizer/correlation implementation, Desktop sink,
or API request-context bridge to the existing correlation hook. Consequently
Task 20's promised shared structured logging and correlation propagation is not
actually exercised on all five runtimes. Add minimal adapter implementations or
explicitly mark each port as a deferred integration, with contract tests proving
that every runtime rejects the same unsafe input and emits the same record shape.

## Verification performed

- `corepack pnpm --filter @databreeze/telemetry typecheck`: pass.
- `corepack pnpm --filter @databreeze/telemetry build`: pass.
- `corepack pnpm --filter @databreeze/telemetry test`: 4/4 pass.
- API, Web, and Desktop TypeScript typechecks: pass.
- `uv run --locked pytest tests/test_telemetry.py`: 3/3 pass.
- `uv run --locked ruff check src/databreeze_engine/telemetry.py tests/test_telemetry.py`: pass.
- `uv run --locked mypy src/databreeze_engine/telemetry.py`: pass.
- `git diff --check c02d32d9d5279761d2ee2b0d7f16635ad6511457 c3e3ce0327009329dc01c3829804bcd99470c3e9`: pass.

The passing checks do not cover the leak, cross-runtime parity, or ambiguous
header cases described above.

## Re-review gate

Re-run the focused TypeScript/Python tests plus the new cross-runtime parity and
privacy-canary tests after the findings are addressed. The verdict can change to
`APPROVED` only when all high findings are closed and each adapter has a tested,
content-safe path for emitting and propagating a record.
