# DataBreeze Migration Ready — Product Specification

**Status:** Product specification<br>
**Delivery position:** Post-V1 specialist extension; not part of the Data-to-Dashboard Agent V1 release gate.<br>
**Version:** 1.0<br>
**Requirement prefix:** MR<br>
**Dependencies:** Platform identity and workspace services; artifact, dataset, evidence, version, job, approval, audit, notification, and sync services; `IAE` Inbox, Artifacts, and Evidence foundation; `DSM` Datasets, Schemas, Rules, and Mappings foundation; `JRA` Jobs, Recipes, and Approvals foundation; `DSO` Devices, Synchronization, and Offline Operation foundation; Python processing engine; PostgreSQL; S3-compatible object storage; registered Desktop devices

## 1. Purpose and outcome

Migration Ready turns user-controlled source files and datasets into reviewed, reproducible migration packages. It profiles source data, maps it to a versioned destination schema, applies deterministic cleaning and normalization rules, identifies duplicates, runs dry-run validation, reconciles counts and values, and exports a package with a complete evidence and audit trail.

The outcome is not merely a converted file. A completed migration run contains:

- immutable references to the exact source versions;
- a versioned target schema, mappings, cleaning rules, and duplicate-resolution decisions;
- record-level validation and disposition results;
- reconciliation totals that explain every included, excluded, merged, and rejected record;
- a portable export package and machine-readable manifest; and
- canonical `JRA` approval references and audit records sufficient to reproduce the run.

Migration Ready does not write directly to destination systems by default. A workspace may later enable a separately installed, permission-scoped destination adapter, but the standard workflow ends with an approved export package.

## 2. Users and jobs-to-be-done

| User | Jobs-to-be-done |
|---|---|
| Data analyst | Understand unfamiliar source data, map fields, define repeatable transformations, and resolve validation exceptions. |
| Migration lead | Define target schemas, coordinate review, compare dry-runs, approve a release candidate, and prove reconciliation. |
| Business data steward | Define semantic meaning, reference lists, and survivorship rules; review ambiguous duplicates and mappings. |
| Operator | Add approved sources, run published migration plans, resolve assigned exceptions, and generate packages. |
| Approver | Review material changes, reconciliation, unresolved risks, and approve or reject export-package release. |
| Workspace admin | Set limits, narrowing retention/data-mode constraints under `IAE`/`DSO`, device routing preferences, permissions, and allowed export formats. |
| Auditor or viewer | Inspect lineage, decisions, manifests, and signed-off results without changing the plan. |

Primary user jobs are:

1. “Show me what is actually in these source files before I design the migration.”
2. “Help me map inconsistent source fields into a governed destination schema.”
3. “Apply the same cleaning and duplicate rules every time, without changing the originals.”
4. “Let me test the result and account for every record before anything is delivered.”
5. “Produce a package another team or tool can import without trusting a hidden transformation.”

Vietnamese is the default product language. Field names, reference data, and free text remain in their source language unless an explicit, reviewable transformation says otherwise.

## 3. Scope and explicit non-goals

### In scope

- Migration projects containing one or more user-controlled CSV, TSV, XLSX, JSON, JSONL, Parquet, or standards-based database extract datasets.
- Schema and data profiling: types, nulls, cardinality, distributions, formats, outliers, candidate keys, and cross-source overlap.
- Project bindings to immutable `DSM` `SchemaVersion` records, including imported schema drafts submitted to the canonical `DSM` publisher from CSV headers, JSON Schema, or a documented tabular schema.
- Project bindings to immutable `DSM` `MappingVersion`, `RuleDefinitionVersion`, and `RuleSetVersion` records for field, constant, lookup, split, combine, parse, normalize, and allowlisted conditional transformations.
- Deterministic cleaning, validation, reference-data matching, and duplicate detection.
- Suggested mappings and duplicate candidates with confidence and evidence.
- Dry-runs that materialize preview outputs and record-level dispositions without changing sources or writing to a target.
- Baseline-to-dry-run and source-to-package reconciliation.
- Module review details, authorized `JRA` review/approval facades, comments, and run comparisons.
- Export packages using open formats with checksums, manifests, error files, and reconciliation reports.
- Local, Hybrid, and Cloud execution according to artifact location and policy.

### Explicit non-goals

