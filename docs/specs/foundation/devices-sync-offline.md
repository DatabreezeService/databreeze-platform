# Devices, Synchronization, and Offline Operation

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.1 |
| Requirement prefix | `DSO` |
| Dependencies | `IAM` Identity, Workspaces, and Permissions; `IAE` Inbox, Artifacts, and Evidence; exposes route/capability and dispatch contracts composed with `JRA` by the application-layer `ExecutionAdmissionCoordinator` |

## Purpose

Define DSO's use of IAM-owned Device identities, operational capability grants, data-mode enforcement, cursor-based synchronization, resumable encrypted transfer, deterministic conflict handling, and offline operation for the Windows Desktop agent and native Android companion. The design lets users work with unreliable connectivity while ensuring `LOCAL` originals never upload and all synchronized mutations remain authorized and idempotent. A Desktop folder becomes Web-usable only through the explicit Cloud/Hybrid projection consent required by DDA-059.

## Scope and non-goals

### In scope

- Operational projection of IAM-owned Device identities and immediate enforcement of IAM activation, security-epoch, and revocation changes.
- Device capabilities for approved folders, capture, local processing, notifications, and evidence rendering.
- Workspace data modes `LOCAL`, `HYBRID` (default), and `CLOUD`.
- Append-only change logs, opaque cursors, push/pull batches, blob transfer, tombstones, conflicts, and recovery.
- Encrypted local queues and server reconciliation for offline capture, review, comments, and eligible jobs.
- Explicit user-mediated encrypted offline export/import packages for Local originals that must move between registered Android and Desktop Devices without cloud transport.

### Non-goals

- Arbitrary remote control of a Windows computer.
- Server-directed access to a path that the user has not approved locally.
- Whole-database replication or trusting client clocks as conflict authority.
- Promising remote erasure of files already stored on a lost device.
- Uploading originals, previews, OCR text, or reconstructable source fragments from a `LOCAL` workspace.
- Automatic peer discovery, background device-to-device relay, or representing a user-carried package as synchronization.
- Creating Device identity IDs, owning public keys, issuing enrollment challenges, activating identities, or authoritatively revoking them; those responsibilities belong only to IAM.

## Concepts and components

- **Device installation:** one physical/logical Desktop or Android app instance that may hold multiple organization-scoped enrollments.
- **Device identity:** the IAM-owned organization-scoped enrollment and public-key identity. DSO uses `iamDeviceId` as its only Device identifier and never creates a parallel identity, key, activation state, or revocation lifecycle.
- **Device key:** asymmetric signing key generated on device and protected by Windows credential storage/DPAPI or Android Keystore; IAM owns the public-key record and identity lifecycle, while DSO verifies IAM-authorized signatures for its operations.
- **Capability:** narrowly scoped permission such as one opaque approved-folder handle, local processor version, capture support, or evidence render. A Local evidence-render capability displays content on that same source device; it is not permission to relay content through the control plane.
- **Device grant:** server- and user-approved use of a capability for one workspace and action class.
- **Workspace data-mode policy version:** DSO-owned immutable matrix over data classification and synchronization payload class plus allowed placements, executors, destinations, offline-package behavior, and derived-result confirmation policy.
- **Data-mode policy manifest:** signed, Device/audience-bound, expiring offline projection of one exact WorkspaceDataModePolicyVersion and authorization epoch; clients verify it before local routing or transfer.
- **Change record:** immutable ordered description of one committed aggregate revision.
- **Sync cursor:** opaque server-issued position in one workspace feed for one protocol version.
- **Offline operation:** client-generated idempotent command with base revision, authorization snapshot, and dependency references.
- **Conflict record:** durable user-visible record when deterministic merge is unsafe.
- **Tombstone:** non-content deletion marker retained long enough for every active device to converge.
- **Execution route decision:** immutable, expiring DSO decision that selects cloud or one eligible Device from input placement, data mode, action capabilities, device health, authorization epoch, and policy revision. It authorizes no Job by itself.
- **User-mediated offline package:** encrypted, source-Device-signed file explicitly exported by a user and explicitly imported on a registered destination Device through removable media or an OS-selected local transfer. It never traverses the DataBreeze control plane and is not automatic peer synchronization.

