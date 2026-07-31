# Integrations, Public API, and Webhooks

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.0 |
| Requirement prefix | `INT` |
| Dependencies | `IAM` Identity, Workspaces, and Permissions; `IAE` Inbox, Artifacts, and Evidence; `DSM` Datasets, Schemas, Rules, and Mappings; `JRA` Jobs, Recipes, and Approvals; `DSO` Devices, Synchronization, and Offline Operation; `NCO` Notifications and Collaboration; `BUA` Billing, Usage, and Administration |

## Purpose

Define the stable public API conventions, service-account access, inbound and outbound webhooks, and authorized connector boundary for DataBreeze. Integrations must provide durable, observable exchange without bypassing tenant authorization, evidence, approval, data-mode, or entitlement controls. A feature remains usable through user-controlled files and standard imports/exports even when a vendor API is unavailable.

## Scope and non-goals

### In scope

- Versioned REST and event contracts, service-account scopes, structured errors, correlation, idempotency, cursor pagination, and rate-limit behavior.
- Outbound webhook subscriptions, signing, secret rotation, delivery attempts, retries, status, and replay.
- Inbound callbacks for `INT`-managed connector definitions/connections, including raw-body signature verification, replay defense, durable receipt, normalization, and reconciliation.
- Connector definitions and instances for documented public APIs, published feeds/downloads, customer-authorized databases, object storage, and other explicitly authorized sources or destinations.
- Connector credentials, declared provider capabilities, checkpoints, pull and push transport, partial access, revocation, and removal.
- Governed bulk imports and exports through the owning foundation services.

### Non-goals

- Redefining users, service accounts, memberships, permission evaluation, security epochs, or role bundles owned by `IAM`.
- Redefining artifacts, artifact versions, evidence, storage, retention, or object grants owned by `IAE`.
- Redefining governed datasets, schemas, mappings, rules, validation, or data lineage owned by `DSM`.
- Creating a second job, recipe, retry, approval, or consequential-action authority beside `JRA`.
- Creating alternate device, data-mode, offline queue, or synchronization semantics beside `DSO`.
- Creating alternate user notification, assignment, or collaboration behavior beside `NCO`.
- Creating alternate entitlement, quota, or billable-usage authority beside `BUA`.
- Owning billing-provider or notification-delivery callbacks; `BUA` and `NCO` keep their own routes, inboxes, state, and reconciliation while reusing shared verifier/envelope libraries where useful.
- Scraping private or public web pages, replaying authenticated browser sessions, automating private user interfaces, bypassing vendor controls, or depending on undocumented or restricted APIs.
- Running arbitrary customer or third-party code in the control plane, cloud workers, Desktop, or Android.
- Guaranteeing delivery by an external provider or treating a webhook as exactly-once transport.

## Concepts and components

- **Public API:** the supported `/v1` HTTP contract described by a versioned OpenAPI document.
- **API principal:** an `IAM` user or service account authenticated for a request. An API scope is a requested permission ceiling, never a grant by itself.
- **Idempotency record:** a bounded record that makes a retried mutation return the original outcome or reject a mismatched reuse.
- **Opaque cursor:** a signed continuation token bound to a query, authorization scope, and snapshot watermark.
- **Connector definition:** a reviewed, versioned manifest describing one provider transport, authorization method, network policy, schemas, capabilities, and failure semantics.
- **Integration connection:** one organization-owned, workspace-scoped configuration of a connector definition.
- **Credential binding:** a reference to encrypted provider credentials and their version; the record never contains plaintext secret material.
- **Connector checkpoint:** a durable provider cursor or watermark advanced only after corresponding DataBreeze state commits.
- **Inbound webhook event:** a callback for an `INT`-managed connector definition/connection, durably received and authenticated before asynchronous normalization.
- **Webhook subscription:** an authorized destination, event filter, payload schema version, and signing-key reference.
- **Webhook delivery:** one endpoint/event delivery identity with an immutable canonical payload and multiple attempts.
- **Replay:** an authorized new delivery of a retained event; it does not create a new domain event.

### Authority boundaries

`IAM` remains authoritative for principal identity, service-account lifecycle, credential authentication, permission grants, and authorization epochs. `IAE` remains authoritative for imported and exported artifacts, immutable snapshots, evidence, storage, and retention. `DSM` remains authoritative for governed datasets, schemas, mappings, rules, validation, and data lineage. `JRA` remains authoritative for asynchronous work and approvals. `DSO` remains authoritative for data modes and offline synchronization. `NCO` remains authoritative for user notifications and collaboration. `BUA` remains authoritative for entitlements and usage accounting.

