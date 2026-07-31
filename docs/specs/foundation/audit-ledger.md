# Audit Ledger

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.0 |
| Requirement prefix | `AUD` |
| Dependencies | `IAM` principal, authorization, and TenantScope contracts; every foundation and feature emits through the AUD application contract |

## Purpose

Define the authoritative, append-only history of security-relevant and business-significant activity across DataBreeze. The Audit Ledger makes an authorized action, denial, approval, data movement, definition change, device event, job effect, billing transition, and administrative decision attributable and reviewable without copying customer source content into logs.

The ledger is durable business data in PostgreSQL. It is distinct from application logs, traces, analytics, notifications, domain state, and the event-delivery outbox.

## Scope and non-goals

### In scope

- Versioned audit action definitions and mandatory event fields.
- Human, service-account, Device, system, and provider actor attribution.
- Tenant/resource scope, authorization and policy references, correlation, causation, outcome, and safe before/after summaries.
- Transactional recording, idempotency, per-workspace ordering, integrity sealing, retention, legal hold, query, and signed export.
- Local/offline audit fragments and their server acceptance or quarantine.
- Audit access control, access auditing, privacy minimization, recovery, monitoring, and tests.

### Non-goals

- Storing originals, extracted rows, evidence snippets, secrets, credentials, full webhook bodies, or arbitrary request/response payloads.
- Replacing the authoritative state and immutable details owned by IAM, IAE, JRA, DSM, DSO, INT, NCO, BUA, or a feature module.
- Replacing observability logs, distributed traces, security alerts, or product analytics.
- Claiming that a database hash is a blockchain, legal signature, or certified WORM archive.
- Providing unscoped organization-wide employee surveillance or cross-customer analytics.

## Concepts and components

- **Audit action definition:** versioned registry entry for an action key, category, risk class, mandatory subjects, allowed outcomes, reason requirements, safe-change fields, and retention class.
- **Audit event:** immutable record of one attempted or completed action and its attributable context.
- **Subject reference:** exact tenant-scoped resource type, ID, version/revision, and hash where meaningful.
- **Principal snapshot:** minimal immutable attribution captured at action time; later account changes do not rewrite it.
- **Safe change summary:** typed field-level state transition containing permitted display values or hashes, never an unrestricted object dump.
- **Workspace sequence:** server-assigned monotonic order within one workspace; it does not claim global wall-clock order.
- **Audit seal:** periodic independently stored checkpoint over an exact event sequence range and its Merkle root.
- **Audit export:** immutable, policy-filtered event package plus manifest, checksum, schema version, and signature.
- **Local audit fragment:** Device-signed offline record that is not canonical until the server accepts the related operation.

### Components

- Audit action registry and schema validator.
- Transactional AUD append application contract in the control-plane modular monolith.
- Append-only PostgreSQL partitions and per-scope sequence allocator.
- Integrity-seal builder, verifier, and independently protected seal storage.
- Authorized query, evidence-resolution, and export services.
- Retention/legal-hold coordinator.
- Offline-fragment verifier and reconciliation adapter.
- Integrity, ingestion, access, and export metrics/alerts.

## Subsystem workflows

### Record an action

1. The owning application service authorizes the command and resolves its exact TenantScope, actor, action definition, subjects, policy decisions, and correlation ID.
2. For a mandatory audited mutation, the same PostgreSQL unit of work writes the domain change, one canonical AuditEvent, and any delivery outbox records. A failed audit insert aborts the mutation.
3. The AUD contract canonicalizes and schema-validates the event, derives a stable idempotency identity, allocates the workspace or organization sequence, and rejects scope or subject mismatches.
4. The event is appended with a content hash. No caller receives an update or delete capability.
5. Non-mutating denials, sensitive reads, exports, login events, and external callbacks are appended through a durable AUD command before the response is considered complete.

### Query and inspect history

