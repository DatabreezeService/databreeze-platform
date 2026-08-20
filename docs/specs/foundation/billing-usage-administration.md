# Billing, Usage, and Administration

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.2 |
| Requirement prefix | `BUA` |
| Dependencies | `IAM` Identity, Workspaces, and Permissions; `NCO` Notifications and Collaboration; composed with `JRA` persistence by the application-layer `ExecutionAdmissionCoordinator` |

## Purpose

Define provider-independent organization subscriptions, plan entitlements, quotas, immutable usage accounting, optional commercial billing-provider integration, and administrative controls. Entitlements are enforced server-side for built-in Free/Development, Admin-granted, and commercially billed plans through the same contracts. A missing billing provider never blocks a noncommercial installation. Payment failure may restrict commercial consumption but never destroys, rewrites, or silently withholds customer data.

## Scope and non-goals

### In scope

- Built-in Free/Development plans, Admin-granted subscriptions, immutable plan versions, and provider-independent entitlements.
- Optional commercial billing accounts, prices, trials, invoices, payment-provider references, tax/profile metadata, and billing contacts.
- Versioned entitlement snapshots, limits, quota reservations, immutable usage ledger, aggregation, adjustments, and reconciliation.
- Server-side admission control for seats, cloud storage, processing, jobs, exports, API activity, and optional module entitlements.
- Grace, suspension, cancellation, reactivation, data access, export, and separately authorized deletion.
- Owner/Admin administration, support-safe tooling, and audit history.

### Non-goals

- Storing raw card or bank credentials in DataBreeze.
- Client-side-only plan enforcement or trusting device-reported billable totals.
- Deleting data because a payment failed, subscription ended, or plan limit decreased.
- Billing for local original bytes that never upload, or for retries caused solely by DataBreeze infrastructure failure.
- Entitling a user through an unverified payment-provider redirect.
- Requiring a registered business, payment account, checkout provider, or provider API to run a private, development, or noncommercial DataBreeze deployment.

## Concepts and components

- **Billing account:** optional organization-owned payer profile and provider customer reference used only for a commercial subscription source.
- **Plan version:** immutable entitlement definition with included quantities and policy defaults; price mappings are optional commercial metadata.
- **Subscription:** organization entitlement source pinned to a PlanVersion and lifecycle state, sourced from `BUILT_IN_FREE`, `DEVELOPMENT`, `ADMIN_GRANTED`, or `BILLING_PROVIDER`.
- **Entitlement snapshot:** server-generated effective capabilities and limits for an organization at a point in time.
- **Usage event:** immutable, idempotent record of one measurable billable or quota-relevant fact.
- **Usage ledger:** append-only source for aggregation, credit, and reconciliation.
- **Quota reservation:** temporary capacity hold made before starting bounded work.
- **Usage period:** organization billing interval in UTC with provider-aligned boundaries.
- **Adjustment:** append-only credit/debit that references a prior event or administrative reason.
- **Administrative action:** privileged, audited operation for members, plan, limits, security, export, retention, or deletion.

### Subscription states

| State | Behavior |
|---|---|
| `TRIALING` | Full entitled use until trial end; no destructive behavior at expiry |
| `ACTIVE` | Full entitled use |
| `PAST_DUE` | Payment remediation notice; existing use continues for a 14-day grace window subject to hard abuse limits |
| `SUSPENDED` | No new billable cloud processing, cloud-original upload, paid-module run, or seat increase; read, download, export, billing remediation, deletion request, and safe metadata sync remain available |
| `CANCEL_AT_PERIOD_END` | Behaves as Active through paid period, then becomes Suspended unless replaced |
| `CANCELLED` | No new paid consumption; protected read/export and separately authorized deletion remain available |

Suspension is reversible and never changes artifact retention state. Workspace `LOCAL` data remains usable on its device subject to the last valid offline authorization and security policy; the cloud cannot guarantee access to local bytes it never held.

### Components