`INT` owns only cross-cutting public protocol conventions, idempotency records, connector definitions and connection transport state, provider credential bindings, connector checkpoints, webhook subscriptions, inbound receipts for `INT`-managed connectors, and outbound delivery state. `BUA` owns billing-provider callbacks and `NCO` owns notification-provider delivery callbacks, including their inbox and reconciliation state. Those domains may reuse INT's shared signature-verifier and envelope libraries without creating an `IntegrationConnection` or `InboundWebhookEvent`. Connector adapters call published application-service contracts under narrowly scoped identities and never read or write another subsystem's persistence directly.

### Components

- Public API gateway, OpenAPI/schema registry, correlation middleware, and structured-error mapper.
- Idempotency and cursor services.
- Rate-limit admission and header service backed by `BUA` entitlement decisions.
- Connector registry, connection service, secret broker, and capability discovery service.
- Connector runner with provider-specific adapters and durable checkpoints.
- Connector inbound-webhook gateway, signature verifier, replay ledger, and durable inbox, limited to registered `INT` connector definitions.
- Outbound webhook subscription service, signer, delivery queue, retry scheduler, and replay console.
- Import/export orchestration adapters for `IAE`, `DSM`, and `JRA`.
- Content-minimized connection and delivery events consumed through `NCO` policies.

## Subsystem workflows

### Provision API access

1. An authorized organization administrator creates or selects an `IAM` service account and grants explicit workspace and action permissions.
2. The administrator requests an API credential or signed-key binding through `IAM`; secret material is shown once and only a hash or public key remains there.
3. A client calls the public API with that credential and its requested scopes.
4. The gateway authenticates the principal, intersects requested scopes with current `IAM` permissions and `BUA` entitlements, and resolves resource tenant ownership server-side.
5. The response includes a correlation ID and current rate-limit state. Revocation or scope reduction takes effect according to the `IAM` security-epoch contract.

### Pull from an authorized source

1. An authorized administrator selects a reviewed connector definition, requested workspace/project, direction, and provider scopes.
2. DataBreeze completes the provider's documented authorization flow or accepts administrator-supplied credentials through a secret input.
3. The connector discovers effective provider capabilities and shows missing or excess scopes before activation.
4. A `JRA` job pulls one bounded provider page using the current checkpoint and records a page fingerprint.
5. Imported bytes enter through `IAE`; normalized governed records enter through `DSM` as a new DatasetVersion referencing immutable `IAE` snapshots and exact schema/mapping versions. Both retain provider external references, connector/version, capture time, and lineage.
6. The checkpoint advances transactionally only after the referenced intake or dataset commit and outbox record exist. The same page can be replayed without duplicate business records.

### Receive a provider webhook

1. The inbound gateway preserves the exact request bytes and required signature headers.
2. It resolves the connector and key version without trusting payload tenant identifiers, verifies the signature and bounded timestamp, and checks provider event ID or payload digest against the replay ledger.
3. It durably records the authenticated event before returning a success response. Invalid events receive a non-disclosing rejection and never reach an adapter.
4. An asynchronous adapter parses and normalizes the event, resolves its connection from trusted external references, and schedules any needed `JRA` work.
5. Duplicate events return the documented successful duplicate response; a reused provider event ID with different bytes is quarantined and alerted.

### Deliver an outbound webhook

1. A committed domain event enters the transactional outbox of its owning subsystem.
2. The dispatcher resolves currently authorized subscriptions and creates one stable delivery per endpoint and event.
3. It serializes the subscription's selected schema version, minimizes the payload, signs the timestamp and exact body with the active endpoint secret, and sends outside the source transaction.
4. A `2xx` response marks the delivery successful. Retryable failures follow bounded exponential backoff; permanent failures retain status and diagnostic codes.
5. An authorized operator may replay a retained event. The replay receives a new delivery ID referencing the original event ID, and consumers continue to deduplicate by event ID.

### Export or push to a destination

