# Inbox, Artifacts, and Evidence

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.1 |
| Requirement prefix | `IAE` |
| Dependencies | `IAM` Identity, Workspaces, and Permissions |

## Purpose

Define the shared intake, immutable artifact, version, lineage, and evidence layer for user-controlled files, documents, photos, voice recordings, and datasets. This layer gives all DataBreeze modules one trustworthy origin for processing and makes every extraction, finding, correction, and report traceable to a page, sheet, cell, row, region, text span, or time range. DDA source catalogs and OCR profiles reference IAE originals and evidence without creating a second retention or byte authority (`DDA-052`, `DDA-057`, `DDA-059`).

## Scope and non-goals

### In scope

- Inbox intake from Web, approved Windows folders, Android capture/share, and authenticated APIs.
- Immutable artifact originals, versions, content hashing, object storage, local references, and retention state.
- Metadata classification, duplicate detection, quarantine, correction versions, derived outputs, and lineage.
- Evidence references and coordinate transforms that remain resolvable across derived outputs.
- Data-mode-aware storage for `LOCAL`, `HYBRID`, and `CLOUD`.

### Non-goals

- Scraping private sites, inboxes, or marketplace accounts without an approved integration and user authorization.
- Treating a mutable filesystem path as the identity of an artifact.
- Editing or overwriting an original object.
- Claiming a finding is verified when its evidence cannot be resolved.
- Cross-tenant content deduplication that reveals whether another customer owns matching content.

## Concepts and components

- **Inbox item:** workflow envelope for newly captured or imported content, with source, state, assignee, and routing status.
- **Artifact:** stable business identity for one logical source, such as a quote, workbook, invoice, photo set, voice note, or dataset.
- **Artifact version:** immutable bytes or immutable external/local content reference plus cryptographic digest and media metadata.
- **Original version:** bytes exactly as received. It is never replaced, normalized in place, or silently recompressed.
- **Correction version:** a new user-confirmed representation linked to the prior version and reason.
- **Derived artifact:** an output such as normalized CSV, extracted text, thumbnail, audit report, or published report.
- **Dataset:** schema-bearing tabular or record collection derived from one or more artifact versions.
- **Evidence reference:** typed coordinates into a specific artifact version or dataset snapshot.
- **Lineage edge:** typed relationship between source evidence and derived coordinates.
- **Storage locator:** encrypted locator for cloud object bytes or a device-scoped local handle; raw user paths are not exposed to other surfaces.
- **Retention state:** `ACTIVE`, `ARCHIVED`, `LEGAL_HOLD`, `DELETION_PENDING`, or `DELETED`.

### Components

- Intake gateway and resumable upload service.
- Inbox routing and quarantine service.
- Artifact metadata and version service in PostgreSQL.
- S3-compatible cloud object adapter with immutable object keys and retention controls.
- Local artifact resolvers on Desktop and Android.
- Hashing, media inspection, malware scanning, and safe-preview pipeline.
- Evidence resolver and lineage graph.
- Retention/deletion coordinator using the canonical `AUD` transactional append contract.

## Subsystem workflows

### Intake and finalization

1. An authorized client creates an intake with workspace, optional project, declared media type, byte length, data mode, and an idempotency key.
2. The system chooses `LOCAL_REFERENCE` or `CLOUD_UPLOAD` from workspace policy; a client cannot override `LOCAL` to upload original bytes.
3. Cloud uploads use resumable parts. Desktop local intake reads an approved folder capability and computes the digest without disclosing the path. Android finalizes an app-private capture/share item as a `DEVICE_LOCAL` ContentPlacement bound to the originating Android Device and computes its digest without exposing a content URI.
4. Finalization verifies byte length, SHA-256 digest, declared media type, magic bytes, and scan result.
5. One transaction creates the Artifact, immutable ArtifactVersion, InboxItem, canonical `AUD` AuditEvent, and outbox event. Failed finalization creates none of them.
6. A byte-identical duplicate in the same workspace is linked as a duplicate intake only when the user confirms or workspace policy permits it; it does not overwrite prior business context.

