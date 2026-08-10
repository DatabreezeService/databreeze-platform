# DataBreeze Embedded Importer

> **Status:** Product specification<br>
> **Delivery position:** Post-V1 specialist extension; not part of the Data-to-Dashboard Agent V1 release gate.<br>
> **Version:** 1.0<br>
> **Requirement prefix:** `EI`<br>
> **Dependencies:** `IAM` identity, organizations, service accounts, RBAC, and authoritative DeviceIdentity/key/activation/revocation lifecycle; `INT` public API, credentials, idempotency, webhooks, and connector conventions; `DSM` schemas, mappings, rules, validation, datasets, and lineage; `IAE` immutable artifacts, evidence, retention, and byte deletion; `JRA` typed jobs, result manifests, durable job state, and authoritative ApprovalPolicy/ApprovalRequest/ApprovalDecision contracts when a commit requires approval; `DSO` DeviceCapability/DeviceGrant lifecycle, operational health/connection, Local/Hybrid/Cloud policy, and gateway synchronization; `NCO` notifications; `BUA` usage and entitlements; Python processing engine; object storage

## 1. Purpose and outcome

Embedded Importer is a customer-facing SDK and API for adding file upload, column mapping, validation, correction, and import-status experiences to another product without giving that product broad access to DataBreeze. Each import runs against an immutable workspace-scoped schema version and produces a validated, evidence-linked dataset or a structured rejection result.

The module supports hosted embedding, direct APIs, resumable uploads, signed webhooks, customer branding, and a Windows local gateway for files that must remain on a controlled network. Android is limited to administrative alerts and status review; it is not an end-user import surface.

An `ImporterCustomerPartition` is an importer-managed namespace for one external customer's data inside exactly one DataBreeze Workspace. It is subordinate to that Workspace and is never an IAM tenant, organization/workspace boundary, membership domain, or authentication authority. Its stable uniqueness key is `(workspaceId, environment, externalTenantRef)`.

## 2. Users and jobs-to-be-done

| User | Job to be done |
|---|---|
| Customer developer | Embed a secure importer, create sessions, receive results through APIs/webhooks, and test locally. |
| Customer product user | Upload a file, map fields, correct validation errors, and submit an import in a branded guided flow. |
| Data/schema administrator | Define versioned target schemas, mapping behavior, validations, localization, IAE-backed retention constraints, and publication policy. |
| Support/operations user | Inspect workspace- and customer-partition-safe logs, replay webhooks, diagnose failures, and help without seeing prohibited data. |
| Security administrator | Scope keys, origins, DSO gateway access, narrowing data-mode constraints, webhook destinations, and IAE-backed retention constraints. |
| Android administrator | Receive operational alerts and view safe metadata only. |

## 3. Scope and explicit non-goals

### In scope

- Importer-focused schema studio and bindings over versioned `DSM` schemas, mappings, deterministic rules, and validation.
- Hosted iframe/web component and TypeScript SDK using short-lived import-session tokens.
- Direct REST API for session creation, resumable file upload, mapping, validation, correction, commit, and status.
- CSV, TSV, XLSX, JSON array/JSON Lines, and configured delimited text import.
- Saved mapping templates scoped to an external-customer partition and schema lineage.
- Importer event filters and payload policy over signed, retryable `INT` webhooks; usage and diagnostics; localization and branding.
- Outbound-only local gateway for approved folders or programmatic local file submission.

### Explicit non-goals

- Embedding DataBreeze administrative screens or exposing workspace credentials to an end user.
- Cross-workspace or cross-customer-partition schema, mapping, file, row, log, or webhook access.
- General ETL orchestration, arbitrary code execution, unrestricted local file access, or database crawling.
- Android file mapping or end-user importing.
- Private-site scraping or reliance on restricted marketplace APIs.
- Automatically committing invalid or ambiguously mapped records.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Importer views over `DSM` schema/mapping governance, branding, `INT` API credential and webhook-subscription management, allowed-origin policy, importer preview, logs, usage, customer-partition support tools, hosted import UI, and content-free LocalImportGatewayBinding/DSO health projections. |
| Windows Desktop | Local SDK test harness and an outbound-only gateway that uses an active IAM DeviceIdentity plus DSO DeviceCapabilities/DeviceGrants to read explicitly authorized files/folders, runs local parsing/validation, and synchronizes permitted results. IAM owns Device identity, public-key registration, activation, security epoch, and permanent revocation; DSO owns folder capabilities/grants and operational connection/health. Desktop alone retains any private key or local path. Embedded Importer receives neither. No arbitrary remote file commands. |
| Android | Administrative alerts projected from DSO gateway health, repeated import failure, quota pressure, or webhook failure; read-only safe metadata and acknowledgement. No customer upload, mapping, correction, or commit UI. |