1. The caller requests an export or destination push with an idempotency key, explicit scope, format/schema version, and destination connection.
2. `IAM`, `BUA`, workspace data-mode policy, and any `JRA` approval policy are evaluated before work starts and again before external release.
3. `IAE` creates the governed artifact representation and `DSM` creates the governed-data manifest when a dataset is exported. The connector receives only that declared output through a short-lived job-scoped grant.
4. The adapter sends a provider idempotency key when supported. If the provider response is ambiguous, the adapter reconciles through the documented provider API before retrying.
5. The job records a safe provider reference, result, and audit correlation; provider failure never mutates or deletes the source artifact.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| INT-001 | P0 | Every public API call shall authenticate an `IAM` user or service account; requested API scopes shall be intersected with current `IAM` permissions and `BUA` entitlements and shall never grant authority independently. |
| INT-002 | P0 | Every API, webhook-management, connector, import, export, and replay operation shall resolve organization, workspace, project, and resource ownership server-side and enforce the owning subsystem's current authorization before reading or changing protected state. |
| INT-003 | P0 | Public API authentication shall consume the `IAM` service-account and credential contract; `INT` shall persist only credential identifiers and safe request metadata, honor `IAM` overlapping rotation, and stop accepting a credential immediately when `IAM` revokes it. |
| INT-004 | P0 | Every public mutation shall accept an idempotency key scoped to principal, tenant, method, and route; concurrent identical retries shall produce one effect and the same outcome, while reuse with a different request hash shall return `409 IDEMPOTENCY_KEY_REUSED`. |
| INT-005 | P0 | Unbounded public lists shall use opaque cursor pagination with deterministic ordering; a cursor shall bind filters, projection, tenant scope, authorization epoch, and snapshot watermark and shall be rejected when those bindings no longer match. |
| INT-006 | P0 | Public REST routes shall use an explicit major version, and OpenAPI, JSON Schema, webhook payloads, connector manifests, and SDK releases shall identify their contract versions; a breaking change shall require a new major contract, and a supported major shall receive a published successor and at least 12 months' deprecation notice before removal. |
| INT-007 | P0 | API admission shall enforce rate and concurrency limits by principal, tenant, route cost class, and abuse source, return `429` with `Retry-After`, rate-limit headers, and a structured `RATE_LIMITED` body containing the limiting scope and reset time, and defer commercial quota and usage authority to `BUA`. |
| INT-008 | P0 | Every outbound webhook delivery shall have PostgreSQL-backed durable state, be at-least-once, include event ID, delivery ID, schema version, UTC timestamp, attempt number, and signing-key ID, and carry an HMAC-SHA-256 signature over the timestamp and exact raw body using a versioned endpoint secret. |
| INT-009 | P0 | Outbound webhook destinations shall pass creation-time and send-time SSRF, private-network, redirect, DNS-rebinding, and scheme validation; payloads shall contain only documented, permission-safe fields and short-lived retrieval references where content is required. |
| INT-010 | P0 | Inbound callbacks for `INT`-managed connectors shall verify the signature over exact raw bytes, accepted key version, bounded timestamp, and provider event identity before parsing; authenticated events shall be recorded in the connector's PostgreSQL-backed durable inbox before success acknowledgement and replays shall be deduplicated or quarantined on hash mismatch. Billing and notification callbacks remain owned by `BUA` and `NCO`. |
| INT-011 | P0 | A connector shall access only documented public APIs, published feeds or downloads, customer-authorized databases or storage, or other sources the customer is entitled to use; no production capability or release gate shall depend on scraping, browser/session automation, undocumented endpoints, or restricted partner APIs. |
| INT-012 | P0 | Connector adapters shall implement the reviewed transport contract, run with declared network and secret capabilities, and call published `IAE`, `DSM`, `JRA`, `DSO`, `IAM`, and `BUA` application contracts instead of accessing their databases, queues, object namespaces, or policy internals directly. |
| INT-013 | P0 | Provider access tokens, refresh tokens, passwords, signing secrets, and client secrets shall be held through encrypted secret references, redacted from logs and payloads, supplied just in time to one connection-scoped adapter, and atomically rotated or revoked without exposing plaintext. |
| INT-014 | P0 | Connector and API imports shall create ordinary immutable `IAE` artifact versions for bytes or `DSM` DatasetVersions for governed records, with exact `IAE` snapshot references, source external references, connector/schema/mapping versions, capture time, fingerprints, and lineage; retries shall not duplicate a committed source item. |
| INT-015 | P0 | API exports and connector exports or destination pushes shall require separate export and destination permissions, applicable `JRA` approval, current `BUA` admission, and the owning `IAE` artifact or `DSM` governed-data export manifest; they shall never silently broaden the source's data classification, project visibility, or data-mode policy. |
| INT-016 | P0 | A pull checkpoint shall advance only after all referenced domain commits and outbox records for that page are durable, and a push checkpoint shall advance only after the provider result is confirmed or reconciled; crash recovery shall replay unadvanced work without duplicate committed business records or external effects. |
| INT-017 | P1 | Outbound webhook failures shall expose safe attempt history and retry state, use bounded exponential backoff with jitter for a subscription-configured retry window no longer than 72 hours, retain replayable delivery metadata for at least 30 days, and support an authorized manual replay that does not create a new domain event. |
| INT-018 | P1 | Webhook documentation shall promise ordering only for an explicitly named ordering key; delivery and replay shall preserve the original event ID, and consumers shall be able to deduplicate without relying on arrival order. |
| INT-019 | P1 | After an ambiguous connector-push timeout or connection loss, the adapter shall reconcile through a documented provider read or idempotency mechanism before retrying, or stop for review when neither exists. |
| INT-020 | P1 | Provider scope reduction, credential expiry, authorization revocation, rate limiting, and partial access shall place the connection in an explicit degraded or reauthorization state, preserve prior imported artifacts and datasets, publish a content-minimized state event for `NCO`, and report affected capabilities without repeatedly retrying a permanent denial. |
| INT-021 | P1 | Public errors shall use stable machine codes, HTTP status, correlation ID, retryability, safe field details, and a localized message key; errors shall not reveal tenant existence, credentials, provider response bodies, or protected source values. |
| INT-022 | P1 | Bulk import and export requests shall execute as bounded `JRA` jobs with validated manifests, per-item outcomes, resumable transfer where supported, cancellation checkpoints, and explicit partial-result status instead of holding a synchronous API request open. |
| INT-023 | P2 | Official SDKs shall be generated from the published OpenAPI and event schemas, pin a supported major version, expose idempotency, pagination, rate-limit, and signature-verification helpers, and preserve underlying HTTP errors and correlation IDs. |
| INT-024 | P2 | Any future third-party connector program shall require signed versioned manifests, publisher identity, declared capabilities, allowed data classifications, synchronization payload classes, isolated execution, contract and security review, revocation, compatibility fixtures, and removal behavior before code can run for a customer. |

