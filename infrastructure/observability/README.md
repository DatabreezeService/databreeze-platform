# Observability

The runtime contract lives in [`@databreeze/telemetry/v1`](../../packages/telemetry/README.md).
This directory holds deployment-facing collector, dashboard, alert, and SLO
definitions as they are introduced.

## Signal boundary

- Every record carries a bounded event name, schema version, component, UTC
  timestamp, and correlation ID.
- Allowlisted identifiers, counts, durations, outcomes, and reason codes are
  the only attributes emitted by default.
- Paths, filenames, source values, evidence, prompts, comments, credentials,
  tokens, and exception payloads are prohibited. Local mode has the same rule;
  no source-derived content may reach a collector.
- The local Compose collector receives OTLP gRPC on `4317` and HTTP on `4318`.
  It exports only a debug sink locally. Hosted exporters are replaceable
  adapters and must apply the same allowlist before egress.

The next operational slices will add dashboards and alerts without making
telemetry authoritative for IAM, jobs, approvals, billing, or synchronization.