### Classification and routing

The routing service assigns artifact kind and confidence using deterministic rules first and optional provider-neutral AI second. Low confidence, password protection, unsupported format, malware suspicion, or policy mismatch moves the inbox item to `NEEDS_REVIEW` or `QUARANTINED`; it never silently discards bytes.

### Correction and derived output

1. A user corrects extracted fields or supplies replacement source bytes.
2. Field corrections create a versioned extraction record; replacement bytes create a new ArtifactVersion of kind `CORRECTION`.
3. Processing writes a new derived ArtifactVersion or DatasetSnapshot.
4. The output records source version IDs, recipe and processor versions, and lineage edges for every material value.
5. Prior versions and evidence remain resolvable and are never retargeted to new bytes.

### Evidence navigation

A client requests an EvidenceReference. For cloud-eligible content, the resolver authorizes the underlying artifact, retrieves only the required page/tile/sheet/row region, applies stored coordinate transforms, and returns a short-lived view descriptor. For `LOCAL` content, a non-source client receives an `OPEN_ON_SOURCE_DEVICE` descriptor and may ask the control plane to queue a content-free open request. The source device—Desktop or the originating Android capture device—re-authorizes and renders the coordinate locally; no image, text, pixels, preview, or original bytes are relayed to another client or cloud storage. A user who wants another surface to see a rendition must explicitly publish a new derived artifact under Hybrid or Cloud policy.

### Retention and deletion

Deletion is a distinct IAE-owned authorized workflow. Effective deletion eligibility is the strictest applicable result of the Workspace minimum, a resource/module retention constraint, evidence/report lineage, active approval, legal hold, AUD retention class, and a configurable recovery window of at least seven days. A feature submits a request or constraint and never deletes IAE bytes directly. Local cache cleanup may remove a verified disposable replica but is not authoritative retention or deletion. Billing suspension never initiates deletion. Deletion tombstones IAE identifiers as required and appends canonical AUD history while object erasure is verified asynchronously; AUD retention remains independently governed.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| IAE-001 | P0 | Every intake shall create at most one InboxItem and one initial ArtifactVersion for a given workspace and idempotency key. |
| IAE-002 | P0 | Original ArtifactVersion bytes shall be immutable, stored under non-overwritable keys or device handles, and verified with SHA-256 plus byte length. |
| IAE-003 | P0 | Corrections, conversions, redactions, OCR text, thumbnails, and exports shall create new versioned records and shall never mutate or replace an original. |
| IAE-004 | P0 | `LOCAL` mode shall never upload original bytes or reconstructable derived content, including previews, OCR/transcripts, row/cell values, thumbnails, source snippets, or chunks; only policy-approved metadata and separately confirmed approved derived outputs may synchronize. |
| IAE-005 | P0 | Every extracted material value, finding, and report assertion shall carry one or more EvidenceReferences or be explicitly marked `UNSUPPORTED_BY_SOURCE`. |
| IAE-006 | P0 | EvidenceReference coordinates shall be typed, version-bound, validated against media geometry, and resolvable to the exact source version used for processing. |
| IAE-007 | P0 | Derived outputs shall store source version IDs, processor/recipe versions, and coordinate lineage so evidence survives conversion, normalization, filtering, and aggregation. |
| IAE-008 | P0 | Object downloads, previews, evidence tiles, and local-render requests shall re-evaluate `IAM` resource authorization at access time and use short-lived single-resource grants. |
| IAE-009 | P0 | Upload finalization shall verify content digest, actual media signature, size policy, scan state, and tenant ownership before publishing the artifact-created event. |
| IAE-010 | P0 | Suspected malicious content shall be quarantined, excluded from processing and preview, and visible only to permitted administrators through content-free metadata. |
| IAE-011 | P0 | Content hashes shall not enable cross-workspace existence queries or cross-tenant deduplication side channels. |
| IAE-012 | P0 | Source changes detected during processing shall create a new version and mark affected outputs stale; running work shall finish against its pinned source or stop according to recipe policy. |
| IAE-013 | P1 | Inbox items shall support assignment, labels, priority, due date, and states `NEW`, `ROUTED`, `NEEDS_REVIEW`, `PROCESSING`, `RESOLVED`, `QUARANTINED`, and `ARCHIVED`. |
| IAE-014 | P1 | Resumable cloud uploads shall resume at verified part boundaries and reject a final digest mismatch without exposing partial objects. |
| IAE-015 | P1 | Password-protected documents shall retain the original and request credentials locally or through a secret input that is never persisted in logs or artifact metadata. |
| IAE-016 | P1 | Retention deletion shall use explicit authorization, recent MFA for destructive organization-wide operations, legal-hold checks, tombstones, and verified object erasure. |
| IAE-017 | P1 | Same-workspace duplicate detection shall preserve separate intake context and shall not merge artifacts with distinct project, supplier, period, or approval history automatically. |
| IAE-018 | P1 | Export packages shall include a machine-readable manifest of artifact/version hashes, lineage, evidence references, processor versions, and approval state. |
| IAE-019 | P0 | Resolving evidence whose source is `LOCAL` shall return an open-on-source-device descriptor or `SOURCE_OFFLINE`; another Device receives content only through a verified DSO-025 user-mediated offline package that creates its own `DEVICE_LOCAL` placement or through explicit publication as a governed derived artifact, never through an implicit live-render relay. |
| IAE-020 | P0 | An ArtifactVersion or DatasetSnapshot shall support zero or more typed content placements across authorized devices and cloud objects; availability shall be derived from verified placements rather than one mutable storage class or locator. |
| IAE-021 | P0 | IAE shall alone determine authoritative deletion eligibility from the Workspace retention minimum, resource/module retention constraints, evidence/report lineage, active approvals, legal holds, AUD retention class, and recovery window; features shall never delete IAE bytes directly, and local cache cleanup shall not represent authoritative retention or deletion. |

