# Content-safe telemetry boundary

DataBreeze telemetry is operational metadata, not a source-data transport.
Every runtime emits the versioned `@databreeze/telemetry/v1` shape and the
Python/Kotlin mirrors are checked against its allowlist.

## Allowed data

- correlation, trace, workspace, job, artifact, dataset, and device IDs
- bounded route/operation/outcome/reason/provider tokens
- status, duration, queue, retry, item, byte, and redaction counters
- an explicit sampling boolean

## Prohibited data

Paths, filenames, source values, formulas, document text, previews, evidence
snippets, questions/prompts, transcripts, contact data, secrets, tokens,
provider causes, and raw exception messages never enter ordinary telemetry.
Unknown attributes are dropped. Strict assertion helpers reject unsafe records
at adapter boundaries. JavaScript sanitization reads only own data properties,
so accessor-backed diagnostics cannot execute arbitrary getters during logging.

## Failure behavior

Malformed correlation or trace headers fail closed. Ambiguous duplicate headers
are rejected. Invalid or oversized values are omitted by the permissive
sanitizer and rejected by strict mode. Providers and exporters remain
replaceable; a collector outage cannot become domain authority or block durable
jobs and audit writes.

See `packages/telemetry/README.md` and the TypeScript/Python/Android parity
tests before adding an attribute or event.
