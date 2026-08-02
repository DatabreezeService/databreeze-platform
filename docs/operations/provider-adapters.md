# Provider Adapter Runbook

DataBreeze owns the domain record, policy, evidence, audit, quota, and
retry state. An adapter owns only transport-specific behavior behind a typed
port. No provider identifier is a core primary key, and restricted marketplace
or undocumented APIs are not required for core workflows.

## Add or change an adapter

1. Read the provider port and relevant foundation specifications. Record the
   capability matrix, data classifications, regions, retention, rate limits,
   authentication, pagination, idempotency, error mapping, and exit strategy.
2. Add a versioned connection definition and encrypted secret reference. Keep
   credentials out of logs and pass them only to the one connection-scoped
   adapter invocation.
3. Add synthetic contract fixtures for success, timeout, throttling, malformed
   response, ambiguous write, revoked credential, and provider removal.
4. Route imports/exports through IAE, DSM, JRA, DSO, IAM, and BUA application
   contracts. Do not access another module's tables, queues, object namespace,
   or policy internals.
5. Declare a kill switch, retry/backoff policy, durable checkpoint, replay
   behavior, reconciliation path, and manual rollback before activation.

## Degraded provider

Mark the connection degraded, stop new consequential writes, keep already
accepted work durable, and show a truthful unavailable state. Retry only when
the declared budget permits it. An outage never lowers validation, evidence,
approval, audit, or tenant-scope requirements.

## Provider exit

Export governed normalized data and manifests, revoke credentials, stop the
adapter, preserve immutable evidence and audit history, and verify that the
core product still operates in Local/Hybrid/Cloud modes without the provider.