- Direct destination-system writes in the default product workflow.
- Undocumented or restricted marketplace integrations.
- Private-site scraping, credential replay, or extracting data from systems the user has not exported or explicitly connected through an allowed standard interface.
- A general-purpose ETL orchestration platform or arbitrary code execution environment.
- Arbitrary SQL, shell, Python, JavaScript, spreadsheet macros, or user-supplied executable transformations.
- Editing or deleting source artifacts in place.
- Automatically accepting semantic mappings, record merges, or material data loss based only on an AI suggestion.
- Replacing destination-specific user acceptance testing or legal data-retention review.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Create and govern migration projects; bind published `DSM` schemas, mappings, rules, and reference datasets; submit reusable definition drafts to `DSM`; inspect profiles; manage feature-specific duplicate and reconciliation policy; review exceptions; compare runs; invoke `JRA` review/approval facades for releases; generate cloud packages; administer limits, permissions, and `IAE` retention constraints; expose audit and reconciliation reports. |
| Desktop | Register explicit local sources; hash, profile, and process large or sensitive files locally; cache project definitions for offline work; execute typed dry-run and package jobs; stage packages in a user-approved location; synchronize only policy-approved metadata, findings, previews, and outputs. |
| Android | View project and run status; inspect assigned mapping, duplicate, and validation review projections; inspect compact evidence; comment; invoke `JRA` approval/rejection facades for release gates; receive failure and completion notifications. Android does not author complex transformation plans or generate large packages. |

The control plane owns durable project state, business run projections, package/release subject state, `JRA` review/approval bindings, and audit references. `JRA` owns canonical Jobs, `ReviewTask`, `ApprovalPolicy`, `ApprovalRequest`, and `ApprovalDecision` records. The Python engine executes the same versioned processing plan in cloud workers and the Desktop sidecar. Platform clients never infer permissions from the UI alone.

`DSM` is the canonical publisher for governed datasets, schemas, mappings, rule definitions, and rule sets. Migration Ready owns migration-project bindings and read-only projections of exact immutable `DSM` versions, plus feature-specific plan ordering, duplicate/reconciliation policy, runs, reviews, and packages. It does not maintain a parallel definition registry.

## 5. Primary workflows

### 5.1 Create and baseline a migration project

1. A migration lead creates a project, selects a `dataModeConstraint` that may only narrow the workspace `DSO` policy, and sets target purpose and default locale/time zone.
2. The lead selects an immutable `DSM` `SchemaVersion` or submits an imported draft to `DSM`; after canonical publication, the project binds that exact version and its required fields, keys, formats, and reference constraints.
3. An analyst adds source artifact versions from the workspace or registers local sources on Desktop.
4. DataBreeze records checksums, encoding, workbook sheet selection, and parsing settings before profiling.
5. A successful baseline freezes the source set and target schema version for subsequent plan revisions.

### 5.2 Profile and map

1. A typed profiling job computes complete structural statistics and bounded value samples.
2. The analyst reviews detected types, quality risks, candidate identifiers, and cross-source field similarity.
3. DataBreeze proposes `DSM` mapping drafts where evidence is sufficient, showing name, type, value, and semantic signals separately.
4. The analyst accepts, edits, or rejects each draft through the `DSM` publication workflow; the migration plan then binds the published `MappingVersion` and any required `RuleDefinitionVersion` records.
5. Required target fields must be mapped, defaulted, or explicitly waived with a reason before a dry-run can become releasable.

### 5.3 Clean and deduplicate

1. The analyst selects a published `DSM` `RuleSetVersion` or promotes a draft through `DSM`, then binds the resulting immutable version to the migration plan.
2. Deterministic normalization creates derived values without mutating sources.
3. Blocking rules form candidate duplicate sets; match rules calculate a reproducible score.
4. Exact, policy-approved matches may auto-resolve. Ambiguous clusters enter review.
5. A steward selects a survivor or field-level survivorship result, with before/after evidence.

### 5.4 Dry-run and resolve exceptions

1. A migration lead starts a dry-run against immutable source versions and a published plan version.
2. Records receive `READY`, `WARNING`, `REJECTED`, `MERGED`, or `EXCLUDED` dispositions with reason codes.
3. Reviewers filter and assign exception groups, correct plan rules or make scoped record decisions, and rerun affected partitions.
4. Run comparison explains changes in counts, rules, mappings, and output values.

### 5.5 Reconcile, approve, and export