- Plan catalog and entitlement service.
- Provider-independent subscription service and optional billing-account service.
- Optional commercial provider adapter and signed-webhook inbox.
- Usage recorder, ledger, aggregator, and reconciliation service.
- Quota reservation/admission-control service.
- Invoice and billing-document metadata service.
- Administration API using the canonical `AUD` transactional append contract.
- Grace/suspension scheduler and content-safe notification policies.

## Subsystem workflows

### Bootstrap without a billing provider

1. A deployment seeds immutable signed `FREE` and `DEVELOPMENT` PlanVersions with explicit limits and policy defaults.
2. A new private/solo organization receives a `BUILT_IN_FREE` subscription, or an authorized deployment administrator creates an `ADMIN_GRANTED`/`DEVELOPMENT` subscription with reason and expiry.
3. The server builds an EntitlementSnapshot and uses the same admission, reservation, usage, and offline-lease enforcement as a commercial subscription.
4. No provider customer, webhook, invoice, checkout, business credential, or network call is required.

### Start or change a commercial plan

1. When a commercial billing adapter is configured, an Owner with recent MFA selects an offered plan/price for the organization and supplies billing profile data.
2. The server creates or updates a provider checkout/subscription through an idempotent adapter call; sensitive payment data stays with the provider.
3. A signed provider webhook is ingested idempotently and recorded before state transition.
4. The server maps the verified provider object to a PlanVersion, transitions the Subscription, builds a new EntitlementSnapshot, appends the canonical AUD AuditEvent, and publishes delivery outbox events.
5. Clients refresh entitlements but do not become authoritative.

Upgrades may take effect immediately with provider-confirmed proration. Downgrades take effect at the next period boundary by default. If current usage exceeds a future limit, the organization enters over-limit read/cleanup mode for that dimension; existing data is preserved.

### Admit and meter work

1. A server handler identifies entitlement keys and a deterministic usage key before accepting a billable operation.
2. It evaluates the current subscription state, module entitlement, limit, current committed usage, active reservations, and hard safety caps.
3. For bounded job work, BUA returns a version-bound reservation proposal; the `ExecutionAdmissionCoordinator` persists that reservation transactionally with JRA Job creation through the shared modular-monolith unit of work.
4. Completion writes authoritative usage events from verified results and releases or consumes the reservation.
5. Failure caused before customer-value creation releases the reservation and records non-billable operational telemetry.
6. Aggregation computes period totals from the ledger. It never replaces ledger records.

### Payment failure and recovery

The verified provider event changes `ACTIVE` to `PAST_DUE` and starts a 14-day grace period. Notifications contain only generic account status. If unresolved, a scheduled, idempotent transition sets `SUSPENDED`. Successful payment returns the subscription to `ACTIVE`, rebuilds entitlements, and resumes queued work only after each job is re-authorized and the user or policy permits resumption.

### Cancellation and data handling

Cancellation stops renewal but does not initiate retention deletion. After paid access ends, the organization can sign in, update billing, read retained data, download originals it is authorized to access, and request full export. Deletion uses the separate `IAE` retention workflow, recent MFA, legal-hold checks, and explicit confirmation.

### Administrative support

Organization Owners manage billing, exports, and deletion. Admins may view plan and usage and manage operational limits only when delegated, but cannot change payment instruments or ownership by default. Internal support can see provider/reference status and aggregate usage, not source content; any account-affecting support action is time-bound, reasoned, and audited.