## Domain and data contracts

### Artifact records

```text
InboxItem {
  id, workspaceId, projectId?, artifactId, sourceType,
  state, assigneeId?, labels[], priority, dueAt?,
  classification, confidence?, createdAt, revision
}

Artifact {
  id, workspaceId, projectId?, kind, title,
  currentVersionId, retentionState, createdBy, createdAt, revision
}

ArtifactVersion {
  id, artifactId, ordinal, versionKind: ORIGINAL|CORRECTION|DERIVED,
  mediaType, byteLength, sha256,
  sourceVersionIds[], createdBy, createdAt
}

DatasetSnapshot {
  id, artifactVersionId?, workspaceId, schemaVersion,
  rowCount, contentHash, createdAt
}

ContentPlacement {
  id, workspaceId,
  resourceType: ARTIFACT_VERSION|DATASET_SNAPSHOT,
  resourceId,
  kind: DEVICE_LOCAL|CLOUD_OBJECT,
  deviceId?, opaqueLocator,
  payloadClass: ORIGINAL_CONTENT|RECONSTRUCTABLE_DERIVED_CONTENT|
      APPROVED_DERIVED_RESULT,
  state: PENDING|AVAILABLE|UNAVAILABLE|PENDING_DELETE|DELETED,
  byteLength, contentHash, verifiedAt?, lastSeenAt?, createdAt
}

LineageEdge {
  id, workspaceId, fromEvidenceId, toResourceType, toResourceId,
  transformType, transformPayload, processorVersion
}
```

`ArtifactVersion(artifactId, ordinal)` and cloud object keys are unique. `sha256` is indexed only inside a workspace-scoped keyed digest to prevent cross-tenant probing. `currentVersionId` is a convenience pointer and never changes historical references.

`IAE` owns content identity and the durable `ContentPlacement` records. `DSO` owns transfer sessions, live device availability, placement verification, and data-mode enforcement, then updates placements through the `IAE` application contract. `LOCAL_ONLY`, `CLOUD_ONLY`, `REPLICATED`, and `UNAVAILABLE` are derived availability views, not mutable storage fields. A raw local locator is opaque outside its source device.

### EvidenceReference