### Components

- IAM DeviceIdentity adapter and authorization projection, keyed only by `iamDeviceId`.
- DSO Device capability, workspace-grant, operational-health, routing, sync, and transfer services.
- Workspace data-mode policy registry, intersection evaluator, and signed manifest issuer.
- Execution-route and capability evaluator exposed to the application-layer admission coordinator.
- Workspace change-log writer backed by PostgreSQL.
- Sync gateway for pull, push, cursor checkpoint, and batch acknowledgement.
- Resumable encrypted blob-transfer service.
- Desktop and Android encrypted offline queues.
- Conflict detector/resolver and tombstone service.
- Device dispatch gateway shared with `JRA`.

## Subsystem workflows

### IAM enrollment and DSO operational activation

1. IAM enrolls and activates the organization-scoped DeviceIdentity through its challenge, proof-of-possession, membership, MFA, and permanent-revocation contract.
2. DSO receives only the active `iamDeviceId`, organization, platform, security epoch, and content-safe status projection; it does not copy or replace IAM's public-key or lifecycle authority.
3. The client reports typed DSO capabilities for that IAM identity. DSO validates versions and constraints, records operational health, and issues no workspace grant merely because a capability exists.
4. The user confirms requested capabilities on Web or the same authenticated client. Folder grants still require a separate local picker and explicit workspace binding.
5. Every grant, route, sync, transfer, or dispatch rechecks active IAM identity and security epoch; a stale projection fails closed.

### Initial synchronization

1. The client negotiates protocol version and sends device ID, workspace ID, last cursor if any, and supported schemas.
2. The server authorizes the device and returns a policy manifest, encryption parameters, current feed watermark, and a bounded snapshot when no cursor exists.
3. The client applies records transactionally to its local database, verifies per-record and batch hashes, and stores the returned cursor only after the local commit.
4. Large allowed blobs transfer separately by resumable chunk manifest. Metadata references remain pending until required chunks verify.

### Incremental pull and push

- **Pull:** the client requests changes after an opaque cursor. Records are ordered by server sequence, may be redelivered, and are idempotently applied by event ID and aggregate revision.
- **Push:** the client submits up to 100 offline operations with stable operation IDs, base revisions, dependencies, and signatures. The server processes each operation transactionally and returns `APPLIED`, `DUPLICATE`, `CONFLICT`, `REJECTED`, or `DEPENDENCY_PENDING`.
- The next pull contains the server-authoritative results, including the originating operation ID so the client can retire its queue entry.

### Data-mode routing

| Synchronization payload class | Local mode | Hybrid mode | Cloud mode |
|---|---|---|---|
| `CONTROL_METADATA` | May synchronize | Synchronizes | Synchronizes |
| `APPROVED_DERIVED_RESULT` | Synchronizes only with a valid resource-bound confirmation | Synchronizes by workspace/classification policy | Synchronizes by workspace/classification policy |
| `RECONSTRUCTABLE_DERIVED_CONTENT` | Source device only | Policy-selectable and off by default for Confidential/Restricted data | Cloud allowed by policy |
| `ORIGINAL_CONTENT` | Source Device by default; never transferred through cloud. It may move only through an explicit user-mediated encrypted offline package governed by DSO-025. | Local by default; cloud transfer requires explicit policy/user action | Cloud object allowed |

Evidence coordinates without snippets are `CONTROL_METADATA` and resolve on the source device when content is Local. A payload’s data classification is evaluated independently and may only make this table stricter.

Data-mode changes are prospective. Moving to a more cloud-permissive mode does not upload existing originals until an explicit migration plan is confirmed. Moving to a stricter mode stops new transfer immediately and creates a reviewed cloud-purge plan; it never claims that existing replicas vanished before verification.

The Workspace DataMode policy is always the maximum authority. A project, artifact, dataset, recipe, form, monitor, feature, or job may bind a `dataModeConstraint` or an `effectiveDataModePolicyRef` only to make placement, processing location, synchronization payload classes, or retention stricter. Before every route, execution, transfer, or resumption, DSO resolves the intersection with the current Workspace policy; no cached or feature-level setting may broaden it.