## 5. Primary workflows

### 5.1 Configure a schema and embed the importer

1. An administrator creates a draft `DSM` schema, validations, display labels in Vietnamese and English, and an importer binding that defines publication behavior.
2. `DSM` validation and compatibility checks run before the immutable schema version is published.
3. A developer registers allowed origins and creates an `IAM`/`INT` server-side credential with importer, schema, customer-partition, and environment scopes.
4. The developer's backend creates a short-lived import session containing `externalTenantRef`, an optional external user reference, and permitted actions.
5. The frontend SDK mounts the hosted importer with the session token; long-lived secrets never enter the browser.

### 5.2 Upload, map, validate, and commit

1. The end user selects a supported file or continues a resumable upload.
2. DataBreeze fingerprints the artifact, detects format and headers, and creates a bounded sample.
3. Exact aliases and saved customer-partition mappings run first; optional AI suggestions are labeled and uncommitted.
4. The user confirms required mappings and resolves file-, column-, and row-level errors.
5. A full validation job runs on the frozen file and mapping versions.
6. The user commits an eligible import. DataBreeze creates one immutable import result and emits a webhook or makes the result available for polling.

### 5.3 Direct API import

A server client creates a session, uploads or registers data, supplies a mapping, validates, and commits using idempotency keys. Interactive-review-required sessions cannot be bypassed through the API.

### 5.4 Local gateway import

1. An admin enrolls a Windows DeviceIdentity through `IAM` and grants approved-folder capabilities through `DSO`; Embedded Importer creates a `LocalImportGatewayBinding` containing only the IAM identity ID, DSO grant/capability IDs, allowed importer schemas/environments, and a feature health projection.
2. IAM owns identity, public-key registration, activation, security epoch, and permanent revocation. DSO owns the authenticated operational connection, folder capabilities/grants, heartbeat, capability expiry, and health. The gateway accepts only signed JRA jobs referencing the active IAM identity, bound DSO grants/capabilities, and allowed importer schemas/environments.
3. Parsing and validation run locally when the effective DSO policy permits it. The workspace DSO DataMode is the maximum; any importer constraint may only narrow it. In Local mode, only `CONTROL_METADATA` synchronizes automatically or a separately confirmed `APPROVED_DERIVED_RESULT` synchronizes under DSO; source rows and `RECONSTRUCTABLE_DERIVED_CONTENT` never synchronize.
4. Offline work queues durably and resumes without duplicate commits.