1. A caller requests a bounded organization or workspace feed with time, action, category, actor, subject, outcome, device, job, approval, or correlation filters.
2. IAM authorizes audit access and separately checks any protected subject/detail resolution.
3. AUD returns content-safe event fields in sequence order using a stable cursor. It never embeds a source preview merely because the caller can read audit metadata.
4. Opening a linked subject or evidence reference invokes its owning service and current authorization.
5. Audit reads, searches of privileged categories, and exports are themselves audited without recursively generating an unbounded loop.

### Seal and verify integrity

1. A background process selects a closed contiguous sequence range.
2. It verifies every event content hash, builds a deterministic Merkle root, and writes an immutable AuditSeal.
3. A copy of the signed seal is stored outside the event-table write role.
4. Scheduled and on-demand verification compare events, roots, signatures, and sequence continuity. Any mismatch creates a security alert and blocks affected exports from being labeled verified.

### Export

An authorized user defines scope, filters, purpose, and format. Export runs asynchronously against a recorded upper sequence watermark. The result contains JSON Lines or CSV event data, a machine-readable manifest, action/schema dictionaries, range/watermark, redaction disclosure, event and package hashes, signer identity, and verification instructions. Export creation and download are audited.

### Retention and legal hold

Each action definition selects a published retention class. The default for privileged security, approval, data movement, billing, and administrative events is at least 365 days unless an applicable deployment policy requires a different legally reviewed period. A legal hold prevents expiry. Expiry is a governed batch operation that retains a content-safe tombstone and seal continuity record; it never silently rewrites surviving events.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| AUD-001 | P0 | AUD shall be the sole authoritative audit ledger; application logs, analytics, outboxes, provider dashboards, and module-specific timelines shall not substitute for it. |
| AUD-002 | P0 | Every mandatory audited mutation shall persist its domain change and canonical AuditEvent in one PostgreSQL transaction; failure to append the audit event shall abort the mutation. |
| AUD-003 | P0 | Audit events shall be insert-only to application roles; corrections shall append a linked correction event, and no public or internal application API shall update or delete an existing event. |
| AUD-004 | P0 | Every AuditEvent shall carry full applicable TenantScope, action key/version, category, risk class, outcome, server time, principal snapshot, subject references, source subsystem, correlation ID, idempotency identity, schema version, and content hash. |
| AUD-005 | P0 | Human, service-account, Device, system, and provider actors shall use explicit actor types and immutable identifiers; display labels shall be snapshots for interpretation and shall never become authorization evidence. |
| AUD-006 | P0 | Every subject reference shall include resource type and tenant-scoped ID plus version/revision/hash when the action depends on exact content; cross-scope subjects shall be rejected before append. |
| AUD-007 | P0 | AUD shall deduplicate a repeated producer operation/action/subject identity and return the original event ID; a replay with the same identity and different canonical content shall be quarantined and alerted. |
| AUD-008 | P0 | Each workspace shall have a server-assigned monotonic AuditEvent sequence; organization-only events shall use a separate organization sequence, and neither sequence shall depend on client clocks. |
| AUD-009 | P0 | Audit action definitions shall be versioned, immutable after publication, and declare mandatory context, permitted outcomes, reason policy, safe-change fields, retention class, and whether failure must block the owning action. |
| AUD-010 | P0 | Safe before/after summaries shall use allowlisted typed fields or salted hashes and shall exclude secrets, credentials, raw source values, evidence excerpts, unrestricted paths, full external payloads, and payment credentials. |
| AUD-011 | P0 | Login/recovery, authorization denial where safe, membership/role/policy change, privileged read/export, Device lifecycle, data-mode/content movement, retention/deletion, definition publication, job effect, review/approval, connector/credential, billing, and support action classes shall be registered and audited. |
| AUD-012 | P0 | Audit query and export shall require explicit IAM permissions and TenantScope/resource checks; audit access shall never imply access to linked source content, evidence, billing secrets, or another workspace. |
| AUD-013 | P0 | Reading privileged audit categories, creating or downloading an export, changing retention, applying a legal hold, verifying a seal, or using support tooling shall itself create a bounded non-recursive AuditEvent. |
| AUD-014 | P0 | Periodic seals shall cover contiguous closed sequence ranges using deterministic event hashes and a Merkle root, be signed by a rotating control-plane key, and be copied to storage unavailable to the event-table write role. |
| AUD-015 | P0 | Integrity verification shall detect missing, reordered, duplicated, or altered events and invalid or missing seals; a failure shall raise a security alert and mark the affected range and exports unverified without rewriting history. |
| AUD-016 | P0 | Retention expiry shall follow the action's published retention class, active legal holds, tenant policy, and applicable deployment policy; it shall be auditable and preserve content-safe tombstones plus seal continuity. |
| AUD-017 | P0 | Query APIs shall use stable cursor pagination, bounded time ranges, deterministic ordering, field allowlists, and safe filters; callers shall not supply arbitrary SQL, expressions, or export templates. |
| AUD-018 | P0 | Audit exports shall pin TenantScope, filters, upper sequence watermark, event/action schema versions, redaction policy, event count, checksums, signer/key version, creation actor/time, purpose, and expiry in an immutable manifest. |
| AUD-019 | P0 | Local and Hybrid policy shall permit only content-safe AuditEvent metadata as `CONTROL_METADATA`; Local source content, paths, values, previews, and evidence snippets shall never enter the canonical ledger. |
| AUD-020 | P0 | An offline action shall create a Device-signed LocalAuditFragment linked to its operation and authorization snapshot; it becomes a canonical AuditEvent only after server verification and acceptance. A rejected, tampered, wrong-scope, or revoked-Device fragment shall remain quarantined and exportable under policy, and the server shall append its own content-safe canonical rejection AuditEvent without treating the fragment's claimed action as accepted. |
| AUD-021 | P0 | Restored deployments shall verify sequence continuity and the latest independent seals before privileged mutations resume; audit partitions, action definitions, holds, exports, keys, and seal records shall be included in disaster recovery. |
| AUD-022 | P1 | Authorized administrators shall create scoped legal holds and retention exceptions with reason, authority reference, effective period, and immutable release history; a hold shall not broaden event visibility. |
| AUD-023 | P1 | AUD shall support signed JSON Lines and CSV exports with a canonical JSON manifest and independently documented verification procedure; presentation PDFs may be derived but shall not be the verification source. |
| AUD-024 | P1 | New action definitions and actor/subject types shall pass schema, privacy, retention, authorization, idempotency, and golden-fixture review before registration; extensions shall not emit arbitrary untyped payloads. |