DSO publishes each policy change as a new immutable WorkspaceDataModePolicyVersion with a canonical hash. IAM Workspace records only stable/current policy IDs and a content-safe mode projection for authorization and UI; IAM does not own the matrix. A client uses a DataModePolicyManifest only after verifying schema, workspace, audience/Device, authorization epoch, policy version/hash, issue/expiry, signer/key version, and signature. Local encryption protects a cached manifest's confidentiality but is not proof of authenticity.

### User-mediated Local export/import

1. On the source Device, an authorized user selects exact immutable ArtifactVersions or provisional capture items, a registered destination Device when known, and a declared processing purpose.
2. DSO checks the current or unexpired offline authorization snapshot, workspace Local policy, data classification, destination capability, byte limit, and allowed purpose. The user sees the exact item count, sizes, classifications, destination, expiry, and warning that DataBreeze cannot remotely erase exported copies.
3. The source creates a canonical manifest, signs it with the source Device key, encrypts every entry with an authenticated content key, and wraps that key to the destination Device public key. A separately allowed passphrase recovery mode uses the published memory-hard KDF profile and shows that DataBreeze cannot recover the passphrase.
4. The user deliberately moves the package using removable media or an OS-selected local share. No server endpoint, live relay, background discovery, or DataBreeze peer connection carries package bytes.
5. The destination requires an explicit import, verifies recipient/workspace/purpose, manifest signature, authorization snapshot, expiry, hashes, sizes, classifications, key envelope, and local policy before decrypting into an isolated temporary directory.
6. Successful import creates an IAE `DEVICE_LOCAL` ContentPlacement for the same immutable ArtifactVersion, or a provisional IAE intake linked to the original client intake ID when the server has not registered it yet, plus a content-safe import receipt and lineage. Failed verification decrypts nothing into the library and quarantines or deletes temporary material.
7. On the next sync, the server re-authorizes both Device identities, package/receipt, content identity, placements, and purpose. A rejected receipt remains quarantined; it never invents a canonical Job or approved data movement.

### Conflict resolution

- Immutable artifact versions, comments, decisions, job results, audit events, usage records, and change records are append-only and deduplicate by ID/hash.
- Membership, security policy, device status, entitlements, approval state, job state, and retention state are server-authoritative; conflicting offline mutations are rejected.
- Scalar artifact/inbox metadata uses optimistic concurrency. Disjoint field edits with the same base revision merge; overlapping edits create a ConflictRecord instead of last-write-wins.
- Tags use an observed-remove set keyed by operation ID.
- Assignment, due date, and workflow state require exact base revision because silent merge could change responsibility.
- Extraction corrections to different fields merge; corrections to the same field and source version create a conflict with both candidate values and evidence.
- Recipe publication is server-only. Offline draft edits produce a new draft revision; concurrent graph edits create a conflict.
- Deletes synchronize as tombstones. An offline edit against a tombstone is rejected and preserved locally for export or explicit restore request.

### Revocation