## 6. Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| EI-001 | P0 | Every resource shall be scoped to an owning organization, workspace, `ImporterCustomerPartition`, environment, and schema as applicable; a customer partition shall never replace the IAM workspace authorization boundary. |
| EI-002 | P0 | Every importer schema binding shall reference an immutable published `DSM` SchemaVersion whose stable field identifiers are independent of importer display labels. |
| EI-003 | P0 | Importer schema publication shall use `DSM` validation and compatibility classification for field types, requiredness, constraints, transforms, rule references, and version changes rather than create an importer-specific schema authority. |
| EI-004 | P0 | The module shall support CSV, TSV, XLSX, JSON arrays, JSON Lines, and configured delimited text within declared limits. |
| EI-005 | P0 | Hosted sessions shall use short-lived, single-purpose tokens; browser code shall never receive a long-lived API key or gateway credential. |
| EI-006 | P0 | Session tokens shall bind `customerPartitionId`, environment, schema version or allowed version range, permissions, expiry, and optional external user reference. |
| EI-007 | P0 | The hosted component shall enforce configured origins, frame policy, and secure cross-window message validation. |
| EI-008 | P0 | Uploads shall support checksums, resumable parts, size/type limits, malware-scan state where configured, and idempotent completion. |
| EI-009 | P0 | Source files shall be immutable; re-upload or replacement shall create a new artifact version. |
| EI-010 | P0 | Importer mappings shall use `DSM` MappingVersions and preserve source column identity, target stable field ID, transform chain, suggestion provenance, and reviewer decision. |
| EI-011 | P0 | Required or incompatible mappings shall block full validation and commit. |
| EI-012 | P0 | Importer validation shall execute published `DSM` schema/rule versions and project their results as structured file-, column-, row-, field-, and cross-row errors with stable rule codes. |
| EI-013 | P0 | Row corrections shall create an overlay or new dataset version and shall not modify the uploaded file. |
| EI-014 | P0 | Commit shall be idempotent and shall create at most one result for a session version and idempotency key. When policy requires consequential approval, commit release shall bind to an accepted `JRA` ApprovalDecision whose `subjectRef` contains the exact session subject type/ID/version/hash; Embedded Importer shall not create an independent approval decision. |
| EI-015 | P0 | Import results shall identify accepted, rejected, and skipped row counts and shall never silently drop a row. |
| EI-016 | P0 | Saved importer mapping bindings shall reference customer-partition-isolated `DSM` mapping drafts/versions and compatible schema lineage unless explicitly promoted as sanitized drafts by an authorized admin. |
| EI-017 | P0 | Importer API credentials shall use `IAM` service-account identity and `INT` credential conventions, including hashed-at-rest or signed secrets, one-time display, rotation, revocation, environment scope, and capability scope. |
| EI-018 | P0 | Importer webhook bindings shall use authoritative `INT` subscriptions and deliveries so signing, timestamps, replay protection, retry, stable event/delivery identifiers, SSRF policy, and secret rotation are not reimplemented by this module. |
| EI-019 | P0 | Support tooling and logs shall enforce IAM workspace access plus customer-partition scope and redact row values and secrets by default. |
| EI-020 | P0 | A local gateway shall accept only signed JRA import jobs whose `jraJobId`, pinned `resultManifestId`, active IAM `iamDeviceId` and security epoch, DSO DeviceGrant/capability IDs, allowed importer schema/environment, `effectiveDataModePolicyRef`, and signature validate; no arbitrary path, key, command, feature-owned heartbeat, or copied IAM identity/DSO operational lifecycle state is allowed. |
| EI-021 | P0 | Android shall expose administrative alerts and safe status metadata only, with no end-user import actions. |
| EI-022 | P1 | Branding shall support logo, colors, typography tokens, help text, and custom domain where configured without permitting arbitrary executable content. |
| EI-023 | P1 | The hosted UI shall support Vietnamese and English labels, locale-aware dates/numbers, keyboard navigation, and screen readers. |
| EI-024 | P1 | Developers shall have sandbox and production environments with separate `IAM`/`INT` credentials, `DSM` schema bindings, webhook subscriptions, quotas, and data. |
| EI-025 | P1 | Importer webhook delivery history and authorized manual replay shall use `INT` delivery resources, preserve the original event ID and import result, and apply importer-specific filters without creating another delivery record authority. |
| EI-026 | P1 | The API shall support asynchronous status polling, event cursors, and downloadable structured error reports. Every asynchronous session/run shall store `jraJobId` and pinned `resultManifestId`; JRA owns dispatch, progress, cancel, retry, and terminal state, while importer status is an idempotent business projection. |
| EI-027 | P1 | Administrators shall configure file, row, column, size, concurrency, execution-location, `dataModeConstraint`, and `retentionConstraint` limits within plan ceilings. Data mode shall resolve to `effectiveDataModePolicyRef` and only narrow the DSO workspace maximum; retention shall resolve to IAE `effectiveRetentionPolicyRef` and never authorize Embedded Importer to delete bytes. |
| EI-028 | P2 | A provider-neutral AI adapter may suggest mappings and transformations from bounded samples, but its suggestions shall require deterministic validation and configured human confirmation. |

