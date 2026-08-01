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

Every port shares only descriptor and health operations. State leaves through provider-specific,
closed, content-safe contracts: object manifests, delivery-suppression manifests, subscription
migration manifests, or secrets portability metadata. Stateless OCR, AI, and telemetry adapters do
not invent an arbitrary export record. A descriptor declares the complete operation set for its
provider kind plus idempotency, cancellation, timeouts, retry limits, data regions,
retention/training behavior, failover/degraded behavior, and coherent exit metadata.

Common helpers validate and freeze closed metadata, reuse the canonical contract timestamp parser,
enforce cancellation/deadlines/idempotency, and create errors only through a redacting factory with
allowlisted operations and code-derived message keys. Raw provider causes are neither accessed nor
retained. A composition-owned issuer/resolver capability creates and resolves secret references;
references and handles expose no identifier fields or raw public ID and redact string, JSON, and
diagnostic inspection. Provenance predicates and assertions validate genuine capabilities,
issuers, references, and capability membership without revealing identifier metadata.

Object storage is resumable and bounded-memory: begin, upload a validated copy-isolated 8-64 MiB
part, complete, or abort. Factory-issued uploads bind their immutable plan; uploaded-part receipts
bind their upload and part metadata; completion accepts only the exact ordered, contiguous receipt
set and derives total length and digest from the bound plan. Plans support immutable objects through
20 GiB with declared whole-object and per-part SHA-256 digests. Email and push expose explicit typed
recipient-suppression operations; durable notification policy remains owned by NCO.

There is intentionally no unversioned package root. Provider-specific identifiers may appear only
as opaque external references returned by an adapter; they never replace DataBreeze domain IDs or
become the only representation of customer state.

## Payment boundary

`PaymentsProviderPortV1` is restricted to hosted checkout/portal, subscription upsert, verified
subscription webhooks, reconciliation, and a schema-validated migration manifest for DataBreeze's
own organization subscriptions. It has no customer charge, capture, refund, transfer, withholding,
reversal, settlement, raw payment credential, or arbitrary provider-state operation. Built-in
Free/Development/Admin-granted entitlement operation remains provider-independent; a missing
payment adapter must not block it.

## Forbidden dependencies

- Provider/cloud SDKs and concrete adapters. The sole dependency is the generated canonical
  DataBreeze contract validator used for timestamps.
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