1. DataBreeze reconciles source input to the proposed package by source, entity, disposition, and configured numeric control totals.
2. Release is blocked when mandatory rules fail, totals do not balance within policy tolerance, or required reviews remain open.
3. The module facade submits the exact release subject type, ID, version, hash, and requested action to `JRA`; eligible approvers review the reconciliation report, exception register, plan diff, and package contents through that canonical request.
4. After a valid `JRA` `ApprovalDecision`, DataBreeze creates an immutable package version containing data files, rejected-record files, manifest, schemas, checksums, and reports and retains `jraApprovalRequestId` plus the exact subject binding.
5. Download or local staging is recorded as an audit event. A later rerun creates a new package version.

## 6. Functional requirements

Priorities are `P0` (required for first production release), `P1` (required for complete module operation), and `P2` (planned enhancement).

| ID | Priority | Requirement |
|---|---|---|
| MR-001 | P0 | The system shall create migration projects scoped to one workspace and optionally one client/project, with owner, `dataModeConstraint`, `effectiveDataModePolicyRef`, locale, time zone, `retentionConstraint`, `effectiveRetentionPolicyRef`, and configurable capacity limits; module constraints shall never broaden workspace policy. |
| MR-002 | P0 | The system shall bind every run to immutable source artifact versions, `jraJobId`, and a pinned `resultManifestId` and shall verify each source checksum before processing. |
| MR-003 | P0 | The system shall ingest CSV, TSV, XLSX, JSON, JSONL, and Parquet sources with explicit encoding, delimiter, header, sheet, decimal, date, and null parsing settings. |
| MR-004 | P0 | Desktop shall register local sources through an explicit file or folder grant and shall not broaden that grant without user action. |
| MR-005 | P0 | The system shall profile row counts, column types, null rates, distinct counts, min/max values, length and format distributions, candidate keys, and parse failures. |
| MR-006 | P1 | The system shall compare fields and identifiers across sources and expose overlap and conflict statistics without merging records. |
| MR-007 | P0 | A migration target shall bind an immutable `DSM` `SchemaVersion` containing field identifiers, display names, types, requiredness, cardinality, constraints, and semantic references; new or imported schema drafts shall become canonical only through `DSM` publication. |
| MR-008 | P0 | A migration plan shall bind immutable `DSM` `MappingVersion`, `RuleDefinitionVersion`, and `RuleSetVersion` records for direct, constant, lookup, split, combine, parse, normalize, and allowlisted conditional field transformations. |
| MR-009 | P0 | Mapping suggestions shall show component signals and confidence; each suggestion shall remain a migration draft until an authorized user publishes it through `DSM` and explicitly binds the resulting immutable version. |
| MR-010 | P0 | Before activating a plan binding, the system shall validate mapping completeness, type compatibility, transformation order, cycles, referenced `DSM` versions, missing lookup dataset versions, and unreachable conditions without republishing those definitions. |
| MR-011 | P0 | Cleaning shall operate on derived working records and shall never modify an original artifact or its extracted source rows. |
| MR-012 | P0 | The system shall provide deterministic normalization for whitespace, Unicode, case, phone numbers, emails, dates, numbers, identifiers, and configured reference values. |
| MR-013 | P0 | Duplicate detection shall bind immutable `DSM` rule versions for blocking and matching, combine them with a versioned migration-specific threshold and survivorship policy, and preserve the contribution of every source record. |
| MR-014 | P0 | Ambiguous duplicate clusters shall create module review detail and a canonical `JRA` `ReviewTask` reference with side-by-side field evidence and shall not be auto-merged. |
| MR-015 | P1 | The system shall auto-resolve exact duplicate clusters only when a published policy identifies the exact fields, normalization version, and survivorship behavior. |
| MR-016 | P0 | A dry-run shall generate record-level output candidates and dispositions without external writes or source mutations. |
| MR-017 | P0 | Every rejected, excluded, warning, and merged record shall have one or more stable reason codes and evidence references. |
| MR-018 | P0 | Users shall filter module review details and assign, comment on, or bulk-resolve homogeneous exceptions through the canonical `JRA` review facade; bulk actions shall preview the affected count and require confirmation. |
| MR-019 | P1 | The system shall support scoped manual overrides that identify the record, field, prior value, replacement value, reason, author, and plan/run applicability. |
| MR-020 | P0 | The system shall compare two dry-runs by inputs, plan versions, rule results, dispositions, control totals, and changed output fields. |
| MR-021 | P0 | Reconciliation shall prove that each input record is ready, merged into a named survivor, rejected, or explicitly excluded and shall flag unexplained count differences. |
| MR-022 | P0 | Reconciliation shall calculate configured numeric control totals before and after transformation, with explicit rounding and tolerance rules. |
| MR-023 | P0 | A release policy shall block package generation when mandatory validations fail, unresolved required reviews exist, source versions changed, or reconciliation is outside tolerance. |
| MR-024 | P0 | Package release shall require a valid `JRA` `ApprovalDecision` for an `ApprovalRequest` bound to the exact requested action and subject type/ID/version/hash; `JRA` shall enforce that the approver is distinct from the last editor when separation-of-duties policy requires it, and the module shall store only `jraApprovalRequestId` plus the subject binding. |
| MR-025 | P0 | An export package shall contain versioned output files, rejected-record files, target schema, plan manifest, source and output checksums, reconciliation report, and machine-readable reason-code summary. |
| MR-026 | P0 | The default export formats shall be UTF-8 CSV plus JSON manifest; Parquet and JSONL may be enabled per workspace. |
| MR-027 | P0 | The system shall not send a destination write job unless a separately configured adapter, permission, release policy, and valid canonical `JRA` approval for the exact requested action and subject version/hash are all present. |
| MR-028 | P0 | Runs, module review details, `JRA` review/approval facade actions, downloads, and package staging shall emit or reference immutable audit events from their owning services. |
| MR-029 | P1 | An authorized user shall clone a published plan into a new draft while retaining references to its parent version. |
| MR-030 | P1 | The system shall support incremental source batches while preserving batch identity and cumulative reconciliation. |
| MR-031 | P1 | Desktop and cloud execution of the same plan and fixture shall produce equivalent normalized values, dispositions, reason codes, and control totals. |
| MR-032 | P1 | Users shall export a human-readable migration book covering sources, definitions, mappings, rules, exceptions, reconciliation, and approvals. |
| MR-033 | P2 | The system shall permit a workspace to register a signed, declarative destination adapter whose capabilities and idempotency behavior are reviewed independently of the migration plan. |