An authorized internal platform operator may read a content-minimized product overview built from authoritative IAM identities and BUA subscription, invoice, and payment projections. The overview may include aggregate users, organizations, workspaces, active sessions, subscriptions by plan/state, settled revenue, payment outcomes, and bounded recent account/subscription rows. Provider dashboards, browser counters, and demo fixtures are never authoritative. The read-only overview exposes no source artifacts, dataset values, payment credentials, webhook payloads, tax identifiers, or provider secrets, and access is denied unless IAM confirms a current platform assignment.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| BUA-001 | P0 | The control plane shall enforce effective entitlements and limits server-side before every billable upload, processing job, paid-module action, seat addition, export class, and API operation. |
| BUA-002 | P0 | Client entitlement displays and offline caches shall be advisory; a modified Web, Desktop, or Android client shall not bypass server admission control. |
| BUA-003 | P0 | Plan versions and optional commercial price mappings shall be immutable, effective-dated, and referenced by subscriptions and entitlement snapshots. |
| BUA-004 | P0 | Usage shall be recorded in an append-only PostgreSQL ledger with stable idempotency keys; corrections shall be new adjustment records, never updates or deletes. |
| BUA-005 | P0 | Redis, analytics stores, provider dashboards, and client counters shall not be authoritative for subscription state, entitlements, or usage. |
| BUA-006 | P1 | When a commercial billing provider is enabled, its webhooks shall be signature-verified, stored idempotently, ordered per provider object, and reconciled with provider APIs before ambiguous state changes. |
| BUA-007 | P0 | The `ExecutionAdmissionCoordinator` shall persist a BUA quota reservation and JRA job/admission creation in one modular-monolith transaction so concurrent requests cannot oversubscribe a hard limit; BUA and JRA shall expose contracts to the coordinator and shall not import each other's services or persistence. |
| BUA-008 | P0 | Infrastructure retries and failed attempts that produce no customer result shall not create duplicate or unjustified billable usage. |
| BUA-009 | P0 | `PAST_DUE`, `SUSPENDED`, cancellation, downgrade, or quota excess shall never delete or overwrite artifacts, versions, evidence, results, comments, audit history, or local data. |
| BUA-010 | P0 | Suspended and cancelled organizations shall retain authenticated read, authorized download/export, billing remediation, and explicit deletion-request access while data remains under retention policy. |
| BUA-011 | P0 | Billing changes, provider-link changes, organization deletion, and manual credits/debits shall require Owner authority, recent MFA where sensitive, idempotency, and immutable audit records. |
| BUA-012 | P0 | `LOCAL` original bytes shall not count toward cloud storage usage and shall never upload for metering; only verified synchronized classes may contribute to cloud usage. |
| BUA-013 | P1 | A 14-day grace period shall follow verified payment failure before suspension, unless fraud, abuse, or legal restrictions require a separately audited immediate safety suspension. |
| BUA-014 | P1 | Downgrades shall normally take effect at period end; over-limit dimensions shall block new growth while preserving read, export, and user-directed cleanup. |
| BUA-015 | P1 | Entitlement responses shall include stable reason codes, effective/expiry timestamps, limit, used, reserved, and reset time without exposing provider secrets. |
| BUA-016 | P1 | Usage aggregation shall reconcile ledger totals, object-storage inventory, successful job results, membership counts, and provider-reported quantities on a scheduled basis. |
| BUA-017 | P1 | Manual adjustments shall require a reason, actor, related organization, unit, quantity, effective period, and optional prior usage-event reference. |
| BUA-018 | P1 | Billing communications shall follow `NCO`, use content-minimized templates, and never include source names, values, or payment credentials. |
| BUA-019 | P1 | Reactivation shall rebuild entitlements and re-authorize eligible nonterminal jobs whose dispatch was blocked by entitlement policy; it shall not automatically execute stale, destructive, external, or approval-gated work. |
| BUA-020 | P1 | The platform shall provide machine-readable usage export and invoice metadata in organization currency while preserving raw quantities in canonical units. |
| BUA-021 | P0 | The foundation shall issue signed, Device- and workspace-bound offline entitlement leases that expire within 24 hours, bind plan/entitlement and authorization revisions plus allowed action limits, cannot authorize cloud or external effects, and fail closed after expiry or revocation is observed. |
| BUA-022 | P0 | Every deployment shall support provider-independent `BUILT_IN_FREE`, `DEVELOPMENT`, or `ADMIN_GRANTED` subscription sources; provider absence or outage shall not block creating or enforcing one of those sources, and all sources shall use the same immutable PlanVersion, EntitlementSnapshot, reservation, usage, and authorization contracts. |
| BUA-023 | P0 | Job admission shall create a BUA-owned immutable `ResultUsageSettlementBinding` in the same transaction as its quota reservation and JRA admission. The binding shall be exact to TenantScope, Job, reservation, meter, server-owned settlement formula, maximum admitted units, entitlement decision subject and idempotency identity; JRA shall persist and return only its opaque stable ID. Successful result finalization shall pass that ID plus verified result facts to a BUA transaction participant, which shall resolve the binding, compute the authoritative quantity, consume or release the exact reservation and append idempotent usage in the same transaction as terminal JRA result commit. A missing, mismatched, expired, already-conflicted or unavailable binding shall roll back finalization. Completion code shall never invent a reservation, meter, formula or billable quantity from worker assertions. |
| BUA-024 | P0 | The platform shall provide a read-only, content-minimized internal product overview for currently authorized IAM platform operators, derived from authoritative IAM and BUA records and bounded to aggregate identity, organization, workspace, session, subscription, invoice, and payment metadata; it shall not trust provider dashboards or client counters, expose tenant source content or payment/provider secrets, or allow a platform assignment to substitute for tenant authorization. |

