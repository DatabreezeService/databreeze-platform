# Task 20 Independent Review Report

## Outcome

`APPROVED` after the focused fix commit that follows the original implementation
`c3e3ce0327009329dc01c3829804bcd99470c3e9`
(`feat(observability): establish content-safe telemetry`).

The follow-up fix adds the canonical JSON schema, conservative value classes,
cross-runtime parity checks, strict correlation/traceparent validation, and
tested emitters for each runtime. Task 20 now meets its content-redaction and
shared-behavior acceptance boundary. API request middleware remains the
authoritative source of request IDs; the API telemetry wrapper accepts the
validated context rather than duplicating middleware state.

## Findings

### 1. High — allowlisted string values are forwarded without content redaction (closed)

`packages/telemetry/src/v1.ts:94-103` only applies the path-like check to keys
matching `id|route|operation|reasonCode|errorCode|providerCode`. Values supplied
for other allowlisted string fields (`status`, `outcome`, `dataClass`, versions,
and counts represented as strings) are emitted verbatim. For example,
`sanitizeTelemetryAttributesV1({ status: 'C:\\Users\\me\\customer.xlsx' })`,
`{ outcome: 'customer@example.com' }`, and `{ dataClass: 'invoice total 123' }`
all survive sanitization. The Python adapter has the same behavior at
`services/engine/src/databreeze_engine/telemetry.py:46-63`.

The fix enforces per-key types, opaque identifier/token formats, control/path/
email/file-suffix canaries, and numeric-only counters/status values in
TypeScript, Python, and Android. Strict assertion and sanitizer regression
cases cover the previously leaking fields on all three runtimes.

### 2. High — allowlists are not a shared cross-runtime contract (closed)

The canonical `packages/telemetry/schemas/v1.json` now contains the complete 29
attribute names and record shape. TypeScript, Python, and Kotlin mirror the set;
`cross-runtime-parity.test.mjs` compares all three source sets and schema keys.
The same test also asserts correlation/trace record fields.

### 3. High — ambiguous correlation headers are accepted (closed)

The TypeScript, Python, and Kotlin helpers reject more than one normalized
header value, including duplicate mixed-case keys. Tests cover both correlation
and traceparent arrays.

### 4. Medium — HTTP header lookup is not fully case-insensitive (closed)

Header lookup now normalizes names by lowercasing every entry in all runtime
helpers. Mixed-case propagation is covered by TypeScript, Python, and Android
tests.

### 5. Medium — traceparent validation is incomplete and traces are not represented in records (closed)

Trace and span IDs are now required together and reject all-zero values;
traceparent version/flags are validated, malformed values fail closed, and
`TelemetryRecordV1` carries normalized trace/span/flags fields. Equivalent
helpers and tests exist in Python and Android.

### 6. Medium — platform adapters are mostly declarations, not shared emitters (closed)

API and Web wrappers remain intentionally thin around the shared logger. Desktop
now has a sink-backed port factory; Android has sanitizer, correlation, and record
helpers; Python has matching sanitizer, correlation, and record helpers. The
parity tests exercise the shared boundary. Full request middleware wiring and
provider export adapters remain later integration work, with no alternate
telemetry authority introduced here.

## Verification performed

- `corepack pnpm --filter @databreeze/telemetry typecheck`: pass.
- `corepack pnpm --filter @databreeze/telemetry build`: pass.
- `corepack pnpm --filter @databreeze/telemetry test`: 4/4 pass.
- API, Web, and Desktop TypeScript typechecks: pass.
- `uv run --locked pytest tests/test_telemetry.py`: 3/3 pass.
- `uv run --locked ruff check src/databreeze_engine/telemetry.py tests/test_telemetry.py`: pass.
- `uv run --locked mypy src/databreeze_engine/telemetry.py`: pass.
- `git diff --check c02d32d9d5279761d2ee2b0d7f16635ad6511457 c3e3ce0327009329dc01c3829804bcd99470c3e9`: pass.

Follow-up fix verification:

- `corepack pnpm --filter @databreeze/telemetry typecheck`: pass.
- `corepack pnpm --filter @databreeze/telemetry build`: pass.
- `corepack pnpm --filter @databreeze/telemetry test`: 7/7 pass, including
  cross-runtime parity, privacy canaries, mixed-case headers, ambiguous headers,
  and trace record fields.
- API, Web, and Desktop TypeScript typechecks: pass.
- `uv run --locked pytest tests/test_telemetry.py`: 10/10 pass.
- Python Ruff and mypy: pass.
- `./gradlew :app:testDebugUnitTest --no-daemon`: pass (27 tasks).
- Targeted Prettier and ESLint checks: pass.

The original findings are closed by the follow-up fix; no production-data or
credential artifacts were introduced.
