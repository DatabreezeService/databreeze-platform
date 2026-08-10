# Domain and Data Model

**Status:** Product specification<br>
**Version:** 2.0

## 1. Modeling Rules

- PostgreSQL is the durable source of truth for control-plane and business state.
- Every tenant-owned table declares a primary scope. Organization administration rows include `organization_id`; workspace content rows include both `organization_id` and `workspace_id`; project-scoped rows also include `project_id`.
- Database constraints and application services verify the full tenant ancestry. No repository accepts an optional tenant filter or infers scope from an unverified client identifier.
- Identifiers are opaque UUIDs, preferably time-sortable UUIDv7 where supported.
- Timestamps are stored in UTC with timezone and rendered in the user’s locale.
- Money stores integer minor units plus ISO currency. Decimal quantities use explicit precision and scale.
- Original artifact versions, audit events, usage records, published report versions, and processor result envelopes are immutable.
- Mutable business entities use optimistic concurrency through a revision or ETag.
- Domain state changes occur through application services, not direct controller-to-repository access.

## 2. Tenant and Identity Domain

### User

Stores identity state, locale, security status, and profile. Authentication methods and recovery factors are separate records so one user may use password, passkey, or OIDC without changing identity.

### Organization

Owns legal/display identity, billing account, membership defaults, verified domains, and organization-wide policies.

### Workspace

Owns data mode, region, retention, modules, security policy, default language, and execution policy. A workspace belongs to exactly one organization.

### Project

Groups work for a client, location, period, or initiative. A customer-facing “Client” is `Project.kind = CLIENT`, not a separate tenant or identity domain. Project membership can narrow workspace access but cannot grant a capability absent from the workspace membership.

### Membership and role

Membership connects a user to an organization or workspace and references role assignments. Roles are collections of capabilities. Resource policies and assignments further narrow access.

### Device installation and Device identity

A Device installation is one physical/logical Desktop or Android app instance. It is a local concept and may hold more than one enrollment.

The canonical `Device`/`DeviceIdentity` record is one enrollment scoped to exactly one organization, with platform, owner, independent public key, attestation metadata where available, supported protocol versions, last activity, and permanent revocation state. A physical installation used with multiple organizations holds distinct Device identities. Workspace access is granted separately through device grants, so enrollment never gives blanket access to every workspace in the organization.

## 3. Artifact and Evidence Domain

### Artifact

Logical identity for a source or derived item:

- `id`, `workspace_id`, optional `project_id`
- display name and media type
- source kind such as upload, folder, Android capture, API, or derivative
- data classification and retention policy
- current version reference
- lifecycle state

### ArtifactVersion

Immutable snapshot:

- content hash and byte size
- creation source and actor/device
- zero or more typed `ContentPlacement` records for device-local and cloud-object copies
- encryption and key metadata without exposing key material
- parser-detected format and structural fingerprint
- predecessor version when the artifact changed
- acquisition time and source-modified time

A ContentPlacement binds one artifact/dataset version, payload class, content hash, placement kind, state, and optional Device identity. A local locator is opaque, meaningful only to its authorized source device, and never treated as a globally readable path. `IAE` owns placement identity; `DSO` owns transfer and live availability protocol.

### Derivation

Links one or more input artifact versions to an output artifact version with processor, recipe, parameters, and job step. It forms a directed acyclic provenance graph.

### EvidenceReference

References an artifact version and one typed coordinate:

- PDF page and bounding polygon
- Image bounding polygon
- Spreadsheet sheet, cell, range, table, or row
- Delimited-file row and column
- Structured record and JSON Pointer
- Audio/video time range
- Text character range
- Whole artifact

Evidence stores a normalized excerpt only when policy permits. The source coordinate remains authoritative.

## 4. Dataset Domain

### Dataset

A governed logical collection with:

- versioned schema
- semantic field definitions
- lineage to artifacts and transformations
- quality state
- storage location
- partition and refresh metadata
- access and retention policies