IAM is the sole revocation authority. DSO consumes `iam.device.revoked` and also checks IAM synchronously at protected admission boundaries; revocation immediately blocks new sync requests, blob grants, routes, and job leases. Gateways close active connections within 60 seconds. A connected device, or the first reconnect from an offline device, sees `DEVICE_REVOKED`. Limited offline work may continue only until its pre-issued authorization snapshot expires, no later than 24 hours; local data remains encrypted and is not silently deleted or represented as remotely wiped.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| DSO-001 | P0 | DSO shall use the IAM DeviceIdentity ID as its only Device identity key and shall not store a second public key, organization/user ownership record, enrollment state, activation state, or authoritative revocation status. |
| DSO-002 | P0 | DSO capabilities and grants shall require an `ACTIVE` IAM DeviceIdentity with a matching organization and current security epoch; IAM alone shall own the enrollment challenge, proof-of-possession registration, explicit activation, and identity limits. |
| DSO-003 | P0 | IAM revocation or security-epoch change shall make DSO block new sync, blob, stream, route, transfer, and job-dispatch operations immediately and terminate connected-client grants within 60 seconds; cached offline grants shall expire within 24 hours and fail closed on reconnect, without claiming remote wipe. |
| DSO-004 | P0 | Synchronization shall use an append-only workspace change log and opaque cursor; it shall not rely on timestamp polling, client clocks, or Redis history. |
| DSO-005 | P0 | Pull batches and offline pushes shall be idempotent and safely repeatable after timeout, crash, lost acknowledgement, or cursor replay. |
| DSO-006 | P0 | All synchronized commands shall be re-authorized server-side for principal, device, workspace, project, resource, action, data mode, and entitlement. |
| DSO-007 | P0 | `LOCAL` mode shall technically prevent upload of original bytes and reconstructable derived content, including chunks, previews, OCR/transcripts, thumbnails, row/cell values, and source snippets, regardless of client request; only a separately confirmed approved derived result may synchronize. |
| DSO-008 | P0 | Hybrid mode shall be the default and shall synchronize only the explicit data classifications and synchronization payload classes enabled by the workspace policy manifest. |
| DSO-009 | P0 | Blob transfer shall be resumable, chunk-hashed, content-hash verified, encrypted in transit and at rest, and published only after complete verification. |
| DSO-010 | P0 | Offline queues shall be encrypted, append-only until acknowledged, dependency-aware, and keyed by stable operation IDs generated before first execution. |
| DSO-011 | P0 | Conflict handling shall follow the explicit per-entity rules in this specification and shall never silently use last-write-wins for assignments, workflow state, approvals, security, billing, or overlapping corrections. |
| DSO-012 | P0 | A sync cursor shall advance on a client only after the entire corresponding local transaction commits; partial application shall replay the same batch. |
| DSO-013 | P0 | Folder capabilities shall be created only through a local OS picker, represented to the cloud by opaque IDs and policy metadata, and limited to approved typed actions. |
| DSO-014 | P1 | The server shall retain tombstones for at least 90 days and longer than the maximum supported offline interval, with administrative export before a stale device is forced to resnapshot. |
| DSO-015 | P1 | Initial sync shall use a bounded consistent snapshot plus change-log watermark so concurrent mutations are neither missed nor duplicated. |
| DSO-016 | P1 | Clients shall support schema-version negotiation and preserve unknown forward-compatible fields; an unsupported breaking version shall require upgrade without corrupting the queue. |
| DSO-017 | P1 | A device shall report capability versions, local engine version, last sync, queue depth, and coarse health without sending local paths, file names, or source values. |
| DSO-018 | P1 | Data-mode transitions shall be audited, require Admin authority and recent MFA, and use explicit migration or verified purge workflows for existing replicas. |
| DSO-019 | P1 | Offline operations rejected after authorization or policy change shall be quarantined with a stable reason and export option; the client shall not repeatedly resubmit them. |
| DSO-020 | P1 | The system shall expose whether each artifact version is `LOCAL_ONLY`, `CLOUD_ONLY`, or `REPLICATED` and identify available devices without revealing filesystem paths. |
| DSO-021 | P0 | Every sync cursor shall be bound to principal, device, workspace, effective authorization scope, authorization epoch, data-mode policy, audience, and schema version; any scope change shall invalidate it, force an authorized resnapshot, backfill newly visible history, and lock then purge managed cache that is no longer authorized. |
| DSO-022 | P0 | Synchronizing an `APPROVED_DERIVED_RESULT` from Local mode shall require an immutable confirmation bound to resource/version, content hash, schema, data classification, policy revision, actor, source Device, destination, and time; a changed subject or policy shall require a new confirmation. |
| DSO-023 | P0 | DSO shall never reactivate an IAM-revoked DeviceIdentity; recovery shall reference a newly enrolled IAM identity and use an authorized import/reconciliation workflow for preserved local records. |
| DSO-024 | P0 | An execution route decision shall bind workspace, input placement/version hashes, action type/version, required capabilities, selected target/device when local, data-mode policy revision, authorization epoch, decision subject hash, and expiry; JRA creation shall reject a stale or mismatched decision, and DSO shall not create Jobs directly. |
| DSO-025 | P0 | A Local `ORIGINAL_CONTENT` item may leave its source Device only through an explicit user-mediated offline package whose manifest binds workspace, source/destination Devices or approved passphrase mode, exact content IDs/hashes/sizes/classifications, purpose, policy and authorization revisions, expiry, encryption/key-envelope profile, source signature, and package hash; import shall verify every binding, create IAE placement/lineage plus an auditable receipt, and shall never use cloud storage, a live relay, background peer transfer, or an unregistered destination. |
| DSO-026 | P0 | Workspace DataMode shall be the maximum authority; project, resource, module, recipe, and job constraints may only narrow it, and every placement, route, execution, transfer, resume, or sync admission shall enforce the intersection with current Workspace policy and fail closed when a cached effective-policy reference is stale. |
| DSO-027 | P0 | DSO shall own immutable WorkspaceDataModePolicyVersions and signed DataModePolicyManifests binding workspace, mode, classification-by-payload matrix, allowed placements/executors/destinations, confirmation/offline-package rules, canonical hash, authorization epoch, audience/Device, schema version, issue/expiry no later than the associated IAM offline snapshot or 24 hours, and signer/key version; clients shall reject tampered, stale, wrong-audience, or unsupported manifests, and cache encryption shall not replace signature verification. |