## 7. Data model extensions

All entities include `id`, `workspace_id`, creation/update timestamps, actor attribution where applicable, and optimistic-concurrency version fields.

| Entity | Purpose and key fields |
|---|---|
| `MigrationProject` | Module root: name, purpose, owner, `dataModeConstraint`, `effectiveDataModePolicyRef`, locale, time zone, feature state, `retentionConstraint`, `effectiveRetentionPolicyRef`, and limits. |
| `MigrationSourceBinding` | Binds source artifact version/dataset, selected sheet/table, parse settings, batch identity, checksum status, and local/cloud location. |
| `MigrationBaseline` | Immutable set of source bindings plus one exact `DSM` `SchemaVersion` binding used for plan authoring and run comparison. |
| `MigrationTargetSchemaBinding` | Project-scoped binding to one immutable `DSM` `SchemaVersion`, with compatibility state, selected entities/fields, canonical hash, and a read-only review projection. |
| `ProfileResult` | Profiling version, engine version, structural statistics, bounded samples, parse diagnostics, and evidence links. |
| `MigrationPlan` / `MigrationPlanVersion` | Draft/published plan identity, baseline, ordered immutable `DSM` mapping/rule bindings, duplicate policy, release policy, checksum. |
| `MigrationMappingBinding` | Exact `DSM` `MappingVersion`, target field projection, compatibility state, confidence and suggestion provenance, reviewer decision, and plan order. |
| `MigrationRuleBinding` / `ReferenceDataBinding` | Exact `DSM` `RuleDefinitionVersion` or `RuleSetVersion` plus immutable `DSM` `DatasetVersion` lookup/reference bindings. |
| `DuplicatePolicy` | Bound `DSM` blocking/match rule versions plus migration-specific weights, thresholds, auto-resolution constraints, and survivorship behavior. |
| `DuplicateCluster` / `DuplicateMember` | Candidate cluster, component scores, source records, decision state, selected survivor, and reviewer. |
| `RecordOverride` | Scoped correction or disposition override with prior/new values, reason, actor, and applicable plan/run. |
| `MigrationRun` | Source and plan versions, `jraJobId`, pinned `resultManifestId`, effective execution policy/location, business-state projection, counters, engine/rule versions, timestamps, and failure summary; no independent dispatch/retry/terminal Job state. |
| `MigrationRecordResult` | Stable source-row key, output-record key, disposition, reason codes, target values or partition pointer, evidence, and contribution lineage. |
| `ReconciliationDefinition` | Versioned counts, grouping dimensions, numeric control expressions, rounding, tolerance, and severity. |
| `ReconciliationResult` | Input/output counts, disposition bridge, control totals, variances, pass/fail result, and evidence. |
| `MigrationPackage` | Immutable released package version, object/local URI, manifest checksum, content checksums, size, approval-binding reference, expiry, and download/staging history. |
| `MigrationReviewDetail` | Immutable typed mapping, duplicate, validation, or reconciliation detail with evidence and `jraReviewTaskId`; `JRA` owns assignment, state, due date, comments, and disposition. |
| `MigrationApprovalBinding` | Requested action, exact subject type/ID/version/hash, `jraApprovalRequestId`, projected canonical status, and last verified `JRA` revision; no actor or decision payload. |