## Domain and data contracts

### Billing and entitlement records

```text
BillingAccount {
  id, organizationId, legalName, taxIdentifierEncrypted?,
  billingEmailEncrypted, countryCode, currency,
  provider, providerCustomerRefEncrypted, revision
}

PlanVersion {
  id, planKey, version, effectiveFrom, effectiveTo?,
  entitlementDefinitions, priceMappings?, publishedAt
}

Subscription {
  id, organizationId,
  source: BUILT_IN_FREE|DEVELOPMENT|ADMIN_GRANTED|BILLING_PROVIDER,
  billingAccountId?, planVersionId,
  providerSubscriptionRefEncrypted?,
  grantReason?, grantedBy?, sourceExpiresAt?,
  state, periodStart, periodEnd, graceEndsAt?,
  cancelAtPeriodEnd, revision
}

EntitlementSnapshot {
  id, organizationId, subscriptionId, generatedAt, expiresAt?,
  sourceRevision, entitlements, canonicalHash
}

EntitlementValue {
  key, enabled, limit?, unit?, resetPeriod?, policy?
}
```

Stable entitlement keys include `seats.active`, `storage.cloud_bytes`, `processing.engine_units`, `jobs.concurrent`, `exports.advanced`, `api.monthly_requests`, `devices.active`, and `module.<module_key>.enabled`. Limits use `null` only to mean unlimited; missing keys mean disabled.

### Usage and reservation records

```text
UsageEvent {
  id, organizationId, workspaceId?, projectId?,
  usageKey, unit, quantity, occurredAt, periodId,
  sourceType, sourceId, idempotencyKey,
  billable, metadataSafe, createdAt
}

UsageAdjustment {
  id, organizationId, usageKey, unit, quantityDelta,
  reasonCode, reasonText, priorUsageEventId?,
  effectivePeriodId, createdBy, createdAt
}

QuotaReservation {
  id, organizationId, workspaceId?, entitlementKey,
  quantity, operationType, operationId, expiresAt,
  state: HELD|CONSUMED|RELEASED|EXPIRED
}

ResultUsageSettlementBinding {
  id, organizationId, workspaceId, projectId?, jobId,
  reservationId, meterKey, settlementFormula,
  maximumAdmittedUnits, entitlementDecisionSubjectHash,
  admissionIdempotencyKey, state: PREPARED|SETTLED|RELEASED,
  createdAt, expiresAt, revision
}

UsageAggregate {
  organizationId, periodId, usageKey,
  committedQuantity, adjustmentQuantity, reservedQuantity,
  computedAt, sourceWatermark
}
```

Quantities use integer canonical units: bytes, requests, seats, device count, or engine units. Currency uses ISO 4217 code and integer minor units. Floating-point storage is prohibited for money.

### Admission response