### DatasetVersion

An immutable logical snapshot or append watermark. Large data may be stored as Parquet in object storage or locally; PostgreSQL holds metadata, indexes, summaries, and references rather than every analytical cell.

### SchemaDefinition

A versioned collection of field names, stable field IDs, types, nullability, constraints, units, semantic descriptions, aliases, and sensitive-data classifications.

### MappingDefinition

Maps source fields to target stable field IDs and records conversions, defaults, confidence, reviewer, and source fingerprint compatibility.

## 5. Processing Domain

### ProcessorDefinition

Identifies a processor, semantic version, supported input/output schemas, required capabilities, resource class, deterministic status, and compatibility range.

### Recipe and RecipeVersion

`Recipe` is the user-facing identity. `RecipeVersion` is immutable and contains triggers, conditions, typed action graph, processor versions, review rules, outputs, and declared effects.

### Job and JobStep

Job stores workspace, actor, idempotency key, requested action, immutable input references, execution route, status, progress summary, entitlement reservation, and terminal outcome. Steps store attempts, leases, timing, checkpoints, and result envelopes.

### ReviewTask and Approval

JRA owns the canonical actionable `ReviewTask` envelope for uncertainty requiring correction or classification, including the exact subject/detail reference, workflow state, assignment, due time, and disposition history. The owning feature or DSM stores the immutable diagnostic detail and any versioned correction, linked by `jraReviewTaskId`; it does not create a second review authority.

JRA also owns `ApprovalPolicy`, `ApprovalRequest`, and `ApprovalDecision` for consequential actions. A module owns the exact release or effect subject and stores only the JRA request ID, bound resource version, and subject hash. Module-specific endpoints are application facades over JRA rather than independent decisions. A review is not automatically an approval.

## 6. Findings and Rules

### RuleDefinition and RuleVersion

A rule has a stable identity; each version is immutable and records expression, inputs, severity, parameters, ownership, tests, and activation dates.

### Finding

JRA owns the canonical actionable `Finding` envelope. It stores:

- stable workspace-keyed fingerprint, source subsystem, and immutable diagnostic-detail reference
- type, severity, workflow status, assignee, and due time
- calibrated confidence where applicable
- evidence references
- disposition, resolution-detail reference, actor, and timestamps

DSM or a feature module owns the immutable diagnostic detail: rule/processor version, normalized subject, affected or actual/expected values, reproduction metadata, and suggested resolution. That detail links `sharedFindingId`. Duplicate actionable findings use the stable fingerprint so reprocessing updates occurrence history rather than flooding users; it never rewrites historical diagnostic detail.

### Incident

Groups recurring or related findings for ownership, service-level tracking, root cause, and resolution.

## 7. Dashboards, Reports, and Collaboration

### Dashboard and DashboardVersion

Dashboard is the mutable workspace/project-scoped identity, ownership, audience configuration, and current-version pointers. DashboardVersion is immutable and references exact DSM dataset/schema/semantic/metric versions, pages, responsive layouts, widgets, filters/parameters, typed query/materialization definitions, freshness/publication policies, locale/timezone, parent version, and canonical hash.

### MaterializationDefinition and MaterializedResult

MaterializationDefinition binds one allowlisted typed plan, parameters, output schema/bounds, dependency set, incremental-compatibility declaration, engine requirements, and cache/retention policy. MaterializedResult is an immutable permission-scoped result over exact input/definition/engine versions with checksums, completeness/truncation, IAE object/evidence references, and a complete cache identity. It is a projection, never authoritative source data.

### DashboardSnapshot and RefreshOccurrence

DashboardSnapshot is an immutable complete publication unit binding one DashboardVersion, exact required MaterializedResults, input/permission/policy versions, freshness state, audience, approval reference where applicable, and manifest hash. RefreshOccurrence is the idempotent business projection of one on-change/manual/scheduled refresh and links its trigger range, selected definitions, JRA jobs/results, usage, prior/new snapshot IDs, and reason state. A partial occurrence cannot replace the last complete snapshot.