## Domain and data contracts

### Public API protocol

No separate `INT` principal or permission grant exists. `principalId`, memberships, service-account state, permission bundles, and security epochs resolve through `IAM`.

```text
ApiRequestContext {
  requestId, correlationId, principalId, principalType,
  organizationId, workspaceId?, projectId?,
  requestedScopes[], credentialId, apiMajorVersion
}

IdempotencyRecord {
  id, principalId, organizationId, method, routeTemplate,
  keyHash, requestHash, responseStatus, responseResourceRef?,
  state: IN_PROGRESS|COMPLETED|FAILED_FINAL,
  createdAt, expiresAt
}

PageEnvelope<T> {
  data: T[],
  nextCursor?,
  snapshotAt,
  hasMore
}

ApiError {
  code, messageKey, correlationId, retryable,
  fieldErrors?: [{ field, code }],
  retryAfterSeconds?,
  rateLimit?: { scope, limit?, remaining?, resetAt }
}
```

Idempotency records are retained for at least 24 hours and longer when a documented operation can remain pending. Stored response references exclude credentials, signed URLs, and protected response bodies. Cursors are opaque, integrity-protected, expire within 24 hours, and cannot be moved between principals or tenants. Default page size is 100 and the maximum is 1,000 unless a resource contract documents a lower limit.

Additive optional response fields may appear inside a supported major version. Clients ignore unknown optional fields but never silently reinterpret an unknown state or enum. Each deprecation notice identifies the replacement, announcement date, last-supported date, affected routes and schemas, and migration guide. Removal occurs only after the successor is generally available and the `INT-006` notice window has elapsed.

### Connector records