Large record results and output partitions are stored as encrypted objects with indexed summaries in PostgreSQL. Local-mode row data remains in the Desktop store; the control plane receives only metadata and policy-approved aggregates or reviewed excerpts.

Migration Ready stores immutable `DSM` IDs, canonical hashes, and the minimum read-only projections needed for execution and review. Reusable schema, mapping, rule, semantic, metric, or dataset definitions are authored and published only by `DSM`; a module-local proposal has no canonical effect until that publication succeeds.

## 8. Processing, evidence, and confidence rules

### Processing contract

- A run is a pure function of source artifact versions, parsing configuration, bound `DSM` schema/mapping/rule/reference versions, migration plan version, engine version, and explicit overrides.
- The engine shall execute an ordered, validated graph compiled from the bound `DSM` versions. It shall reject unknown actions, cyclic dependencies, non-deterministic functions, and unpinned references.
- Originals and extracted source rows are immutable. Normalized and target records are derived versions linked back to source records.
- Partition retries use stable input partitions and idempotency keys. Retrying cannot duplicate an output record or review item.
- Date/time, decimal, collation, Unicode, locale, and rounding behavior are explicit in the plan manifest.

### Evidence

- Every target value stores lineage to its source artifact, source version, sheet/table, row, column or JSON path, and transformation steps.
- Spreadsheet evidence uses sheet and cell/row references; JSON uses JSON Pointer; delimited and Parquet datasets use stable row keys plus column names and source byte/row metadata where available.
- A merged record retains field-level lineage to every contributing record.
- Profile samples are bounded and marked as samples; complete statistics are distinguishable from estimates.
- Manual decisions and overrides include before/after values, reason, actor, timestamp, and applicable version.

### Confidence and decisions

- Confidence is advisory and shall never replace deterministic validation or approval.
- Mapping confidence is stored as separate name, type, value-overlap, and semantic signals plus an overall calibrated score.
- Duplicate confidence is derived only from the published feature and weight definition. Exact normalized equality and probabilistic similarity are reported separately.
- Default review bands are workspace-configurable: mapping suggestions below `0.80` are not preselected; duplicate scores from `0.70` through `0.94` require review; auto-resolution above `0.95` is allowed only with an explicit exact-match policy. Configuration changes apply only to new plan versions.
- AI may suggest mapping descriptions, likely fields, and exception explanations through a provider-neutral adapter. AI output cannot publish a plan, change a record, close an exception, or approve a release.
- When confidence cannot be calibrated or evidence is missing, the system labels the suggestion `UNSCORED` and routes it to manual review.

## 9. Permissions, privacy, and data modes

Module permissions extend platform roles:

- `migration.project.manage`
- `migration.source.attach`
- `migration.plan.edit`
- `migration.plan.publish`
- `migration.review.facade`
- `migration.run.execute`
- `migration.package.approval.facade`
- `migration.package.download`
- `migration.audit.read`
- `migration.adapter.execute`

Source access and export access are separate permissions. A user able to inspect profile aggregates is not automatically allowed to view row samples or download packages. Sensitive fields may be masked by field policy in the Web and Android clients; reviewers receive only the minimum fields required for a decision.

Review and approval capabilities authorize module facades only. `JRA` enforces canonical review state, assignment, disposition, approver eligibility, separation of duties, MFA, expiry, requested action, and subject-hash invalidation.

Data-mode behavior:

- **Local:** Originals, row data, derived outputs, and packages remain on an approved Desktop device. Only `CONTROL_METADATA` synchronizes automatically; any summary, preview, record set, or package requires a separately confirmed resource/hash-bound `APPROVED_DERIVED_RESULT` under `DSO`.
- **Hybrid (default):** Originals may remain local. Approved structured records, selected evidence excerpts, reconciliation summaries, and packages synchronize according to workspace policy.
- **Cloud:** Authorized source artifacts, row results, evidence, and packages may be stored and processed in the workspace’s cloud boundary.