### DashboardFolderBinding and ReceiptCaptureProfile

DashboardFolderBinding references a DSO Device capability/grant, a local-only versioned manifest identity/hash, DSM target binding, Hybrid publication projection, content-safe health, and last accepted source fingerprint. Canonical paths/display names remain on Desktop. ReceiptCaptureProfile declares the bounded captured-field schema, confidence/review policy, deterministic reconciliation/duplicate rules, OCR adapter capability, and DSM target binding; IAE/DSM/JRA remain authoritative for its artifacts, governed records, jobs, and reviews.

### Report and ReportVersion

Report is the mutable identity and audience configuration. ReportVersion is immutable and references template version, dataset versions, definitions, evidence, render outputs, reviewer, and publication status.

### Comment

Comments attach to a supported target and may reference evidence. Edits retain revision history. Mentions create notification intents after authorization checks.

### Notification

Stores the event intent, recipient, channel eligibility, deduplication key, delivery state, and safe preview. Sensitive source data is not duplicated into notification records.

## 8. Entitlements, Usage, and Audit

### Entitlement

Resolves organization plan, add-ons, trial, contract overrides, and administrative grants into capabilities and limits with effective dates.

### UsageRecord

Immutable, idempotent measurement such as processed rows, pages, storage byte-hours, scheduled runs, or API calls. Aggregates are rebuildable.

### AuditEvent

The [Audit Ledger specification](../specs/foundation/audit-ledger.md) is authoritative. `AuditEvent` is an append-only, tenant-scoped record containing a versioned action, explicit actor type/ID snapshot, Device/session where applicable, exact subject references, authorization/policy references, outcome, correlation/causation, safe before/after summary, server sequence/time, schema version, and content hash. It excludes secrets, raw source values, evidence snippets, unrestricted paths, and unnecessary document contents. Domain timelines are projections or links, never separate audit authorities.

## 9. Synchronization Domain

### SyncChange

An append-only workspace sequence describing an authorized logical mutation, entity version, data classification, origin device, and payload or fetch reference.

### SyncCursor

Records the last acknowledged sequence for a device and scope.

### ClientMutation

A client-generated idempotent operation with base revision, local timestamp, and dependency references. The server records acceptance, conflict, or rejection.

## 10. Events and Outbox

Domain events are written to an outbox in the same transaction as state changes. Dispatchers publish versioned event envelopes containing:

- event ID and schema version
- event type and occurrence time
- workspace and correlation IDs
- actor and source component
- minimal payload or resource reference

Consumers are idempotent and record processed event IDs. Events do not contain raw secrets or entire sensitive artifacts.

## 11. Deletion and Retention

- User-facing deletion first marks applicable mutable records pending deletion.
- Retention evaluation checks legal hold, published reports, evidence references, billing obligations, and synchronization state.
- Cloud bytes are removed through a verifiable lifecycle job.
- Device-local originals remain under user control; DataBreeze removes its index and managed derivatives when instructed and reports anything it cannot remove.
- Immutable audit records may retain pseudonymized identifiers according to policy.
- Workspace export precedes destructive organization deletion when policy allows.

## 12. Indexing and Query Design

Organization-administration queries lead with `organization_id`. Workspace content queries lead with `organization_id, workspace_id`; project content additionally scopes by `project_id`. Common compound indexes cover status/time, project/time, artifact/current version, job/status/created time, finding/status/severity, and sync sequence.

Large lists use cursor pagination. Search begins with PostgreSQL full-text and structured filters. DDA materialized results are introduced for declared dashboard plans and measured reference workloads; other analytical summaries use maintained tables or materialized views only after query measurement. Cache/materialization keys include full TenantScope, permission projection, input/definition/plan/parameter/engine versions, and value-affecting locale/timezone. A separate search engine, warehouse, or streaming platform requires demonstrated need.