```text
ConnectorDefinition {
  id, key, version, publisher, trustLevel,
  directions: PULL|PUSH|BIDIRECTIONAL,
  authSchemes[], requestedProviderScopes[],
  inputSchemaIds[], outputSchemaIds[],
  networkPolicy,
  allowedDataClassifications[]: PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED,
  synchronizationPayloadClasses[]: CONTROL_METADATA|APPROVED_DERIVED_RESULT|
      RECONSTRUCTABLE_DERIVED_CONTENT|ORIGINAL_CONTENT,
  checkpointSchemaVersion,
  ratePolicy, retryPolicy, signature, status
}

IntegrationConnection {
  id, organizationId, workspaceId, projectId?,
  connectorDefinitionId, connectorVersion,
  credentialBindingId?, requestedCapabilities[],
  effectiveCapabilities[], state:
    DRAFT|ACTIVE|DEGRADED|NEEDS_REAUTHORIZATION|PAUSED|REVOKED,
  providerAccountRefEncrypted?, authorizationEpoch,
  createdBy, revision, createdAt
}

CredentialBinding {
  id, connectionId, authScheme, secretRef,
  secretVersion, previousVersionValidUntil?,
  expiresAt?, lastRotatedAt?, lastUsedAt?, status
}

ConnectorCheckpoint {
  id, connectionId, streamKey, schemaVersion,
  providerCursorEncrypted?, watermark?, pageFingerprint,
  committedDomainRefs[], committedAt, revision
}

ConnectorTransferAttempt {
  id, connectionId, jobId, direction,
  providerOperationKey?, requestFingerprint,
  providerResultRefEncrypted?, outcomeCode,
  startedAt, completedAt?
}
```

An integration connection belongs to exactly one organization and workspace; an optional project must belong to that workspace. Provider account references are never accepted as tenant proof. A connector definition declares its external hosts and capabilities, while each connection receives only the intersection allowed by provider authorization, workspace policy, `IAM`, and `BUA`.

### Webhook records and envelopes

```text
WebhookSubscription {
  id, organizationId, workspaceId, projectId?,
  urlEncrypted, eventTypes[], resourceFilters,
  payloadSchemaVersion, signingSecretRef,
  signingKeyVersion, previousKeyValidUntil?,
  state: VERIFYING|ACTIVE|PAUSED|DISABLED,
  createdBy, revision
}

WebhookDelivery {
  id, subscriptionId, eventId, eventType,
  orderingKey?, schemaVersion,
  canonicalBodyHash, canonicalBodyRefEncrypted,
  state: PENDING|DELIVERED|RETRYING|FAILED|DISABLED,
  attemptCount, nextAttemptAt?, lastStatusCode?,
  lastErrorCode?, createdAt, deliveredAt?,
  retentionExpiresAt
}

WebhookDeliveryAttempt {
  id, deliveryId, ordinal, signingKeyId,
  requestBodyHash, startedAt, completedAt?,
  outcome: DELIVERED|RETRYABLE_FAILURE|PERMANENT_FAILURE,
  statusCode?, errorCode?, durationMs?
}

InboundWebhookEvent {
  id, connectorDefinitionId, connectionId,
  providerEventId?, signingKeyVersion,
  rawBodyHash, encryptedBodyRef, receivedAt,
  verificationState: VERIFIED|REJECTED|QUARANTINED,
  processingState: PENDING|PROCESSED|DUPLICATE|FAILED,
  normalizedEventRef?, retentionExpiresAt
}

OutboundWebhookEnvelope {
  id: eventId,
  deliveryId,
  type,
  schemaVersion,
  occurredAt,
  orderingKey?,
  resource: { type, id, revision? },
  data
}
```

`IdempotencyRecord`, `WebhookSubscription`, `WebhookDelivery`, `WebhookDeliveryAttempt`, and INT-connector `InboundWebhookEvent` metadata are authoritative PostgreSQL records for this subsystem. They do not replace `BUA` or `NCO` provider inboxes. Redis, broker state, provider logs, and worker memory may accelerate dispatch but cannot be the only copy of an idempotency decision, receipt, pending delivery, attempt, next-attempt time, or replay decision.

Outbound requests carry `X-DataBreeze-Event-Id`, `X-DataBreeze-Delivery-Id`, `X-DataBreeze-Timestamp`, `X-DataBreeze-Key-Id`, and `X-DataBreeze-Signature`. The canonical `v1` signature is HMAC-SHA-256 over `timestamp + "." + exactBodyBytes`. Secrets rotate with an overlap of at most 24 hours, during which both documented key IDs verify. Endpoint consumers must use the event ID for deduplication. A manual replay has a new delivery ID but the same event ID and occurrence time.