```text
EntitlementDecision {
  allowed, entitlementKey, planVersionId, subscriptionState,
  limit?, used, reserved, requested, resetAt?,
  reasonCode: ALLOWED|NOT_ENTITLED|LIMIT_EXCEEDED|
    PAST_DUE_RESTRICTED|SUSPENDED|CANCELLED|HARD_SAFETY_LIMIT,
  decisionId, decisionRevision, subjectHash,
  reservationProposalId?, proposalExpiresAt?, evaluatedAt
}

OfflineEntitlementLease {
  id, organizationId, workspaceId, deviceId,
  planVersionId, entitlementSnapshotId, authorizationEpoch,
  allowedActionTypes[], actionLimits, issuedAt, expiresAt,
  subjectHash, signingKeyId, signature
}
```

An allowed decision does not reserve capacity unless a reservation proposal is returned and the coordinator persists it with the admitted operation before its expiry. The proposal is immutable and bound to organization, workspace when applicable, entitlement key, quantity, operation type, caller idempotency key, plan revision, and decision subject hash. Clients display reason-specific actions; only server enforcement is authoritative.

## Permissions, security, and privacy

- Billing account read/manage, usage read/export, plan change, adjustment, and organization deletion are separate permissions.
- Provider tokens, customer/subscription references, billing email, tax identifiers, and webhook bodies are encrypted or access-restricted and redacted from logs.
- DataBreeze stores provider tokens/references, not raw payment credentials. Hosted checkout and provider-approved tokenization are required.
- Provider webhook endpoints authenticate signatures over raw bytes, enforce timestamp tolerance, and persist the event hash before processing.
- Support tooling displays coarse provider state and safe aggregates. Impersonation is not permitted for payment or destructive actions.
- Entitlement denials reveal only the caller's organization state and use stable reason codes.
- Usage metadata excludes artifact names, extracted values, evidence, paths, and user contact data.

## Offline, failure, and recovery

- Desktop may continue already-started, non-external local work offline under an unexpired entitlement lease of at most 24 hours. The lease contains limits and plan revision, is signed, and cannot authorize cloud storage or server-side paid services.
- Offline usage is queued with operation/result IDs and reconciled idempotently. Deliberate clock rollback does not extend the signed lease.
- After lease expiry, local capture and access to existing local data remain available, but new metered recipe execution waits for online revalidation unless the plan explicitly marks the action unmetered.
- Provider outage leaves the last verified subscription state in force until its next reconciliation deadline; it does not infer cancellation from a timeout.
- Provider absence or outage has no effect on `BUILT_IN_FREE`, `DEVELOPMENT`, or `ADMIN_GRANTED` subscriptions; they resolve entirely from signed PlanVersions and server-owned subscription state.
- Webhook reordering is handled by provider object version/timestamp plus API reconciliation. Older events are retained but cannot regress state.
- Expired quota reservations are released by a durable sweeper; a later successful result can consume usage only through its stable source idempotency key.
- Disaster recovery restores the ledger, adjustments, reservations, provider-event inbox, plan versions, and subscription revisions before admitting new billable work.

## APIs, events, and extension points

### REST resources

- `GET /v1/organizations/{organizationId}/billing`
- `POST /v1/organizations/{organizationId}/billing/checkout-sessions` when a commercial provider is configured
- `POST /v1/organizations/{organizationId}/billing/portal-sessions` when a commercial provider is configured
- `POST /v1/organizations/{organizationId}/subscription/changes`
- `GET /v1/organizations/{organizationId}/entitlements`
- `POST /v1/internal/entitlements/check`
- `GET /v1/organizations/{organizationId}/usage`
- `GET /v1/organizations/{organizationId}/usage/export`
- `GET /v1/organizations/{organizationId}/invoices`
- `POST /v1/organizations/{organizationId}/usage-adjustments`
- `POST /v1/webhooks/billing/{provider}`

Internal admission APIs require authenticated service identity and still evaluate organization/workspace context. Public mutations require idempotency keys and revision preconditions.

### Events

`billing.account.updated`, `billing.provider_event.received`, `subscription.state_changed`, `subscription.plan_changed`, `entitlements.changed`, `usage.recorded`, `usage.adjusted`, `quota.reserved`, `quota.released`, `quota.exceeded`, and `organization.access_suspended`.

Events contain safe identifiers, quantities, units, and state, not payment credentials or source data.

### Extension points