```text
EvidenceReference {
  id, workspaceId,
  targetType: ARTIFACT_VERSION|DATASET_SNAPSHOT,
  targetId,
  coordinate:
    PDF_PAGE { page, bbox:[x0,y0,x1,y1], unit, textHash? } |
    SHEET_RANGE { sheetId, sheetNameAtCapture, a1Range, cellHashes? } |
    TABLE_CELL { tableId, stableRowKey, columnId } |
    DATASET_ROW { snapshotId, stableRowKey, columnId? } |
    IMAGE_REGION { x, y, width, height, normalized:true } |
    AUDIO_RANGE { startMs, endMs, transcriptSpanId? } |
    TEXT_RANGE { startUtf8, endUtf8, contextHash },
  label?, createdAt
}
```

Page numbers are one-based at API boundaries. Bounding boxes are normalized or carry an explicit unit and page geometry. Spreadsheet evidence uses stable sheet IDs when available and retains the captured sheet name. Dataset rows require a deterministic stable row key; physical row number alone is insufficient after filtering or sorting.

### Lineage transforms

Supported transform types are `IDENTITY`, `PAGE_RENDER`, `OCR_SPAN`, `SHEET_CELL_COPY`, `ROW_KEY_MAP`, `COLUMN_MAP`, `FILTER`, `GROUP_AGGREGATE`, and `MANUAL_ASSERTION`. Aggregate evidence stores the contributing reference set or a content-hashed evidence-set manifest; sampling is never represented as complete evidence.

## Permissions, security, and privacy

- Artifact access is evaluated against workspace, project, retention state, version, requested representation, and action.
- Original download is a separate permission from preview, derived-output read, evidence view, and export.
- Signed object URLs expire within five minutes, bind one object and disposition, and are issued only after authorization; object storage is not publicly listable.
- Local storage locators are opaque device handles encrypted for that device. Cloud services do not receive raw Windows paths.
- File names, OCR text, extracted values, thumbnails, and evidence snippets are sensitive content and are excluded from general logs, analytics, notification payloads, and malware alerts.
- Safe preview isolates active content, macros, embedded scripts, external links, and formula execution. DataBreeze does not execute document macros.
- Encryption uses TLS in transit, managed encryption at rest for cloud objects, and platform-protected keys for local caches.

## Offline, failure, and recovery

- Desktop and Android stage intake in an encrypted local queue with an operation ID, content hash, and intended scope.
- Interrupted uploads resume by upload session and verified part checksum; abandoned partial objects expire after 24 hours.
- In `LOCAL` mode, losing the sole device may make original bytes unrecoverable. The product must show this state and offer user-controlled backup/export, never imply cloud recovery.
- If metadata commits but outbox delivery is delayed, an outbox relay republishes the event; consumers deduplicate by event ID.
- If object upload succeeds but database finalization fails, the unreferenced object is quarantined and garbage-collected after reconciliation.
- Evidence resolution failures return stable reasons: `SOURCE_OFFLINE`, `SOURCE_REVOKED`, `VERSION_DELETED`, `COORDINATE_STALE`, or `ACCESS_DENIED`. They do not silently jump to another version.
- Restored databases reconcile object manifests by ID, length, and hash before objects become downloadable.

## APIs, events, and extension points

### REST resources

- `POST /v1/workspaces/{workspaceId}/intakes`
- `POST /v1/intakes/{intakeId}/upload-sessions`
- `PUT /v1/upload-sessions/{sessionId}/parts/{partNumber}`
- `POST /v1/intakes/{intakeId}/finalize`
- `GET /v1/workspaces/{workspaceId}/inbox`
- `PATCH /v1/inbox-items/{inboxItemId}`
- `GET /v1/artifacts/{artifactId}` and `GET /v1/artifacts/{artifactId}/versions`
- `POST /v1/artifacts/{artifactId}/versions`
- `POST /v1/artifact-versions/{versionId}/preview-grants`
- `GET /v1/evidence/{evidenceId}/resolve`
- `POST /v1/artifacts/{artifactId}/deletion-requests`
- `POST /v1/workspaces/{workspaceId}/exports`

