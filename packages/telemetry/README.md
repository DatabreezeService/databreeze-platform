# Telemetry Contracts

`@databreeze/telemetry/v1` is the content-safe observability boundary shared by
the Web, API, Desktop, Android, and Python engine adapters. It deliberately has
no logging or OpenTelemetry SDK dependency. Runtime adapters own exporting;
this package owns the allowlist, correlation propagation, bounded values, and
redaction behavior.

Allowed attributes are identifiers, bounded counts/durations, outcomes, route
names, versions, and reason/error codes. Unknown keys are dropped. Sensitive
keys (tokens, secrets, paths, filenames, source values, prompts, evidence, and
content) are rejected by the strict assertion helper and never serialized.

Use `createStructuredLoggerV1` at runtime boundaries and pass only the
correlation headers produced by `correlationHeadersV1`. A logger sink receives
one JSON object per event; it never receives a source payload or an exception
stack by default. OTLP exporters and collectors may be swapped without
changing this contract.