- Billing-provider adapter for hosted checkout, portal, subscription operations, signed webhook verification, event normalization, and reconciliation.
- Meter registry that defines canonical unit, authoritative source, idempotency derivation, reservation behavior, and billable-success rule per usage key.
- Plan catalog importer that validates immutable versions and rejects removal of entitlement keys still referenced by subscriptions.
- Tax/invoice adapter for jurisdiction-specific documents without changing canonical monetary or usage records.

## Performance and capacity budgets

- Entitlement check: p95 under 30 ms from cache and p95 under 100 ms with PostgreSQL lookup.
- Reservation transaction including admission: p95 under 200 ms.
- Usage-event ingestion: sustained 10,000 events/second per deployment with idempotent batching and no ledger loss.
- Entitlement change propagation to API nodes and dispatchers: p95 under 30 seconds, maximum 60 seconds.
- Provider webhook acknowledgement after durable inbox write: under two seconds p95.
- Usage dashboard first page: p95 under 500 ms with aggregates no older than 15 minutes; admission always uses committed/reserved authoritative counters.
- Support at least 100 million ledger entries per billing period through partitioning and archival without mutating history.

## Observability and metrics

- Subscriptions by state/plan, grace age, suspension/reactivation, checkout completion, webhook verification, and reconciliation drift.
- Entitlement decisions by key/reason, evaluation latency, cache age, limit utilization, and rejected concurrency races.
- Usage ingestion lag, duplicate rate, adjustment volume, reservation age, expired reservations, and aggregate watermark.
- Provider API latency/error, out-of-order event count, unresolved mapping, invoice synchronization, and portal/checkout failures.
- Data-preservation monitors assert billing transitions never enqueue artifact deletion or change retention state.
- Logs use organization, subscription, plan, entitlement, decision, usage, and correlation IDs while redacting payer and provider-sensitive fields.

## Acceptance and testing

- Concurrency tests race coordinator admissions at one remaining unit and prove one atomic Job-plus-reservation result, no hard-limit oversubscription, and no orphan reservation after a rejected transaction.
- Offline-lease tests cover signature tampering, another Device/workspace, action or quantity excess, authorization/plan revision change on reconnect, clock rollback, expiry at 24 hours, and denial of cloud or external effects.
- Provider-independent tests boot with no billing credentials or provider network, create a private organization on `BUILT_IN_FREE`, apply an expiring `ADMIN_GRANTED` plan, enforce identical limits/reservations/usage, and prove commercial routes report `NOT_CONFIGURED` without impairing core use.
- Idempotency tests replay job completion, upload finalization, provider webhooks, checkout commands, usage batches, and adjustments.
- Lifecycle tests cover trial expiry, payment failure, 14-day grace, suspension, successful recovery, cancellation, downgrade overage, upgrade, and provider outage.
- Data-preservation tests snapshot artifact/evidence/job/comment/audit counts and hashes across every billing transition and prove no deletion or mutation.
- Security tests cover role boundaries, recent MFA, forged provider signatures, replayed events, cross-tenant billing IDs, support access, and encrypted fields.
- Local-mode tests prove local originals contribute zero cloud-storage bytes and never transfer for usage verification.
- Ledger reconciliation fixtures match object inventory, successful job results, seats, and provider quantities with explicit adjustments for every variance.
- Acceptance requires a suspended organization to sign in, inspect retained data, export it, remediate billing, and request deletion without starting new restricted paid work.

## Delivery and expansion

1. **Foundation release:** signed built-in Free/Development plans, Admin-granted subscriptions, core entitlements, storage/processing/seat usage, quotas, reservations, signed 24-hour offline entitlement leases, and organization usage views with no external provider requirement.
2. **Commercialization release:** first optional billing provider, hosted checkout/portal, commercial subscriptions, invoices, verified provider webhooks, payment-failure grace, suspension, and reconciliation.
3. **Administration and expansion:** plan changes, adjustments, advanced lease/support views, exports, additional currencies/providers/taxes, prepaid credits, enterprise contracts, and purchase-order invoicing may use the adapters and immutable ledger without weakening provider-independent enforcement or data preservation.