## Domain and data contracts

### Workspace data-mode policy

```text
WorkspaceDataModePolicy {
  id, workspaceId, currentVersionId, revision
}

WorkspaceDataModePolicyVersion {
  id, policyId, ordinal, mode: LOCAL|HYBRID|CLOUD,
  classificationPayloadMatrix,
  allowedPlacementKinds[], allowedExecutorClasses[],
  allowedDestinationClasses[],
  approvedDerivedResultPolicy,
  offlinePackagePolicy,
  parentVersionId?, canonicalHash, publishedBy, publishedAt
}

DataModePolicyManifest {
  schemaVersion, workspaceId, policyId, policyVersionId,
  mode, classificationPayloadMatrix,
  allowedPlacementKinds[], allowedExecutorClasses[],
  allowedDestinationClasses[],
  approvedDerivedResultPolicy, offlinePackagePolicy,
  canonicalHash, authorizationEpoch,
  audience, deviceId?, issuedAt, expiresAt,
  signingAlgorithm, signingKeyId, signature
}
```

The manifest contains the complete effective Workspace maximum for its audience, not feature source values. Resource/module constraints remain separately versioned inputs to the intersection evaluator and cannot change the signed Workspace policy.

### IAM Device operational projection and capability records

```text
DeviceOperationalProjection {
  iamDeviceId, organizationId, platform: WINDOWS|ANDROID,
  iamStatusProjection: PENDING|ACTIVE|REVOKED,
  iamSecurityEpoch, protocolVersions[], appVersion, engineVersion?,
  lastSeenAt, lastSyncAt?, healthClass, revision
}

DeviceCapability {
  id, iamDeviceId, type: APPROVED_FOLDER|LOCAL_PROCESSOR|CAPTURE|
      EVIDENCE_RENDER|LOCAL_NOTIFICATION,
  opaqueLocalHandle?, constraintDigest, status, reportedAt
}

DeviceGrant {
  id, iamDeviceId, workspaceId, capabilityId,
  allowedActionTypes[],
  allowedDataClassifications[]: PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED,
  synchronizationPayloadClasses[]: CONTROL_METADATA|APPROVED_DERIVED_RESULT|
      RECONSTRUCTABLE_DERIVED_CONTENT|ORIGINAL_CONTENT,
  expiresAt?, revision
}

ApprovedDerivedResultConfirmation {
  id, workspaceId, sourceDeviceId,
  resourceType, resourceId, resourceVersion,
  contentHash, schemaId?, schemaVersion?,
  dataClassification, payloadClass: APPROVED_DERIVED_RESULT,
  policyVersion, actorId, destinationKind, destinationId?,
  confirmedAt, invalidatedAt?
}

ExecutionRouteDecision {
  id, workspaceId, actionType, actionVersion,
  inputPlacementVersionHashes[], requiredCapabilities[],
  target: CLOUD|DEVICE, targetDeviceId?,
  dataModePolicyVersion, authorizationEpoch,
  subjectHash, decidedAt, expiresAt
}
```

`DeviceOperationalProjection` is a content-safe cache for routing and observability, not authentication or identity authority. Every protected admission validates its IAM identity/security epoch directly or through a freshness-bounded IAM decision; stale or unavailable authority fails closed.