## Domain and data contracts

```text
AuditActionDefinition {
  actionKey, version, category, riskClass,
  requiredActorContext[], requiredSubjectTypes[],
  allowedOutcomes[], reasonPolicy, safeChangeFieldPolicy,
  retentionClass, blockActionOnAuditFailure, schemaHash,
  publishedAt
}

AuditEvent {
  id, organizationId, workspaceId?, projectId?,
  scopeSequence, occurredAt, recordedAt,
  actionKey, actionVersion, category, riskClass, outcome,
  principal: {
    type: HUMAN|SERVICE_ACCOUNT|DEVICE|SYSTEM|PROVIDER,
    principalId, userId?, serviceAccountId?, deviceId?,
    displayLabelSnapshot?, organizationMembershipId?
  },
  sessionId?, authorizationDecisionId?, policyVersion?,
  sourceSubsystem, subjectRefs[], relatedRefs[],
  jobId?, approvalRequestId?, correlationId, causationId?,
  idempotencyIdentity, reasonCode?, changeSummary?,
  ipClass?, clientClass?, schemaVersion, contentHash
}

AuditSubjectRef {
  resourceType, resourceId, resourceVersion?, resourceHash?
}

AuditChangeSummary {
  fields[]: {
    fieldKey, beforeState?, afterState?,
    beforeHash?, afterHash?, dataClassification, displayPolicy
  }
}

LocalAuditFragment {
  fragmentId, organizationId, workspaceId, deviceId,
  operationId, authorizationSnapshotId,
  actionKey, subjectRefs[], outcome, localOccurredAt,
  canonicalPayloadHash, signingKeyId, signature
}

AuditSeal {
  id, organizationId, workspaceId?,
  firstSequence, lastSequence, eventCount, merkleRoot,
  previousSealId?, algorithm, signingKeyId,
  createdAt, externalCopyLocator, verificationState
}

AuditExport {
  id, organizationId, workspaceId?, requestedBy,
  purpose, filterDefinition, upperSequenceWatermark,
  format, eventCount, redactionPolicyVersion,
  packageHash, manifestHash, signingKeyId,
  state: QUEUED|RUNNING|READY|FAILED|EXPIRED,
  createdAt, expiresAt
}
```