The workspace `DSO` policy is the maximum authority. `dataModeConstraint` and `effectiveDataModePolicyRef` may only narrow placement, processing, or synchronization; every job and transfer resolves the intersection again at execution time and fails closed if it would broaden policy.

All network traffic is encrypted. Cloud objects and local caches are encrypted at rest where supported. `IAE` is canonical for retention and deletion of source, evidence, and package bytes. Migration fields store only `retentionConstraint` and `effectiveRetentionPolicyRef`, which may narrow or extend but never shorten the workspace minimum; deletion eligibility is the intersection of workspace minimum, resource constraint, evidence/package lineage, legal hold, audit class, and recovery window. Feature code requests deletion through `IAE`; local cache cleanup is not authoritative retention.

## 10. Offline, sync, failure, and recovery

- Desktop caches the authorized immutable `DSM` schema, mapping, rule, and reference-dataset versions plus migration plans needed for an explicitly queued local run.
- Offline runs receive device-generated provisional IDs and stable idempotency keys; the server maps them to durable IDs during synchronization.
- A plan can be edited offline only when the client holds an editable draft lease snapshot. Concurrent server changes create a branch requiring explicit comparison and merge; last-write-wins is prohibited for plan definitions.
- Review/finding disposition intents may queue offline only when the cached `IAM` authorization snapshot permits and must re-authorize through the `JRA` facade on sync; canonical conflicts remain open in `JRA`. The local app may retain non-authoritative approval notes or a draft reason, but synchronization never creates an `ApprovalDecision`: an eligible actor must reopen the exact current subject online, freshly confirm approve/reject, and satisfy current MFA before `JRA` records the decision.
- If a source checksum changes after binding, the run stops with `SOURCE_VERSION_MISMATCH`; the user may bind the new version and create a new baseline.
- Parse and validation failures quarantine affected partitions while preserving successful partition results. Release remains blocked until policy permits and explains every quarantined record.
- Worker or device interruption resumes from the last durable partition checkpoint. Completed partitions are not recomputed unless engine or plan version changes.
- Local disk exhaustion is detected before materialization where possible. The job transitions to canonical state `FAILED` with reason code `INSUFFICIENT_LOCAL_CAPACITY` without deleting compatible prior checkpoints; after space is available, an authorized retry creates a new attempt or job according to `JRA`.
- A revoked Device identity is never reactivated and cannot receive new jobs or synchronize row data. The installation must enroll a new Device identity; an authorized recovery/import workflow may then validate and reconcile preserved local results under the new identity, otherwise the user may export them locally when policy permits.
- Package creation is atomic: content is written to a temporary staging area, checksums are verified, and only then is the package marked available. Failed staging is recoverable and never exposes a partial released package.
- Undo means selecting or cloning an earlier plan version and rerunning. It never overwrites prior runs, decisions, or packages.

## 11. APIs, events, and extension points

### REST resources

- `/v1/workspaces/{workspaceId}/migration-projects`
- `/v1/migration-projects/{projectId}/sources`
- `/v1/migration-projects/{projectId}/baselines`
- `/v1/migration-projects/{projectId}/target-schema-bindings`
- `/v1/migration-projects/{projectId}/plans`
- `/v1/migration-projects/{projectId}/runs`
- `/v1/migration-runs/{runId}/records`
- `/v1/migration-runs/{runId}/reconciliation`
- `/v1/migration-projects/{projectId}/review-details`
- `/v1/migration-projects/{projectId}/review-facades/{jraReviewTaskId}`
- `/v1/migration-projects/{projectId}/packages`

Mutating endpoints require an idempotency key and return the durable resource version. List endpoints use cursor pagination and permission-aware field projection. Large source and package transfers use short-lived, scoped upload/download grants rather than proxying bytes through the control-plane API.

Migration routes create or revise project bindings and projections only. Canonical dataset, schema, mapping, and rule authoring and publication use the `DSM` APIs; a migration plan records the returned immutable version IDs and hashes.

Review and approval routes call `JRA` facades and return canonical IDs and revisions. Migration storage retains only immutable review details and approval bindings containing requested action, exact subject type/ID/version/hash, and `jraApprovalRequestId`.

### Typed jobs