### Change and sync records

```text
WorkspaceChange {
  eventId, workspaceId, sequence, aggregateType, aggregateId,
  aggregateRevision, operation: UPSERT|TOMBSTONE,
  schemaVersion, payload, contentHash, committedAt
}

SyncBatch {
  protocolVersion, workspaceId, fromCursor, toCursor,
  authorizationEpoch, scopeDigest, policyVersion,
  watermark, records[], batchHash
}

OfflineOperation {
  operationId, deviceId, actorId, workspaceId,
  commandType, commandVersion, aggregateId?,
  baseRevision?, dependencyOperationIds[], payloadHash,
  authorizationSnapshotId, createdAt, signature
}

OperationResult {
  operationId, status: APPLIED|DUPLICATE|CONFLICT|REJECTED|DEPENDENCY_PENDING,
  aggregateId?, aggregateRevision?, conflictId?, reasonCode?, committedEventId?
}

ConflictRecord {
  id, workspaceId, aggregateType, aggregateId,
  baseRevision, serverRevision, operationId,
  conflictingFields[], serverCandidate, clientCandidate,
  status: OPEN|RESOLVED_SERVER|RESOLVED_CLIENT|RESOLVED_MERGED,
  resolvedBy?, resolvedAt?
}
```

Payloads are filtered by the current data-mode policy before change-log insertion for a device audience. Sensitive values use dedicated content endpoints and are not embedded in general change records.

### Transfer manifest

```text
BlobTransferManifest {
  id, workspaceId, artifactVersionId, direction,
  totalBytes, sha256, chunkSize, chunkHashes[],
  dataClassification, synchronizationPayloadClass,
  approvedDerivedResultConfirmationId?,
  encryption: { algorithm, keyEnvelopeId },
  expiresAt, allowedDeviceId?, state
}

OfflinePackageManifest {
  packageId, workspaceId, sourceDeviceId, destinationDeviceId?,
  recipientMode: DEVICE_KEY|USER_PASSPHRASE,
  purpose, entries[]: {
    artifactVersionId?, clientIntakeId?, contentHash,
    byteLength, mediaType, dataClassification, payloadClass
  },
  policyVersion, authorizationSnapshotId,
  encryptionProfile, keyEnvelope, createdAt, expiresAt,
  manifestHash, sourceSigningKeyId, sourceSignature
}

OfflinePackageImportReceipt {
  receiptId, packageId, workspaceId,
  sourceDeviceId, destinationDeviceId,
  verifiedManifestHash, importedPlacementIds[],
  importedClientIntakeIds[], purpose, importedBy,
  importedAt, reconciliationState: PENDING|ACCEPTED|QUARANTINED
}
```

Transfer grants bind one Device identity, content placement/resource version, direction, data classification, synchronization payload class, policy version, and expiry. Local approved-derived transfer also binds its confirmation. AES-256-GCM object/chunk encryption uses unique nonces; TLS 1.3 is required for network transfer.

`IAE` owns durable ContentPlacement identity and content hashes. `DSO` owns live availability, transfer sessions, data-mode admission, and confirmation enforcement, and may create or update a placement only through the authorized `IAE` application contract after verification.

An OfflinePackageManifest and its encrypted entries are local user-carried files, not BlobTransferManifest sessions. Only the content-safe receipt may synchronize. Deleting the exported package after a successful import is user-visible and best-effort; DataBreeze never claims remote deletion from removable media or another unmanaged copy.

## Permissions, security, and privacy

- Device authentication supplements, and never replaces, user/service and resource authorization.
- Sync endpoints accept only device-bound access tokens and request signatures covering method, path, body hash, nonce, and timestamp.
- Server-provided policy manifests are signed and cached with expiry. A missing or invalid manifest fails closed for transfer and privileged offline actions.
- Policy verification keys rotate with explicit key IDs and overlap metadata. A revoked key or expired/wrong-audience DataModePolicyManifest cannot authorize an offline route, package, content placement, or synchronization.
- Local databases, queues, and blob caches are encrypted with device-protected keys. Sensitive values are excluded from OS backup unless the workspace policy explicitly permits protected backup.
- Folder paths and Android content URIs never enter cloud logs or domain events. Display names shown on the originating device are stored locally.
- Capability reports describe action types and limits, not directory enumeration or file contents.
- Push/pull responses are tenant-filtered before serialization and padded/rate-limited where enumeration timing could reveal hidden resource volume.