Inbound bodies are encrypted and retained only for the connector's documented replay/debug window, then erased while hashes and safe outcome metadata remain under audit policy. Provider event IDs are unique within connector definition and provider account scope. A repeated ID with a different body hash is a security conflict, not an update.

## Permissions, security, and privacy

- Permission constants include `integration.connection.read`, `integration.connection.manage`, `integration.credential.rotate`, `integration.sync.run`, `integration.import`, `integration.export`, `webhook.subscription.manage`, `webhook.delivery.read`, and `webhook.delivery.replay`; `IAM` owns their role mapping and final decisions.
- Creating or changing credentials, provider scopes, destination URLs, signing secrets, or broad export subscriptions requires recent MFA when organization policy classifies the action as privileged.
- API scopes are least-privilege action ceilings. Wildcard scopes are unavailable to ordinary service accounts, and a token claim never replaces server-side resource authorization.
- Secrets are stored in a managed secret system under separate encryption keys. Application tables contain opaque references and safe metadata only.
- Connector runners receive one short-lived, connection-scoped secret lease and one job-scoped DataBreeze credential. They receive no broad production database, object-storage, queue, or secret-store access.
- OAuth flows verify state, PKCE where supported, issuer/authorization origins, exact redirect URI, and granted scopes. Revocation is attempted at the provider and always enforced locally.
- Webhook URLs permit HTTPS only in production. Resolution and every redirect are checked against loopback, link-local, private, metadata-service, reserved, and organization-denied networks.
- Endpoint verification sends a synthetic content-free challenge. It never sends a real customer event before activation.
- Webhook and connector payloads minimize fields to the subscription or adapter schema. Source contents, filenames, paths, credentials, personal contact details, and evidence snippets are absent unless the specific authorized contract requires them.
- Logs and traces may contain internal IDs, connector key, schema version, status class, latency, byte count, and safe provider code; they never contain tokens, signatures, destination query strings, raw bodies, exported records, or provider response bodies.
- Public-source access still requires a documented API, feed, or download compatible with applicable terms and customer policy. Public availability is not permission to bypass technical controls or collect unrelated personal data.

## Offline, failure, and recovery

- Public API, cloud connectors, and webhook delivery require network access. Desktop and Android may queue only domain operations that `DSO` marks offline-capable; `INT` does not create a separate offline authorization or mutation queue.
- A `LOCAL` workspace cannot be made cloud-readable by a connector. An import requiring cloud-received original bytes must be rejected or routed through an explicit user-controlled Desktop intake allowed by `DSO` and `IAE`.
- An INT-connector inbound callback is acknowledged only after its verified connector inbox record is durable. An inbox/outbox relay resumes processing after process or broker failure.
- Connector pull retries reuse the same checkpoint and page fingerprint. A checkpoint write lost before commit causes harmless replay; a committed checkpoint always references committed domain records.
- Rate limits use provider reset information when trustworthy, otherwise exponential backoff with jitter and a circuit breaker. Authentication or permission failures do not enter an unbounded retry loop.
- Credential expiry or provider revocation pauses affected work in `NEEDS_REAUTHORIZATION`. Reauthorization creates a new credential version and capability snapshot; it never rewrites prior lineage.
- Removing a connector disables new work, revokes or erases credential bindings, and retains imported artifacts, datasets, evidence, job history, checkpoints required for audit, and exports under their owning retention policies.
- Disaster recovery restores idempotency records, connector definitions and connections, encrypted credential references, checkpoints, inbound receipts, webhook subscriptions, key versions, delivery state, and event retention before runners or dispatchers resume.
- If a signing key is unavailable after recovery, delivery fails closed and waits for operator remediation; an unsigned fallback is prohibited.
- Poison webhook events and connector pages stop after bounded attempts, enter a quarantined/dead-letter state with a safe reason, and can be retried only after correction or authorized replay.

## APIs, events, and extension points

### REST resources