- `PROFILE_MIGRATION_SOURCE`
- `COMPARE_MIGRATION_SOURCES`
- `VALIDATE_MIGRATION_PLAN`
- `RUN_MIGRATION_DRY_RUN`
- `RERUN_MIGRATION_PARTITIONS`
- `RECONCILE_MIGRATION_RUN`
- `BUILD_MIGRATION_PACKAGE`
- `GENERATE_MIGRATION_BOOK`

Each job declares workspace, project, immutable input IDs, expected checksums, processor capability, effective `DSO` policy, maximum resources, idempotency key, and result schema. `JRA` alone owns dispatch, progress, cancellation, retry, and terminal Job state. Each `MigrationRun` stores `jraJobId` and the accepted pinned `resultManifestId`; its business state updates idempotently from committed `JRA` outbox/results. Mapping is explicit: JRA `QUEUED`/`RUNNING` project to migration `PREPARING`/`PROCESSING`, `SUCCEEDED` plus accepted manifest projects to `RESULT_READY`, and `FAILED`/`CANCELLED` project to the matching business failure/cancellation; policy may keep a successful execution `BLOCKED` or `NEEDS_REVIEW`. Jobs cannot contain executable code.

### Domain events

- `migration.project.created`
- `migration.source.profiled`
- `migration.plan.published`
- `migration.review_binding.created`
- `migration.review_projection.updated`
- `migration.run.started`
- `migration.run.completed`
- `migration.run.failed`
- `migration.reconciliation.failed`
- `migration.package.approval_binding.created`
- `migration.package.released`
- `migration.package.downloaded`

Events contain identifiers and policy-approved summaries, not unrestricted row data. Events are versioned and delivered at least once; consumers deduplicate by event ID.

### Extension points

- Parser adapters implement a versioned input-to-dataset contract.
- Target-schema importers convert documented schemas into `DSM` schema drafts and submit them to the canonical `DSM` publication workflow.
- Declarative transformation functions register with the `DSM` typed rule/transform registry, including name, typed inputs/outputs, determinism, version, resource bounds, evidence behavior, and fixtures.
- Package writers implement open-format output and manifest contracts.
- Optional destination adapters must declare capabilities, scopes, dry-run support, idempotency, rollback limitations, and approval requirements. They are disabled by default and cannot be embedded as arbitrary scripts.

## 12. Performance and capacity budgets

Defaults may be lowered or raised by workspace policy and licensed capacity, but a run records the effective limits.

| Budget | Default target |
|---|---|
| Web direct upload | Up to 250 MB per file and 2 GB per project batch; larger cloud ingestion uses resumable multipart upload. |
| MR high-capacity Desktop profile | Up to 20 GB per file, 50 million rows per asynchronous run, and 200 files per source batch on published reference hardware with admission, entitlement, and preflighted memory/free-disk requirements. |
| Target schema | Up to 25 entities and 1,000 total fields per project. |
| Rule plan | Up to 2,000 mappings/rules and 100 immutable reference datasets per plan. |
| Profiling latency | First structural summary within 30 seconds for a 100 MB local CSV; complete profile within 10 minutes for 5 million rows on the reference Desktop hardware. |
| Dry-run throughput | At least 100,000 simple tabular records per minute locally and per standard cloud worker, excluding OCR and external storage transfer. |
| Review query | Filtered counts and first page in under 2 seconds at p95 for a run with 10 million indexed record results. |
| Progress freshness | Durable counters checkpoint at least every 30 seconds; connected clients receive progress no more than 5 seconds behind the durable state at p95. |
| Package integrity | Checksum verification covers every file; package release is not visible until all checks pass. |
| Control-plane availability | 99.9% monthly for project, review, approval, and run-state APIs, excluding declared maintenance. |
| Recovery point | Zero application-caused loss of published plans, approvals, audit events, and durable completed partitions after an acknowledged commit under the ordinary-failure objective; total primary-region disaster follows the platform RPO and reconciliation policy. |

Preview tables show at most 1,000 rows per page and never load full datasets into a browser or Android process. Statistical summaries may use bounded sampling only when labeled with method, sample size, and estimated status; record counts and release reconciliation are exact.

## 13. Observability and product success metrics

### Operational observability

- Structured logs include correlation ID, workspace ID, project ID, run ID, job/partition ID, processor and rule versions, duration, outcome, and reason code; they exclude source values by default.
- OpenTelemetry traces span API request, durable job dispatch, engine execution, object access, reconciliation, approval, and package build.
- Metrics include queue age, run latency, rows/bytes processed, partition retry rate, parse failures, review backlog, reconciliation failures, package build failures, sync lag, and device availability.
- Alerts cover stalled jobs, poison partitions, checksum mismatches, repeated engine crashes, unexpected disposition shifts, object-transfer failures, and approval-delivery failures.
- An authorized support bundle contains redacted configuration, versions, counters, and failure codes; raw records require a separate user-authorized export.