`TenantScope` from the specification index applies even where an illustrative nested reference omits it. Database constraints and the AUD append contract validate subject ancestry. A subject display label may be resolved at read time but is not copied into the immutable event unless the action definition permits a content-safe snapshot.

## Permissions, security, and privacy

- Initial permissions are `audit.read.workspace`, `audit.read.organization`, `audit.export`, `audit.verify`, `audit.retention.manage`, and `audit.hold.manage`; IAM evaluates them at request time.
- Organization audit access uses explicit organization projections and does not bypass workspace/resource rules.
- Event-table application roles receive append and scoped read capabilities only. Seal signing, external seal storage, retention, and export use separate identities.
- Signing keys rotate with overlapping verification metadata. Private keys never appear in events, exports, logs, or client applications.
- IP data is coarse or keyed/pseudonymized according to deployment policy. Raw headers, user-agent strings, and geolocation are not retained by default.
- Sensitive details remain in their owning domain and are resolved only after fresh authorization. Export redaction cannot be disabled by a client flag.
- Internal support has no default audit access. Any time-bounded access grant, query, and export is itself auditable.

## Offline, failure, and recovery

- Desktop and Android append LocalAuditFragments before considering an offline mutation locally complete. Fragments use Device keys and encrypted queues.
- Server acceptance binds the fragment to the canonical operation result. A Device clock is preserved as untrusted context; `recordedAt` and ordering are server-owned.
- Duplicate sync is harmless. A payload-hash mismatch, revoked key, expired authorization snapshot, wrong TenantScope, or rejected operation quarantines the fragment.
- A transient AUD append failure aborts mandatory server mutations. Non-mutating denial/read events use a durable bounded retry inbox and emit an operational alert if the response must proceed for availability or safety.
- Partition rollover and seal building are restartable and idempotent. An incomplete seal is discarded and rebuilt from committed events.
- Recovery restores the latest consistent database point, verifies seal continuity, rebuilds indexes/projections, and exposes any disaster-recovery gap against the published RPO.
- Local-only fragments on a lost Device may be unrecoverable; the product states this explicitly and never invents canonical history.

## APIs, events, and extension points

### REST resources

- `GET /v1/workspaces/{workspaceId}/audit-events`
- `GET /v1/organizations/{organizationId}/audit-events`
- `GET /v1/audit-events/{auditEventId}`
- `POST /v1/workspaces/{workspaceId}/audit-exports`
- `GET /v1/audit-exports/{auditExportId}`
- `POST /v1/audit-seals/{auditSealId}/verify`
- `POST /v1/workspaces/{workspaceId}/audit-holds`
- `POST /v1/audit-holds/{auditHoldId}/release`
- Internal schema-validated append, offline-fragment acceptance, seal, and retention commands