- `GET /v1/openapi.json`
- `GET /v1/capabilities`
- `GET /v1/connector-definitions`
- `GET|POST /v1/workspaces/{workspaceId}/integrations`
- `GET|PATCH|DELETE /v1/integrations/{connectionId}`
- `POST /v1/integrations/{connectionId}/test`
- `POST /v1/integrations/{connectionId}/reauthorize`
- `POST /v1/integrations/{connectionId}/sync-runs`
- `GET /v1/integrations/{connectionId}/sync-runs`
- `GET|POST /v1/workspaces/{workspaceId}/webhook-subscriptions`
- `GET|PATCH|DELETE /v1/webhook-subscriptions/{subscriptionId}`
- `POST /v1/webhook-subscriptions/{subscriptionId}/rotate-secret`
- `GET /v1/webhook-subscriptions/{subscriptionId}/deliveries`
- `POST /v1/webhook-deliveries/{deliveryId}/replays`
- `POST /v1/inbound-webhooks/connectors/{connectorKey}` for authenticated callbacks belonging to an active `INT` connector definition/connection; billing and notification provider routes remain under `BUA` and `NCO`
- Owning-domain import and export resources published under `/v1`, including `IAE` artifact, `DSM` dataset, and `JRA` job references

All public mutations require `Idempotency-Key`; revisioned changes also require `If-Match`. Responses include `X-Request-Id`, `X-Correlation-Id`, and the documented rate-limit headers. Public list filters use exact documented fields and cursor pagination. Inbound provider routes use connector signature authentication, not an `IAM` bearer credential.

### Events

`integration.connection.created`, `integration.connection.capabilities_changed`, `integration.connection.degraded`, `integration.connection.reauthorized`, `integration.connection.revoked`, `integration.sync.started`, `integration.sync.completed`, `integration.sync.partial`, `integration.checkpoint.advanced`, `integration.import.committed`, `integration.export.completed`, `webhook.inbound.received`, `webhook.inbound.quarantined`, `webhook.subscription.created`, `webhook.delivery.succeeded`, `webhook.delivery.failed`, and `webhook.delivery.replayed`.

Events use the transactional outbox and contain safe identifiers, revisions, state, counts, schema versions, and correlation IDs. They do not contain secrets, raw provider bodies, source records, or export content. Domain events remain owned by their source subsystem; `INT` records delivery rather than redefining them.

### Extension points

- `ConnectorAdapter` implements `authorize`, `discoverCapabilities`, `test`, `pullPage`, `pushBatch`, `reconcilePush`, `refreshCredential`, and `revoke`.
- `InboundWebhookAdapter` for an INT connector declares accepted signature schemes, key resolution, timestamp tolerance, event-ID extraction, normalization schema, and reconciliation behavior. The shared verifier/envelope library is reusable, but domain inbox adapters remain owned by their domains.
- `ExporterAdapter` accepts a declared `IAE` representation and manifest through a job-scoped grant and returns a safe provider reference plus per-item outcomes.
- The API schema registry publishes immutable OpenAPI and JSON Schema artifacts with compatibility checks and release notes.
- The signing registry supports versioned HMAC-SHA-256 initially and reviewed asymmetric algorithms later without changing event identity.

Adapters return normalized error classes: `AUTHENTICATION`, `AUTHORIZATION`, `RATE_LIMITED`, `TRANSIENT_PROVIDER`, `INVALID_SOURCE`, `SCHEMA_CHANGED`, `AMBIGUOUS_RESULT`, `PERMANENT_PROVIDER`, and `POLICY_BLOCKED`. They do not make entitlement, approval, retention, or tenant-authorization decisions.

## Performance and capacity budgets

- API gateway authentication, authorization dispatch, correlation, idempotency lookup, and rate-limit admission add no more than 75 ms p95 inside the production region, excluding the owning handler.
- Public metadata reads return in under 400 ms p95 for a 100-item page; accepted asynchronous mutations return their stable resource or job reference in under 500 ms p95.
- INT-connector inbound callbacks acknowledge in under two seconds p95 after durable verification and connector-inbox write, excluding a provider that streams beyond the documented body limit.
- A committed event reaches its first outbound webhook attempt in under 30 seconds p95 under normal load.
- The delivery system supports at least 1 million outbound attempts per hour per deployment and drains a one-hour normal-load backlog within two hours without dropping retained events.
- Connector pages are bounded to 10,000 records or 50 MiB before staging, with streaming transfer and worker memory below 256 MiB independent of total source size.
- Webhook request and response bodies are capped at 1 MiB by default; larger content moves through an authorized artifact or export grant.
- Backpressure returns a stable asynchronous, rate-limit, or capacity response and never accepts work that cannot be durably queued.

## Observability and metrics