## Offline, failure, and recovery

- Offline authorization snapshots expire after 24 hours and may only permit documented capture, draft, comment, review, and local-job operations. Approval, membership, billing, policy, and deletion changes require online authority.
- A queue entry moves to acknowledged only after a matching server result is committed locally. Crashes before that point cause harmless replay.
- Cursor expiry or incompatible schema initiates a resnapshot; unsent local operations are exported, replayed after the snapshot when safe, or presented as conflicts.
- Authorization expansion, reduction, or data-mode change invalidates the old cursor. Expansion snapshots all newly visible historical state; reduction applies a signed lock manifest before replacing local managed state, while unauthorized unsynchronized work is quarantined rather than silently deleted.
- Missing blob chunks remain resumable. A failed final hash discards the assembled temporary object and retains verified chunks until session expiry.
- Offline-package import uses an isolated encrypted staging directory and an atomic publish step. Crash recovery re-verifies the signed manifest and entry hashes; it never exposes a partially imported ArtifactVersion.
- A destination working offline may accept a package only under unexpired signed Device, authorization, and policy snapshots. Its receipt remains `PENDING`, and any server rejection quarantines the imported placement from further governed execution.
- Clock differences affect display only; ordering and conflict checks use server sequence and revisions.
- Database corruption recovery restores the last locally encrypted checkpoint, reapplies the server snapshot, then replays verified offline operations.
- Server disaster recovery preserves workspace sequences or creates a new feed generation that forces a safe resnapshot.

## APIs, events, and extension points

### REST and stream resources

IAM owns `POST /v1/devices/enrollment-challenges`, `POST /v1/devices/enroll`, `POST /v1/devices/{deviceId}/activate`, `GET /v1/organizations/{organizationId}/devices`, and `POST /v1/devices/{deviceId}/revoke`.

- `PUT /v1/devices/{iamDeviceId}/capabilities`
- `POST /v1/devices/{iamDeviceId}/grants`
- `GET /v1/devices/{iamDeviceId}/operational-state`
- `GET /v1/workspaces/{workspaceId}/data-mode-policy`
- `POST /v1/workspaces/{workspaceId}/data-mode-policy/versions`
- `GET /v1/workspaces/{workspaceId}/data-mode-policy-manifest`
- `GET /v1/workspaces/{workspaceId}/sync/snapshot`
- `GET /v1/workspaces/{workspaceId}/sync/changes?cursor=...`
- `POST /v1/workspaces/{workspaceId}/sync/operations`
- `POST /v1/blob-transfers`, `PUT /v1/blob-transfers/{id}/chunks/{number}`, `POST /v1/blob-transfers/{id}/finalize`
- `POST /v1/workspaces/{workspaceId}/offline-package-receipts` accepts content-safe import receipts only; package manifests and bytes remain local
- Authenticated WebSocket `/v1/device-dispatch` for signed typed job delivery only

### Events

DSO consumes `iam.device.enrolled`, `iam.device.activated`, `iam.device.revoked`, and IAM security-epoch changes. DSO emits `dso.device.capabilities_changed`, `dso.device.grant_changed`, `dso.device.health_changed`, `sync.operation.applied`, `sync.operation.rejected`, `sync.conflict.created`, `sync.conflict.resolved`, `sync.cursor.expired`, `blob.transfer.completed`, `workspace.data_mode_policy.published`, and `workspace.data_mode.changed`.

Events use the transactional outbox. Device health telemetry is operational data, not a durable domain event unless it changes device state.

### Extension points

- Versioned sync serializers by aggregate and audience.
- Conflict strategies registered per aggregate/field and limited to deterministic declarative rules.
- Blob-store adapters with range transfer, digest verification, encryption, and abort.
- Device capability types registered by platform releases; cloud requests cannot invent unknown local capabilities.

## Performance and capacity budgets