## 7. Data model extensions

| Entity | Key fields and invariants |
|---|---|
| `ImporterCustomerPartition` | `workspaceId`, environment, `externalTenantRef`, status, policy, and optional branding override. It represents one external customer inside exactly one Workspace, has no IAM authority, and is unique on `(workspaceId, environment, externalTenantRef)`. |
| `ImporterSchemaBinding` | Customer partition, environment, allowed `DSM` SchemaDefinition/SchemaVersion range, importer presentation/publication policy, optional narrowing `dataModeConstraint`, derived `effectiveDataModePolicyRef`, optional `retentionConstraint`, derived IAE `effectiveRetentionPolicyRef`, and revision. `DSM` owns the schema and fields; DSO and IAE remain policy authorities. |
| `ImportSession` | Customer partition, environment, schema constraint, external references, capabilities, token fingerprint, expiry, current version, pinned `effectiveDataModePolicyRef`/`effectiveRetentionPolicyRef`, `asyncRuns[]` whose records each contain `jraJobId` and pinned `resultManifestId`, and idempotent importer business state. It does not own JRA execution state. |
| `ImportSourceBinding` | Session reference to an immutable `IAE` ArtifactVersion plus importer-detected format and safe row/column estimates. `IAE` owns bytes, location, and retention. |
| `ImporterMappingBinding` | Customer-partition/session reference to a `DSM` MappingDefinition/MappingVersion plus applicability and confirmation state. |
| `ImportValidationBinding` | Session reference to a `DSM` ValidationRun, its pinned artifact/schema/mapping/rule versions, completeness, and commit eligibility. |
| `ImportRunProjection` | Session/version, operation kind, `jraJobId`, pinned JRA `resultManifestId`, `effectiveDataModePolicyRef`, `effectiveRetentionPolicyRef`, idempotency key, and idempotent importer business outcome/reason projection. JRA owns dispatch, progress, cancellation, retry, steps, and terminal state. |
| `ImportIssueProjection` | Importer-facing projection of a `DSM` finding with stable row locator, safe localized parameters, and `IAE` evidence reference; it is not a second canonical finding. |
| `ImportCorrectionOverlay` | Original row/field locator, corrected typed value, reason, actor/session, and version. |
| `ImportCommit` | Frozen input versions and hash, idempotency key hash, output dataset/result reference, counts, importer business release state, committed time, optional `jraApprovalRequestId`, exact subject type/ID/version/hash, and module release projection. `JRA` owns Job and approval execution/decision state. |
| `ImporterMappingTemplateBinding` | Customer-partition and environment reference to a compatible `DSM` MappingDefinition/MappingVersion plus importer usage history. |
| `ImporterWebhookBinding` | Customer partition, environment, importer event/resource filters, payload projection policy, and authoritative `INT` WebhookSubscription ID. `INT` owns secrets, endpoint verification, deliveries, attempts, retry, and replay. |
| `LocalImportGatewayBinding` | `iamDeviceId`, `dsoDeviceGrantIds[]`, `dsoDeviceCapabilityIds[]`, `allowedImporterSchemas[]`, `allowedEnvironments[]`, and `featureHealthProjection` only. IAM owns DeviceIdentity, public-key registration, activation, security epoch, and permanent revocation. DSO owns approved-folder capability/grant, operational heartbeat/connection, engine/capability report, health, and capability/grant expiry. |

## 8. Processing, evidence, and confidence rules

