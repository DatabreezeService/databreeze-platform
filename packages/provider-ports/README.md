# Provider Ports

Pure, provider-neutral TypeScript contracts for replaceable DataBreeze infrastructure adapters.
This package defines boundaries only; it contains no provider implementation, network call,
credential value, persistence, framework, or SDK dependency.

## Public interface

`@databreeze/provider-ports/v1` exports common provider contracts plus ports for:

- S3-compatible object storage;
- transactional email and Android push;
- OCR and structured AI assistance;
- optional DataBreeze subscription billing;
- telemetry export; and
- opaque secret-handle resolution.

Every port shares descriptor, health, and state-export operations. A descriptor declares typed
capabilities, idempotency, cancellation, timeouts, retry limits, data regions, retention/training
behavior, failover/degraded behavior, and an exit/export format. Common helpers validate and freeze
that metadata, enforce cancellation/deadlines/idempotency, and normalize failures to safe stable
codes without retaining raw provider causes. Secret handles expose no value and redact string/JSON
serialization.

There is intentionally no unversioned package root. Provider-specific identifiers may appear only
as opaque external references returned by an adapter; they never replace DataBreeze domain IDs or
become the only representation of customer state.

## Payment boundary

`PaymentsProviderPortV1` is restricted to hosted checkout/portal, subscription upsert, verified
subscription webhooks, and reconciliation for DataBreeze's own organization subscriptions. It has
no customer charge, capture, refund, transfer, withholding, reversal, settlement, or raw payment-
credential operation. Built-in Free/Development/Admin-granted entitlement operation remains
provider-independent; a missing payment adapter must not block it.

## Forbidden dependencies

- Provider/cloud SDKs and concrete adapters.
- Service/application implementations, databases, queues, filesystems, or UI frameworks.
- Raw secrets, API keys, payment credentials, or provider response bodies in errors.
- Product workflows, entitlement authority, storage authority, notification durability, OCR/AI
  truth decisions, content-safe telemetry policy, and adapter failover orchestration.

Concrete adapters, provider webhook persistence, telemetry allowlists/redaction, billing workflow,
object-placement authority, and provider selection/failover execution are deferred to their owning
plans. The ports deliberately preserve those boundaries rather than implementing them here.

## Local commands

```text
corepack pnpm --filter @databreeze/provider-ports test
corepack pnpm --filter @databreeze/provider-ports typecheck
corepack pnpm --filter @databreeze/provider-ports build
```