- Incremental sync poll with no changes: p95 under 250 ms.
- A pull batch contains at most 1,000 records or 5 MiB uncompressed and returns within p95 1 second under normal load.
- A push batch contains at most 100 operations or 2 MiB and returns per-item outcomes within p95 1.5 seconds excluding blob transfer.
- Cursor-to-device propagation while online: p95 under five seconds for ordinary metadata.
- Resume transfers at chunk boundaries with no more than one chunk of repeated transfer; hashing uses bounded memory under 128 MiB.
- Support 100 active devices per organization by default, 10 million change records per busy workspace, and 30 days offline before warning; tombstone retention remains at least 90 days.
- Local queue shall support 100,000 metadata operations and 20 GiB of staged user-approved content subject to device storage policy.

## Observability and metrics

- Active/revoked/stale devices, enrollment failures, capability versions, last-seen distribution, and revocation propagation.
- Pull/push rate, batch size, change-log lag, cursor age, replay count, duplicate operation count, and resnapshot count.
- Offline queue depth/age, operation outcomes, conflict rate by aggregate/field, and conflict resolution time.
- Blob bytes by data classification, synchronization payload class, and mode; confirmation use/rejection; resume rate; hash mismatch; transfer failure; and verified completion latency.
- Content-safe offline-package export/import counts, bytes, purpose, verification/reconciliation outcomes, expiry, and quarantine reason; no file name, path, content value, passphrase, or package byte is telemetry.
- A privacy canary alerts on local paths, content URIs, source snippets, or original-byte transfer attempts from `LOCAL` workspaces.
- Traces carry device, workspace, cursor generation, operation, batch, and correlation IDs without source content.

## Acceptance and testing

- Protocol tests interrupt before and after every local commit, server commit, cursor write, batch acknowledgement, and blob chunk, then prove convergence without duplicates.
- Conflict fixtures cover overlapping/disjoint metadata edits, tags, assignments, extraction fields, recipe drafts, tombstones, comments, approvals, and security records.
- Local-mode packet and server-object tests prove forbidden content never leaves the device even with a modified client request.
- Revocation tests cover active WebSocket dispatch, refresh, pull, push, blob upload/download, evidence render, and offline queue reconciliation.
- Cryptographic tests cover nonce replay, invalid signatures, key rotation, wrong device binding, corrupt chunks, wrong manifest, and expired policy.
- Offline-package tests cover explicit consent, source/destination binding, Device-key and approved passphrase profiles, wrong workspace/purpose, modified/extra/missing entries, expiry, revoked or offline Devices, crash staging, duplicate import, receipt reconciliation, and prove zero package bytes traverse DataBreeze network endpoints.
- Scale tests meet change-log, batch, queue, and device budgets.
- Android background restrictions and Windows sleep/network transitions are exercised in end-to-end tests.
- Acceptance requires two devices and Web to converge to identical authorized metadata after arbitrary connection loss, with every unsafe overlap represented by a ConflictRecord.
- Scope-change tests prove that expanded access receives older authorized records, reduced access cannot read retained cache, a revoked stream closes within budget, and no cursor can be replayed under a different authorization epoch or scope digest.
- Policy-layering tests attempt to broaden Workspace DataMode from every project/resource/module constraint and from a stale job, transfer, offline package, and sync cursor; all fail closed, while stricter constraints remain effective.
- Data-mode manifest tests tamper with the matrix, placements, executors, destinations, confirmation/package rules, hash, workspace, audience/Device, authorization epoch, schema, expiry, signer, and cached verification key; every mismatch fails closed even when the local cache is encrypted.

## Delivery and expansion

1. **Foundation release:** IAM DeviceIdentity integration and revocation enforcement, capability reporting, Hybrid default, metadata sync, offline queue, explicit conflict records, resumable allowed blobs, and explicit user-mediated encrypted Local export/import packages.
2. **Reliability release:** data-mode migrations, encrypted snapshots, stale-device resnapshot, advanced health, and conflict administration.
3. **Expansion:** customer-managed encryption, additional device classes, automatic local-network relay, and selective peer synchronization may be added only if policy enforcement, Device identity, content-class filtering, explicit consent, and auditable server convergence remain intact. These future transports do not replace the Foundation user-carried package contract.