Events are `audit.seal.created`, `audit.integrity_failed`, `audit.export.ready`, `audit.export.failed`, `audit.hold.created`, and `audit.hold.released`. They contain only content-safe identifiers and state. AuditEvent creation itself is not republished as a generic external domain event, avoiding recursive or high-volume leakage.

Extension points are versioned audit action definitions, safe subject renderers, export serializers, seal-signing adapters, and independently protected seal stores. They accept typed contracts only and cannot weaken mandatory fields or privacy policy.

## Performance and capacity budgets

- Mandatory AuditEvent append adds no more than 50 ms at p95 to a normal transactional mutation on published reference infrastructure.
- A workspace audit feed first page returns within 500 ms at p95 for a bounded indexed query; privileged organization queries return within two seconds at p95.
- The ledger sustains at least 10,000 appended events per second per control-plane deployment with horizontal API scaling and partitioned PostgreSQL.
- Default page size is 100, maximum 1,000 events or 5 MiB. Default query window is 30 days; broader queries use asynchronous export.
- Seal creation completes within 15 minutes of a range closing. Integrity alerts fire within five minutes of verification failure.
- Exports stream with bounded memory, expose progress, and expire from download storage after the configured period without deleting ledger events.

## Observability and metrics

- Append latency/error, transaction aborts caused by audit failure, duplicate identities, mismatch quarantines, and per-action volume.
- Sequence gaps, unsealed age, seal duration, verification status, key age, and external-copy failures.
- Query latency, denied queries, privileged-category reads, export queue/duration/size/download, and redaction counts.
- Retention candidates, held events, expiry batches, tombstones, and policy exceptions.
- Offline fragment age, acceptance, rejection reason, signature failure, and lost-Device disclosure.
- Alerts contain event IDs, ranges, action keys, and safe scope identifiers, never source values or unrestricted change summaries.

## Acceptance and testing

- Transaction tests force audit insert, sequence, and outbox failures and prove mandatory domain mutations do not commit without exactly one canonical AuditEvent.
- Immutability tests prove application roles and APIs cannot update or delete events and corrections append new linked events.
- Tenant tests probe organization/workspace/project and subject mismatches, guessed IDs, organization projections, support access, and export boundaries.
- Privacy fixtures attempt secrets, tokens, source rows, evidence snippets, local paths, webhook bodies, payment credentials, and unrestricted diffs and prove schema/policy rejection.
- Idempotency tests replay identical and conflicting producer identities through synchronous, outbox, provider, and offline paths.
- Ordering tests use concurrent writers and clock skew and prove complete monotonic per-scope sequences without claiming global time order.
- Integrity tests alter, remove, reorder, and duplicate event copies and seals; verification identifies the exact affected range and marks exports unverified.
- Retention/legal-hold tests cover policy changes, holds, release, expiry, tombstones, independent seals, and disaster recovery.
- Query/export tests cover every filter, cursor stability, upper watermark, redaction, manifest/signature verification, expiry, and audit-of-audit access without recursion.
- Offline tests cover Device signatures, duplicate sync, revoked devices, stale authorization, rejected operations, clock rollback, quarantine, and accepted canonical linkage.
- End-to-end acceptance performs one security change, Local artifact action, cloud job, review, approval, connector callback, billing transition, audit query, and signed export, then verifies attribution, TenantScope, hashes, linked domain state, privacy minimization, and seal integrity.

## Delivery and expansion

1. **Foundation release:** action registry, transactional append, core action classes, typed safe summaries, per-scope sequence, workspace query, Device-signed offline fragments, baseline 365-day privileged retention class, integrity seals, and audit history UI.
2. **Governance release:** organization projections, signed exports, legal holds, retention administration, independent verification tooling, and security alerts.
3. **Expansion:** dedicated compliance archive adapters, customer-managed seal keys, additional export formats, and jurisdiction profiles may be added without moving domain content into audit events or weakening append-only authority.