### Product success metrics

- At least 95% of production package runs have zero unexplained records in reconciliation.
- At least 90% of approved mappings are reused without change on the next batch of the same plan.
- Median time from first successful profile to first releasable dry-run is below one business day for projects under one million rows.
- Fewer than 1% of released records require a post-release correction attributable to a DataBreeze transformation.
- At least 80% of review items include a decision reason suitable for later audit.
- Package regeneration from the same pinned inputs produces identical normalized data and control totals in 100% of golden-fixture and production integrity checks.

Analytics use workspace-approved metadata and aggregate counters. Row values, evidence excerpts, and field names marked sensitive are not included in product telemetry.

## 14. Acceptance and testing criteria

A release is acceptable when all P0 requirements pass and the following tests are automated or documented:

1. A Vietnamese CSV/XLSX fixture containing diacritics, mixed date formats, decimal separators, blank identifiers, and duplicate customers profiles and maps without corrupting Unicode or source values.
2. Repeating a dry-run with identical pinned inputs produces identical output values, dispositions, reason codes, checksums, and reconciliation totals.
3. Equivalent Desktop and cloud runs pass golden-fixture parity for mappings, normalization, duplicate scores, dispositions, and totals.
4. Changing a source after binding produces `SOURCE_VERSION_MISMATCH` and cannot silently replace the bound artifact version.
5. An ambiguous duplicate cannot auto-merge; a reviewed merge retains field-level lineage to all contributing source records.
6. A required target field without mapping/default/waiver blocks plan publication or release according to policy.
7. Input count equals ready plus rejected plus excluded plus duplicate members accounted for through survivor contribution; an injected missing record causes reconciliation failure.
8. Numeric control totals use the configured decimal precision, rounding, currency, and tolerance, and a boundary violation blocks release.
9. A user lacking package-download permission cannot obtain an object grant even if they know the package ID.
10. Separation of duties prevents the last plan editor from approving the release when enabled.
11. Offline Desktop processing resumes after restart without duplicate results, review items, or audit events.
12. Conflicting offline review decisions remain visible and unresolved until an authorized reviewer reconciles them.
13. A failed package build exposes no partial release; retry creates exactly one released package for the idempotency key.
14. Local mode processes row data and builds a package without transmitting originals or rows, verified by network-contract tests.
15. Fuzz and property tests cover parser boundaries, declarative transformation typing, Unicode normalization, stable matching, partition retry, and disposition accounting.
16. Security tests cover tenant isolation, signed typed-job validation, device revocation, object-grant scope, approval bypass, and audit immutability.
17. Web, Desktop, and Android critical flows meet WCAG 2.2 AA or native accessibility equivalents for labels, focus, contrast, scaling, and screen-reader output.

## 15. Delivery slices and future expansion

### Slice 1 — Profile and map

Project setup, immutable source bindings, CSV/XLSX/JSON ingestion, bindings to published `DSM` target schemas and mappings, complete profiling, constrained transformation planning, Desktop execution, evidence, and audit.

### Slice 2 — Clean, deduplicate, and dry-run

Bindings to published `DSM` rule sets and reference datasets, deterministic normalization, duplicate candidates and review, dry-run dispositions, exception queues, overrides, and run comparison.

### Slice 3 — Reconcile and release

Count and numeric reconciliation, release policies, approval gates, CSV/JSONL/Parquet package writers, manifests, checksums, migration book, resumable package transfer, and offline recovery.

### Slice 4 — Repeatable batches

Incremental source batches, plan cloning, cumulative reconciliation, stronger drift comparison, operational dashboards, and calibrated suggestion quality.

### Future expansion

- Additional documented parser and schema-import adapters.
- Workspace-governed, signed destination adapters with mandatory dry-run, explicit scopes, idempotency, and separate approval.
- More advanced deterministic entity-resolution features and active-learning suggestions that never bypass review.
- Cross-project reusable mapping drafts promoted through `DSM` with compatibility validation and provenance.
- Privacy-preserving tokenization and reversible pseudonymization under workspace-held keys.

Future work must preserve immutable originals, deterministic release gates, evidence traceability, provider neutrality, and the export-first default.