Create/finalize endpoints require idempotency keys. Updates require `If-Match`. List endpoints use stable cursor order by `(createdAt,id)`.

### Domain events

`inbox.item.created`, `inbox.item.state_changed`, `artifact.created`, `artifact.version.created`, `artifact.version.quarantined`, `artifact.source_changed`, `artifact.deletion.requested`, `artifact.deleted`, `evidence.created`, and `evidence.resolution_failed`.

Events contain identifiers and safe classification metadata, not source text or file names unless the consumer is explicitly content-authorized and retrieves them through the API.

### Extension points

- Intake adapters implement `inspect`, `stage`, `finalize`, and `abort` and declare whether they can transmit original bytes.
- Media processors emit a versioned extraction schema plus EvidenceReferences and lineage edges.
- Storage adapters implement immutability, range read, digest verification, retention, and verified deletion.
- Evidence coordinate types are versioned tagged unions; unknown types remain storable and return an unsupported-render response instead of being discarded.

## Performance and capacity budgets

- Create-intake response: p95 under 300 ms excluding byte transfer.
- Upload part size: 8-64 MiB; support resumable objects up to 20 GiB on Web and Desktop and device-policy-limited capture on Android.
- Artifact metadata read: p95 under 200 ms; a 50-item inbox page: p95 under 500 ms.
- Evidence metadata resolution: p95 under 250 ms; preview tile delivery: p95 under 1.5 seconds when cloud-resident and warm.
- Hashing and upload shall stream with bounded memory below 128 MiB independent of source size.
- A workspace shall support at least 10 million artifact versions and 100 million evidence references with partitioned indexes and cursor pagination.

## Observability and metrics

- Intake attempts, completion rate, duplicate rate, bytes by data mode, media type, source, and storage class.
- Upload resume count, digest mismatch, orphan objects, quarantine outcomes, scan latency, and classification confidence bands.
- Evidence coverage ratio for material output fields, resolution success by coordinate type, stale-coordinate rate, and lineage fan-out.
- Retention queue age, legal-hold blocks, deletion verification latency, and object/database reconciliation drift.
- Traces link intake, artifact, version, job, and correlation IDs while excluding paths, names, source text, and evidence snippets.

## Acceptance and testing

- Golden fixtures cover PDF coordinates, rotated images, merged spreadsheet cells, renamed sheets, filtered rows, duplicate row values, audio ranges, UTF-8 text offsets, and aggregate lineage.
- Immutability tests prove no API, administrator path, storage retry, or correction can overwrite an original object key or ArtifactVersion.
- Local-mode network-capture tests prove original bytes, previews, OCR/transcripts, row/cell values, thumbnails, source snippets, and local paths never leave the device unless the user explicitly publishes an allowed derived output.
- Tenant-isolation tests cover metadata, hashes, upload sessions, signed URLs, preview tiles, evidence, exports, and deletion requests.
- Retention-layering tests prove a feature cannot shorten the Workspace minimum or bypass lineage, approval, legal hold, AUD class, or recovery window; local cache cleanup leaves canonical retention and other placements unchanged.
- Resumable-upload tests interrupt every part boundary, retry finalization, corrupt checksums, and verify one final ArtifactVersion.
- Source-change tests prove old evidence remains bound to the old version and affected outputs become stale.
- Malware and active-content tests prove quarantine and safe-preview isolation.
- Acceptance requires a report value to navigate to the exact source coordinate on an authorized surface or return an explicit resolution reason. For Local evidence, a non-source client can request Open on Source Device but receives no rendered content through the control plane.

## Delivery and expansion

1. **Foundation release:** Web/Desktop/Android intake, immutable originals, cloud/local storage locators, Inbox, core evidence types, safe preview, and source lineage.
2. **Trust release:** correction versions, derived datasets, export manifests, quarantine administration, retention, and verified deletion.
3. **Expansion:** additional media/evidence types, customer-managed encryption keys, archival storage tiers, and approved connector intakes may be added through the adapter contracts without changing artifact identity or original immutability.