- The processor separates preview sampling from full validation. Sampling may guide mapping, but commit eligibility always comes from a complete run over the frozen artifact and mapping.
- Evidence uses artifact version and row/column/cell locators. Corrections and transformed values retain source evidence and ordered transform/rule versions.
- Header normalization uses deterministic Unicode normalization, whitespace/punctuation handling, and locale-aware aliases. Exact stable aliases run before saved mappings or semantic suggestions.
- Default mapping behavior is: exact unique alias may auto-map; multiple compatible targets require review; incompatible types never auto-map. Suggested mappings expose confidence from 0 to 1 and provenance. Default confirmation threshold is `0.95`, configurable upward.
- Validation order is parse, structural, type coercion, field rules, cross-field rules, cross-row rules, then dataset rules. Downstream errors caused solely by an earlier blocking parse error are suppressed with an explicit dependency reason.
- Type coercion is schema-declared and locale-aware. Ambiguous dates or numbers remain invalid until locale or format is resolved.
- Accepted, rejected, and skipped are explicit row outcomes. The sum must equal parsed row count; unparseable physical records are counted separately with evidence.
- Transform functions are versioned, deterministic, resource-bounded, and selected from an approved registry. Customer-supplied arbitrary code is not executed.
- AI receives only a bounded, policy-approved sample with sensitive fields minimized. It may suggest mappings or transformations but cannot commit, silently coerce, or override a validation rule.
- Mapping confirmation, correction review, validation completion, and ordinary commit eligibility are importer workflow states, not `JRA` ApprovalDecisions. If policy requires approval, Embedded Importer may create and render a subject-bound JRA request and project its release state, but it never owns approval policy, request state, or decision persistence.
- JRA is authoritative for every asynchronous import Job's dispatch, progress, cancellation, retry, steps, result manifest, and terminal state. Embedded Importer maps the pinned manifest and JRA state idempotently into importer business outcomes and never drives a JRA transition.

The business projection mapping is explicit:

- non-terminal JRA states, including queued, device-wait, running, review, approval, and cancel-requested states, expose read-through status and no terminal importer outcome;
- `SUCCEEDED` plus a complete pinned manifest projects profiling/validation work to `VALIDATION_READY` or `NEEDS_REVIEW` from authoritative DSM findings, and commit work to `COMMITTED`;
- `PARTIALLY_SUCCEEDED` projects to `NEEDS_REVIEW` with explicit accepted/rejected/skipped counts and manifest evidence; and
- `FAILED`, `CANCELLED`, or `EXPIRED` projects to the corresponding importer business outcome/reason without becoming a second Job terminal-state authority.

## 9. Permissions, privacy, and data modes

Capabilities include `import.schema.read`, `import.schema.manage`, `import.session.create`, `import.upload`, `import.map`, `import.validate`, `import.commit`, `import.result.read`, `import.webhook.manage`, `import.webhook.replay`, `import.brand.manage`, `import.gateway_binding.manage`, and `import.support.inspect`. API keys and session tokens carry the least set required. IAM owns DeviceIdentity enrollment, public-key registration, activation, security epoch, and revocation. DSO owns DeviceGrant/capability management, operational heartbeat/connection, health, and expiry. `import.gateway_binding.manage` cannot bypass or duplicate either authority.

The workspace DSO DataMode policy is always the maximum authority. An ImporterSchemaBinding `dataModeConstraint` may only narrow it, and each session/run stores the evaluated `effectiveDataModePolicyRef`. Embedded Importer cannot select a broader mode, copy DSO policy fields as its own authority, or continue under a stale effective reference.

| Data mode | Originals and processing | Synchronization |
|---|---|---|
| Local | Source and row data stay behind the DSO-bound Desktop gateway; parsing and validation run locally under `effectiveDataModePolicyRef`. | Only `CONTROL_METADATA` synchronizes automatically. A non-reconstructable issue summary, bounded aggregate, or committed value output may synchronize only as a separately confirmed `APPROVED_DERIVED_RESULT` under `DSO`; source rows and `RECONSTRUCTABLE_DERIVED_CONTENT` never synchronize. |
| Hybrid (default) | The effective DSO policy determines whether originals remain local while validated structured output and selected issues synchronize; importer constraints may make it stricter. | Hosted administration, webhooks, and results use only permitted fields; local-only evidence opens on the DSO-bound Desktop and is not live-streamed through cloud. |
| Cloud | Sources are uploaded to workspace-isolated encrypted object storage and processed by cloud workers only when the effective DSO policy permits it. | Authorized embedded sessions and APIs access only their workspace/customer-partition/environment/schema resources. |

IAM Workspace tenant isolation and Embedded Importer customer-partition isolation are both enforced in authorization and database query scope. Object keys, caches, Redis messages, events, logs, rate limits, and support tools carry workspace and customer-partition scope as applicable. Raw row data, tokens, secrets, local paths, Device keys, and webhook bodies are excluded from ordinary telemetry.