- API request count, latency, status class, stable error code, idempotency hit/conflict, page size, cursor rejection, rate-limit decision, principal type, route template, and tenant-safe correlation.
- Connections by connector/version/state, capability drift, authorization and refresh outcomes, checkpoint age, pages and records processed, duplicate suppression, partial access, reconciliation, and dead-letter age.
- Inbound webhook verification latency, invalid signature, expired timestamp, replay, hash conflict, durable-ack latency, normalization result, and processing lag.
- Outbound subscription count, queue age, first-attempt latency, attempts per delivery, success/failure class, endpoint disablement, replay, secret-version use, and backlog recovery.
- Import/export items and bytes, schema rejection, partial-result rate, job duration, and provider result class, linked by correlation, job, connection, event, and delivery IDs.
- Alerts cover signature-failure spikes, replay attacks, cross-tenant authorization denials, credential refresh failure, provider schema drift, SSRF rejection, stuck checkpoints, webhook backlog, repeated ambiguous pushes, and secret use after overlap expiry.
- Product measures include time to first successful API call, connection activation rate, successful import/export rate, webhook delivery success, and recovery time after reauthorization.
- Telemetry excludes raw URLs with query strings, credentials, signatures, request/response bodies, artifact or dataset values, filenames, local paths, and personal contact data.

## Acceptance and testing

- OpenAPI and JSON Schema compatibility tests reject breaking changes inside a major version and verify every documented example in Vietnamese and English developer documentation.
- Authentication and authorization tests cover users, service accounts, narrowed scopes, expired credentials, security-epoch changes, entitlement denial, project boundaries, nested identifier mismatches, and two-tenant probing.
- Idempotency tests issue concurrent identical requests, mismatched-body key reuse, process crashes before and after commit, delayed retries, and asynchronous job creation; exactly one domain effect results.
- Pagination tests cover concurrent creates/deletes, deterministic ordering, changed filters, expired cursors, scope reduction, authorization-epoch changes, and movement of a cursor between principals or tenants.
- Rate-limit tests cover principal, tenant, IP/abuse, route cost, concurrency, provider backpressure, correct headers, retry timing, and `BUA` usage deduplication.
- Outbound webhook contract tests verify exact-byte signatures, current/previous key overlap, timestamp rejection, payload minimization, event-ID deduplication, retry schedules, permanent failure, manual replay, and documented ordering keys.
- INT-connector inbound tests cover valid and invalid signatures, altered raw bytes, old timestamps, duplicate event IDs, same ID with different bytes, key rotation, durable-write failure, reordering, poison payloads, and reconciliation; boundary tests prove billing and notification callbacks never create INT connection or inbox state.
- SSRF tests cover loopback, private and link-local ranges, IPv4/IPv6 variants, encoded hosts, user-info tricks, redirects, DNS rebinding, metadata endpoints, and changes between endpoint verification and delivery.
- Connector contract fixtures cover authorization, least-privilege scopes, capability discovery, token refresh, revocation, pagination, provider rate limits, schema drift, partial access, checkpoint replay, deletion, and reinstallation.
- Import/export tests prove immutable `IAE` versions, lineage, stable external references, approval enforcement, Local-mode blocking, formula-safe serialized output, resumability, per-item outcomes, and preserved source data after provider failure.
- Policy tests prove no connector or release path depends on scraping, browser/session automation, undocumented endpoints, or restricted APIs and that file/API import and governed export remain available alternatives.
- Disaster-recovery tests restore inbox, outbox, checkpoint, idempotency, subscription, delivery, and key-version state and prove unsigned delivery and duplicate external effects do not occur.
- Load tests meet API, inbound acknowledgement, outbound dispatch, connector streaming, backlog drain, and bounded-memory budgets.

## Delivery and expansion

1. **Foundation release:** `/v1` conventions and OpenAPI, `IAM` service-account access, structured errors, idempotency, cursor pagination, rate-limit headers, connector manifests and connections, secure credential bindings, governed import/export, signed outbound webhooks, verified inbound callbacks for INT connectors, durable retries, audit, and operator-visible failure state.
2. **General availability:** capability drift and reauthorization UX, delivery inspection and manual replay, provider reconciliation, bulk per-item results, schema compatibility gates, and official signature-verification examples.
3. **Expansion:** generated SDKs for prioritized languages, additional authorized connector adapters, asymmetric webhook signatures, customer-managed egress policy, and a reviewed third-party connector program may be added through the existing contracts. No expansion may make scraping, restricted APIs, arbitrary code execution, or a single vendor connector a foundation dependency.