IAE is the canonical retention and byte-deletion authority. Embedded Importer may store only `retentionConstraint` and `effectiveRetentionPolicyRef`; a constraint may narrow ordinary availability or request a policy-governed extension, but importer code never deletes IAE bytes. Gateway/Desktop cache cleanup is a distinct local operation and cannot be represented as deletion of the canonical artifact. Business and audit tombstones follow IAE policy after any authoritative deletion.

## 10. Offline, sync, failure, and recovery

- Upload parts, session commands, commits, events, and webhook deliveries use idempotency keys and durable business states in PostgreSQL. Redis Streams deliver work, while JRA remains the sole Job record and every asynchronous import projection stores `jraJobId` plus pinned `resultManifestId`.
- An interrupted upload resumes only after part checksum and session-token validation. Expired sessions may receive a server-authorized continuation token without reusing the original token.
- The Desktop/DSO gateway layer persists encrypted mirrored JRA Job/ProvisionalExecution state and an ordered outbox; Embedded Importer stores only run IDs and business projections. Network loss pauses sync and never changes a local validation result.
- If DSO reports the gateway offline, JRA jobs remain `WAITING_FOR_DEVICE`; they are not rerouted to cloud unless the workspace DSO policy, the narrower importer constraint, source placement, and authorization all permit it.
- IAM DeviceIdentity activation/security-epoch/revocation changes and DSO grant/health/connection changes update only `LocalImportGatewayBinding` health projections. A revoked IAM DeviceIdentity, expired/revoked DSO DeviceGrant, or unhealthy connection cannot accept work, and Embedded Importer never rewrites or reactivates either authority.
- Desktop folder observations through the bound DSO capability create new IAE artifact versions. A commit is blocked if the source fingerprint differs from its validated version.
- Schema publication never mutates active sessions. A session stays pinned to its version unless an authorized migration runs and validation repeats.
- Mapping or correction conflicts require a new session version; commit uses optimistic concurrency and returns a conflict rather than last-write-wins.
- A stale `effectiveDataModePolicyRef` or `effectiveRetentionPolicyRef` blocks new work until re-evaluated by DSO or IAE respectively; the module cannot fall back to a broader or locally copied policy.
- `INT` owns webhook attempts and replay. An importer binding configures exponential backoff and jitter within `INT-017`, using a 72-hour retry window by default and honoring safe `Retry-After` bounds; replay preserves the original event and creates the new authoritative `INT` delivery record.
- Partial processor output is retained only in the pinned JRA result manifest and policy-allowed diagnostics; an importer validation projection is `VALIDATION_READY` only after the authoritative run and all configured scopes finish.

## 11. APIs, events, and extension points

Representative management APIs are:

- `POST /v1/importer-schema-bindings`; schema/version authoring and publication use the `DSM` schema resources;
- `POST /v1/importer-customer-partitions`, `/origins`, `/branding`, and `/webhook-bindings`; credentials and authoritative subscriptions use `IAM`/`INT` resources;
- `POST /v1/local-import-gateway-bindings` manages only `LocalImportGatewayBinding`; DeviceIdentity enrollment, public-key registration, activation, security epoch, and revocation use authoritative `IAM` resources, while DeviceCapability/DeviceGrant creation, operational connection/heartbeat, health, and expiry use authoritative `DSO` resources.

Representative runtime APIs are:

- `POST /v1/import-sessions`, `GET /v1/import-sessions/{id}`; asynchronous responses include `jraJobId`, pinned `resultManifestId`, JRA read-through status, and the separate importer business projection;
- `POST /v1/import-sessions/{id}/uploads`, `/upload-parts`, and `/complete-upload`;
- `POST /v1/import-sessions/{id}/mappings`, `/validations`, `/corrections`, and `/commits`;
- `GET /v1/import-sessions/{id}/issues`, `/result`, and `/events`;
- importer event status links to the authoritative `INT` subscription/delivery resources, including `POST /v1/webhook-deliveries/{id}/replays`.

`POST /v1/import-sessions/{id}/commits` enforces the bound `JRA` ApprovalRequest when policy requires one. Any approval view exposed within an importer session is an authorized facade over JRA and may add only `jraApprovalRequestId`, the exact subject type/ID/version/hash, and the module release projection; it never records an independent ApprovalDecision.

Any importer cancel, retry, or Job-status facade delegates the transition and persistence to JRA; EI may return only `jraJobId`, pinned `resultManifestId`, and its idempotent business projection. Any gateway-binding facade delegates DeviceIdentity authorization/lifecycle to IAM and capability/grant/operational lifecycle to DSO; it cannot return a key, path, or copied authoritative identity, heartbeat, health, grant, or revocation record.

Typed jobs are `PROFILE_IMPORT_FILE`, `VALIDATE_IMPORT`, `COMMIT_IMPORT_DATASET`, and `RUN_LOCAL_IMPORT`; JRA owns their dispatch, progress, cancel, retry, result manifests, and terminal states, while their governed schema, mapping, profiling, validation, and dataset manifests conform to `DSM`. Importer events `import.validation.completed`, `import.commit.completed`, and `import.commit.failed` are idempotent business projections from JRA state plus the pinned manifest. `gateway.offline` is a feature-health projection from authoritative DSO heartbeat/status, not a gateway lifecycle event. Other importer events include `import.session.created`, `import.file.ready`, and `import.mapping.review_required`. `INT` subscriptions may filter these events and owns all `webhook.delivery.*` events and state.

The TypeScript SDK exposes server helpers for session creation and a browser component for `mount`, session events, resize, completion, and teardown. PostMessage payloads are schema-versioned and origin-checked.

Extension points include parsers, deterministic transform/rule plugins, destination adapters owned by the customer, branding tokens, and webhook consumers. Plugins declare resource budgets and data classifications and cannot bypass workspace/customer-partition scope, DSM schema/rules, IAE evidence/retention, JRA Job/approval, DSO gateway/data-mode, or commit controls.

## 12. Performance and capacity budgets

Defaults are configurable within plan and infrastructure ceilings.

| Budget | Default target |
|---|---|
| EI high-capacity import profile | 2 GB, 5 million rows, 500 columns, and 20 sheets with asynchronous processing, module admission, entitlement, and published reference worker/gateway hardware |
| Upload | Resumable parts from 5-100 MB; successful part acknowledgement in <= 1 second at p95 excluding transfer time |
| Session creation | <= 300 ms at p95 |
| Hosted UI | Interactive shell in <= 2 seconds at p75 on a typical broadband connection, excluding SDK host loading |
| Preview | Header plus first 100 sampled rows available in <= 10 seconds at p95 for files <= 100 MB after upload |
| Validation | 1 million simple-rule rows in <= 5 minutes at p95 on standard workers, excluding queue time |
| Issue browsing | First 100 issues in <= 1.5 seconds at p95 |
| Commit | Result durably recorded in <= 60 seconds at p95 after validation for 1 million rows, excluding downstream customer processing |
| Webhook dispatch | First attempt begins within 10 seconds at p95 after commit |
| Availability | Runtime session, upload control, and status APIs target 99.9% monthly availability |

Concurrency defaults to 10 active imports per customer partition and 100 per workspace. Backpressure returns explicit retry guidance; no file or row is silently truncated.

## 13. Observability and product success metrics

Traces correlate customer request ID, session, upload, `jraJobId`, pinned `resultManifestId`, commit, event, and webhook delivery without including row values. Operational metrics include API latency, token rejection reasons, origin violations, upload retries/checksum failures, parser throughput, mapping review rate, rule latency, issue cardinality, commit conflicts, DSO-derived gateway-health projection, webhook attempts, and quota denials. EI telemetry never copies a Device key, path, raw heartbeat, IAM identity status/revocation, or authoritative DSO grant/health state. Isolation alarms monitor any mismatch among authenticated Workspace scope, queried Workspace scope, and customer-partition scope.

Product success is measured by:

- median developer time from key creation to first successful sandbox import;
- end-user completion rate and time by schema/file type;
- percentage of mappings reused safely within the same customer partition;
- validation errors resolved in-session;
- commit idempotency success and zero duplicate results;
- webhook first-attempt and eventual delivery rate;
- support cases resolved without accessing raw row data; and
- zero cross-workspace or cross-customer-partition data exposure.

## 14. Acceptance and testing criteria

- Contract fixtures cover each supported format, Vietnamese and English headers, locale-specific dates/numbers, duplicate columns, malformed records, formulas-as-text, encoding differences, and maximum-boundary cases.
- Schema tests cover publish immutability, stable field IDs, invalid rules, compatible and breaking versions, pinned sessions, and controlled migration.
- Mapping and validation property tests prove deterministic outputs, row accounting, transform ordering, and identical local/cloud results for identical versions.
- Browser tests cover allowed and denied origins, token expiry, postMessage origin/source validation, Content Security Policy, accessibility, responsive layout, and host teardown.
- API tests cover key scopes, token audience, Workspace and customer-partition filters, idempotency, optimistic conflicts, rate limits, upload checksums, and error-report pagination.
- Webhook tests verify signature rotation, timestamp tolerance, replay rejection, retry/backoff, manual replay, endpoint disablement, and secret redaction.
- Gateway tests cover Desktop path canonicalization, DSO capability escape attempts, signed-job tampering, offline queueing, restart recovery, IAM DeviceIdentity revocation, DSO grant revocation, and the absence of inbound arbitrary commands. Persistence tests prove `LocalImportGatewayBinding` contains only an IAM DeviceIdentity ID, DSO DeviceGrant/DeviceCapability IDs, allowed importer schemas/environments, and a feature-health projection—never a key, path, heartbeat, lifecycle status, grant state, health authority, or revocation authority.
- Job contract tests prove every asynchronous session/run stores `jraJobId` and pinned `resultManifestId`, that importer outcomes follow the documented JRA-state mapping idempotently, and that EI status/cancel/retry routes cannot create an independent Job transition.
- Data-mode tests prove `dataModeConstraint` can narrow but never broaden the DSO workspace maximum and that a stale `effectiveDataModePolicyRef` blocks execution.
- Local synchronization tests prove only `CONTROL_METADATA` moves automatically, each value-bearing synchronized result has a DSO confirmation bound to its exact resource/version/hash, and no source row or `RECONSTRUCTABLE_DERIVED_CONTENT` crosses the gateway.
- Retention tests prove `retentionConstraint` resolves to IAE `effectiveRetentionPolicyRef`, EI cannot delete IAE bytes, and Desktop/gateway cache cleanup neither deletes nor reports deletion of the canonical artifact.
- Security tests attempt Workspace-ID and customer-partition-ID substitution across SQL, object keys, caches, events, logs, support tools, and webhook replay.
- Android tests prove only safe administrative metadata is displayed and no import upload/mapping/commit route is exposed.
- An end-to-end test embeds the SDK on an allowed origin, imports an XLSX with ambiguous locale data, confirms mapping, fixes errors, commits once despite repeated requests, verifies a signed webhook, and proves another Workspace or customer partition cannot address any created resource.

## 15. Delivery slices and future expansion

### Slice 1: Secure hosted importer

Versioned schemas, sandbox/production environments, session tokens, allowed origins, CSV/XLSX upload, mapping, deterministic validation, correction overlays, idempotent commit, basic SDK, and signed webhooks.

### Slice 2: Product-grade administration

JSON/TSV support, saved customer-partition mappings, branding/localization, issue exports, usage/quota controls, webhook replay, support diagnostics, and Android admin alerts.

### Slice 3: Local gateway and extensibility

Outbound-only Windows gateway through the IAM DeviceIdentity contract plus DSO DeviceOperationalProjection/DeviceGrant/DeviceCapability contracts, `LocalImportGatewayBinding`, narrowing Local/Hybrid constraints, folder submissions, JRA-backed local runs, SDK test harness, plugin contracts, large-file scaling, and customer-owned destination adapters.

Future expansion may add additional open file formats, private deployment options, and formally sandboxed customer-authored validation expressions. It must not expose workspace credentials, permit arbitrary executable transforms, broaden Android into an importer, scrape private services, or weaken Workspace or customer-partition isolation.
