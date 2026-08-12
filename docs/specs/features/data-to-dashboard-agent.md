# DataBreeze Data-to-Dashboard Agent

**Status:** Product specification<br>
**Version:** 1.2<br>
**Requirement prefix:** `DDA`<br>
**Dependencies:** IAM identity/authorization; IAE intake, immutable artifacts, evidence, retention, and deletion; DSM datasets, schemas, mappings, transformations, rules, metrics, profiling, validation, and lineage; JRA typed jobs, review tasks, findings, and approvals; DSO Device capabilities, data modes, transfer, synchronization, and offline queues; NCO notifications/collaboration; BUA entitlements/usage; AUD canonical audit ledger; Web, Windows Desktop, and Android platform contracts; shared Python processing engine; provider-neutral OCR and AI adapters

## 1. Purpose and outcome

The Data-to-Dashboard Agent turns user-controlled tabular data and reviewed receipt captures into trustworthy interactive dashboards. It combines governed intake, visible ETL/data-quality review, typed analysis, an editable dashboard canvas, evidence-backed publication, and dependency-aware refresh after accepted data changes.

The successful outcome is not merely a generated chart. It is an immutable published dashboard snapshot whose values can be reproduced from exact dataset, semantic, metric, transformation, plan, parameter, permission, and engine versions. The user can see what DataBreeze changed, which records were rejected or uncertain, why each visualization was selected, where every material number came from, how fresh it is, and what will happen when new data arrives.

The agent may interpret intent and propose mappings, transformations, metrics, visualizations, explanations, and canvas changes. It does not calculate authoritative numeric values, execute arbitrary code, silently publish, broaden permissions, or move data across a policy boundary.

## 2. Users and jobs-to-be-done

| User | Jobs-to-be-done |
|---|---|
| Solo operator or SME owner | Add a spreadsheet or receipts, correct important issues, obtain a useful dashboard, and add later data without rebuilding it. |
| Analyst or consultant | Govern mappings/metrics, inspect typed plans, create and publish dashboards, compare versions, and explain changes with evidence. |
| Data steward or admin | Control schemas, rules, quality gates, AI egress, refresh budgets, Hybrid publication projections, sharing, retention, and audit. |
| Receipt capture user | Scan a receipt, correct uncertain fields, prevent duplicates, and see the accepted record reach the dashboard. |
| Dashboard viewer | Interact with an authorized current snapshot and ask focused questions without receiving broader raw-data access. |

Vietnamese is the default complete locale; English is a complete secondary locale. Business terms, dates, numbers, currencies, time zones, quality states, and chart labels follow locale-aware formatting without translating source values unless a governed rule requests it.

## 3. Scope and non-goals

### In scope for V1

- Web upload of supported CSV and XLSX worksheets.
- Windows Desktop intake from user-approved folders containing supported CSV/XLSX files.
- Android receipt/document capture for bounded receipt, invoice, and table extraction profiles with cloud OCR in Hybrid/Cloud destinations.
- Immutable originals, governed cleaned dataset versions, permission-filtered source catalogs, and versioned dashboard materializations/snapshots.
- Source profiling, schema/mapping suggestions, typed transformation plans, automatic safe first-run preparation under `SAFE_NON_LOSSY`, before/after review, rejects, quality dimensions, and lineage.
- Workspace-owned conversations with version-bound messages, context-change events, and one bounded agent over typed tools.
- Vietnamese/English typed analysis plans with deterministic execution and evidence.
- Agent-proposed and user-editable responsive dashboard pages, widgets, filters, private deterministic starter canvases, and publication.
- `ON_CHANGE`, `MANUAL`, and `SCHEDULED` freshness policies.
- Dependency-aware recomputation, atomic snapshot publication, freshness/failure visibility, caching, quotas, and cost metering.
- Local, Hybrid, and Cloud behavior defined by DSO; Hybrid is the default.
- Workspace-member-only DashboardSnapshot audiences in V1.

### Explicit non-goals

- Arbitrary generated SQL, Python, JavaScript, macros, shell, filesystem, or remote-control commands.
- Continuous raw-dataset queries for ordinary dashboard page views.
- Genuine second-by-second streaming without a separate accepted specification.
- Silent transformation, source overwrite, record omission, dashboard publication, permission expansion, or cross-mode transfer.
- Factual “percentage correct” claims without a declared ground-truth comparison.
- A general web-search chatbot, causal oracle, accounting sign-off, or source of facts outside authorized governed data.
- Public, anonymous, bearer-link, or external guest dashboard resolution in V1.
- General unbounded document understanding outside published receipt, invoice, and table extraction profiles.
- Slack, Discord, broad connectors, or genuine streaming as V1 release gates.
- Broad database/API/cloud-drive/accounting/marketplace connector catalog in V1.
- General document understanding beyond published capture profiles.
- Direct persistence reads from any specialist feature module.

### Initial deployment-provider choice

Domain contracts remain provider-neutral. Under ADR-0005, the initial hosted deployment runs DataBreeze-controlled infrastructure on AWS Singapore and uses the OpenAI Responses API for receipt image extraction and optional mapping, analyst, narrative, and dashboard-proposal assistance. Only server-side adapters call OpenAI; clients never receive provider credentials. OpenAI output remains versioned candidate data and cannot bypass typed schemas, deterministic validation, human review, egress policy, evidence, admission, retention, or audit. Production uses a pinned evaluated model snapshot, `store: false`, strict structured receipt output, tools disabled for extraction, and explicit workspace policy for every transferred data class.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Cloud upload; ETL/quality review; dataset/semantic/metric binding; typed analyst; dashboard canvas; interactive publication; refresh/freshness; sharing; collaboration; administration; cloud execution. |
| Windows Desktop | Explicit folder selection; local path/manifests; stable-file detection; schema grouping/drift review; local ETL/analysis/evidence; offline work; Hybrid publication projection and sync. |
| Android | Active receipt/document capture; secure staging; resumable Hybrid/Cloud upload; OCR review/correction; dashboard viewing; freshness/caveats; focused analyst questions. |

Web and Desktop may share React/TypeScript dashboard packages through public contracts. Android remains native Kotlin/Compose and consumes generated contracts; it does not import service implementation or duplicate full dashboard authoring.

## 5. Primary workflows

### 5.1 Web file to dashboard

1. The user selects a Cloud or Hybrid workspace/project and uploads a supported CSV/XLSX input.
2. IAE finalizes an immutable ArtifactVersion only after content validation, checksum verification, malware policy, and object publication succeed.
3. A JRA job invokes DSM profiling against exact inputs and reports coverage, sampling, types, distributions, and quality candidates.
4. The agent proposes a typed schema/mapping/transformation plan and suggested semantic dimensions/measures without publishing them.
5. The review displays before/after samples, every step, changed/rejected counts, unsupported/excluded scopes, warnings, quality dimensions, cost estimate, and evidence.
6. Acceptance executes exact published definitions and creates a new immutable DSM DatasetVersion. Rejection or edits preserve the source and create no accepted output.
7. The user asks a question or requests a dashboard. The agent produces a typed analysis/dashboard plan with visible assumptions.
8. Deterministic execution produces materialized results. The user edits the responsive canvas and publishes an immutable dashboard snapshot.

### 5.2 Hybrid Desktop folder

1. The user enrolls Desktop, selects a folder through the OS picker, and binds the DSO capability to one workspace/project.
2. The user confirms purpose, allowed types, grouping, append/replace/version behavior, date/overlap rules, duplicate keys, saved mapping policy, debounce/stability, and publication projection.
3. Desktop fingerprints stable supported files and proposes dataset groupings; paths and local display names remain local.
4. Known compatible files may run the approved typed plan locally. Drift, overlap, ambiguity, duplication, instability, or unsupported content enters review/quarantine.
5. Acceptance creates a local governed DatasetVersion and synchronizes only the authorized projection/result classes.
6. The cloud registers the synchronized version idempotently, emits a dataset-version event, and refreshes affected dashboard materializations.
7. Offline local work remains visible locally; Web/mobile keep the last complete cloud snapshot and show source/freshness state until synchronization succeeds.

### 5.3 Android receipt capture

1. The user actively selects a Hybrid/Cloud workspace and starts CameraX/document capture.
2. Android preserves the original, creates secure account/workspace staging metadata, and queues resumable WorkManager upload.
3. A provider-neutral cloud OCR adapter returns merchant, transaction time/date, currency, subtotal, tax, total, optional payment reference/method, optional line items, field/token confidence, model version, and evidence coordinates.
4. Deterministic rules reconcile subtotal/tax/total, validate required fields/types/currency, and detect probable duplicate captures.
5. Uncertain or conflicting candidates enter field-level review. User correction creates a new version and never overwrites the original extraction record.
6. An accepted record becomes a governed DSM DatasetVersion/append result and triggers affected dashboard refresh.

### 5.4 Ask, explain, and change the canvas

1. The user chooses a dataset/dashboard scope and asks a Vietnamese/English question or requests a presentation change.
2. The planner identifies candidate metrics, dimensions, filters, date range, comparison, widget type, target page, assumptions, and estimated cost.
3. Materially ambiguous interpretations are named for user selection; the agent does not silently choose.
4. The accepted typed plan executes deterministically against exact authorized versions.
5. The answer exposes coverage, freshness, quality, caveats, calculation provenance, and evidence.
6. A requested canvas change becomes a versioned proposal and preview. Acceptance creates a draft DashboardVersion; publication remains a separate authorized action.
7. The dashboard authoring surface may present an accepted draft DashboardVersion as continuously saved work without requiring the user to manage or see the internal `draft` state name. This presentation does not weaken immutable parent versions, proposal acceptance, audit, restore, or approval behavior.
8. Publication controls may live outside the authoring canvas in a distinct sharing/release flow. Any operation that creates or changes a DashboardSnapshot or its audience remains a separate authorized, audited action and never occurs through autosave.
9. The dashboard-local agent entry point may invite the user to add or change a chart. The resulting chart picker shows only compatible allowlisted widgets, keeps alternatives as a proposal, and requires explicit user confirmation before mutating the saved canvas version.

### 5.5 Refresh after trusted change

1. DSM commits an accepted DatasetVersion and its transactional outbox event.
2. DDA resolves dashboard bindings and exact affected materialization definitions.
3. Duplicate events deduplicate; compatible changes inside the debounce window coalesce.
4. JRA runs typed materialization jobs pinned to exact input, semantic, plan, parameter, permission, and engine versions.
5. The system verifies every required result manifest. A compatible prior result may be reused only when its complete cache key matches.
6. A complete DashboardSnapshot publishes atomically and emits a content-safe event.
7. Connected clients receive the event and fetch changed authorized results. A failure leaves the prior snapshot active with an explicit stale/blocked state.

## 6. Functional requirements

Priorities are `P0` (required for the capability's first production release or safety), `P1` (required for complete generally available operation), and `P2` (designed extension).

| ID | Priority | Requirement |
|---|---|---|
| DDA-001 | P0 | DDA shall compose IAM, IAE, DSM, JRA, DSO, NCO, BUA, and AUD through public contracts and shall not create alternate authorities for identity, bytes/evidence/retention, governed data/definitions, jobs/reviews/approvals, synchronization, usage, or audit. |
| DDA-002 | P0 | Web intake shall accept only published supported CSV/XLSX profiles with explicit size/row/column/sheet/encoding/formula limits, validate actual content rather than extension, and finalize through IAE immutable upload contracts. |
| DDA-003 | P0 | Every source, cleaned output, rejected-row bundle, receipt capture, materialized result, and published snapshot shall bind full TenantScope, exact parent/input versions, content/schema hashes, data classification, effective data-mode policy, and IAE retention/evidence references as applicable. |
| DDA-004 | P0 | DDA shall never overwrite an original or accepted DatasetVersion; mapping, transformation, correction, rerun, and refresh shall produce explicit immutable versions and lineage. |
| DDA-005 | P0 | A proposed ETL plan shall be a versioned graph of allowlisted typed transformations bound to exact input, schema, mapping, rule, and engine versions and shall contain no arbitrary code. |
| DDA-006 | P0 | ETL review shall display source/inferred/target schemas, ordered steps, material assumptions, before/after samples, changed/unchanged/rejected counts, exclusions, unsupported scopes, sampling, quality-gate effects, evidence availability, and estimated resource cost before acceptance. |
| DDA-007 | P0 | Accepted ETL execution shall run through a JRA typed job and register a DSM DatasetVersion only after result-manifest, counts, hashes, schema, lineage, rejected-row accounting, and effective policy verification succeed. |
| DDA-008 | P0 | No input row or field shall be silently omitted; rejected, quarantined, unsupported, truncated, or unprocessed scopes shall remain counted, reason-coded, discoverable, and unable to satisfy a complete quality gate. |
| DDA-009 | P0 | The UI shall report completeness, validity, uniqueness, consistency, freshness, and extraction confidence as separate named dimensions with declared denominator, coverage, rules/expectation, sample status, and limitations. |
| DDA-010 | P0 | DDA shall not label profile or AI output as percentage correct; an overall quality summary, when shown, shall disclose its deterministic formula, weights, missing-dimension behavior, coverage, and inability to prove factual correctness. |
| DDA-011 | P0 | Saved mappings and transform plans shall not auto-apply after material schema drift, ambiguous header matching, incompatible type change, overlapping period, changed duplicate key, or breaking target definition; the source shall enter review. |
| DDA-012 | P0 | A Windows folder binding shall reference an active DSO Device capability/grant while keeping the canonical path and local display name on Desktop; cloud state shall use only opaque binding/capability IDs and content-safe status. |
| DDA-013 | P0 | A versioned folder manifest shall declare purpose, supported file profiles, schema fingerprints, dataset grouping, append/replace/version rules, time/overlap rules, duplicate keys, mapping policy, stability/debounce policy, and publication projection. |
| DDA-014 | P0 | Desktop shall process a file event only after stability checks and content fingerprinting, deduplicate repeated filesystem events/content, and route ambiguous, drifting, overlapping, duplicate, unsupported, or path-escaping inputs to review or quarantine. |
| DDA-015 | P0 | The analyst shall represent every data question and dashboard calculation as a versioned typed plan over authorized DSM versions; AI-generated SQL, code, or numeric values shall never become executable or authoritative. |
| DDA-016 | P0 | Before analysis or dashboard generation, the UI shall show selected datasets, semantic/metric versions, dimensions, filters, date range/time grain, join paths, units, assumptions, output form, and estimated resource cost. |
| DDA-017 | P0 | Material ambiguity shall produce named alternatives or a clarification request; insufficient, unauthorized, stale, quality-blocked, or unavailable data shall produce a stable non-answer reason rather than an invented result. |
| DDA-018 | P0 | Deterministic processors shall calculate all displayed numeric results, and every material table/chart/KPI value shall expose exact plan/metric provenance plus permitted row/cell evidence or aggregate definition. |
| DDA-019 | P0 | AI narrative or visualization rationale shall use only a bounded policy-approved result/provenance package, label interpretation, and link each material numeric claim to deterministic result cells. |
| DDA-020 | P0 | A Dashboard shall own immutable DashboardVersions containing exact dataset/semantic/metric bindings, pages, responsive layouts, widgets, filters/parameters, query/materialization bindings, freshness policy, publication policy, locale/timezone, parent version, and canonical hash. |
| DDA-021 | P0 | V1 shall support accessible KPI, table, bar, line/area, pie/donut, and text/evidence-note widgets only when field types, grain, units, output bounds, and evidence behavior are compatible. |
| DDA-022 | P0 | The canvas shall support adding, moving, resizing, configuring, removing, and restoring widgets; page/widget IDs shall remain stable across layout edits, and responsive breakpoints shall never hide required evidence, warnings, or freshness state. |
| DDA-023 | P0 | Filters, date ranges, sorting, highlighting, drill-down, and parameter changes shall declare scope and typed behavior, preserve permission/row-field restrictions, and never change an approved/certified definition silently. |
| DDA-024 | P0 | An agent-created dashboard or canvas change shall remain a proposal showing its typed plan, affected pages/widgets, before/after summary, assumptions, and cost; explicit user acceptance shall create a draft version, not publish it. |
| DDA-025 | P0 | Publishing shall create an immutable DashboardSnapshot bound to one DashboardVersion, exact materialized results and input/permission versions, audience policy, freshness state, evidence availability, and canonical hash; material change shall create a new subject and invalidate applicable approval. |
| DDA-026 | P0 | Sharing or viewing a dashboard shall not grant underlying Dataset, original, row/field, evidence, analysis, or folder permissions; every read, filter, drill-down, download, SSE event, and share resolution shall re-authorize current scope. |
| DDA-027 | P0 | V1 dashboard freshness policies shall be `ON_CHANGE`, `MANUAL`, and `SCHEDULED`; genuine `STREAMING` shall not be represented as implemented without a separately accepted streaming contract. |
| DDA-028 | P0 | An accepted DSM DatasetVersion or other bound-input event shall resolve a versioned dependency index selecting affected dashboard materialization definitions; the consumer shall fetch protected data through authorized APIs rather than trust event payload content. |
| DDA-029 | P0 | Materialization cache identity shall include TenantScope, security/permission projection, dashboard/widget and plan versions, dataset/semantic/metric versions, parameters, locale/timezone where value-affecting, engine/adapter versions, and effective policy; an incomplete key shall never reuse a result. |
| DDA-030 | P0 | Refresh triggers, duplicate events, worker retries, folder replays, and client retries shall be idempotent; compatible changes inside a declared debounce window may coalesce without losing the final accepted input set. |
| DDA-031 | P0 | DDA may incrementally recompute only results whose processor declares compatible change semantics and verified prior state; otherwise it shall perform a bounded full recomputation and disclose that choice in usage/diagnostics. |
| DDA-032 | P0 | A DashboardSnapshot shall publish atomically only after every required materialization is verified against one compatible input/definition/permission set; a partial or mixed-version refresh shall never replace the last complete snapshot. |
| DDA-033 | P0 | Every dashboard shall show last successful refresh, exact input selector/versions, freshness state, pending time, and stable stale/blocked/source-unavailable reason; the last complete snapshot shall remain available subject to current authorization and retention. |
| DDA-034 | P0 | Connected clients shall receive only content-safe committed refresh events, tolerate duplicate/out-of-order delivery, and reconcile authorized state through REST after reconnect or event gap. |
| DDA-035 | P0 | For the published small-change reference profile, an `ON_CHANGE` dashboard shall publish a complete new snapshot within 60 seconds p95 after accepted input commit, excluding user-held review/approval and declared source-device unavailability. |
| DDA-036 | P0 | Admission shall enforce per-workspace storage, profile/ETL, AI, OCR, materialization, refresh-frequency, concurrency, cache-retention, and publication limits; denial shall preserve data and the last good snapshot and provide safe remediation. |
| DDA-037 | P0 | Hybrid publication shall require an explicit versioned projection of metadata, dashboard-specific aggregates, selected governed rows/columns, evidence derivatives, or original content; the UI shall preview classification, fields, counts/bytes, destination, evidence consequences, and effective policy before transfer. |
| DDA-038 | P0 | Local and cloud execution of the same typed ETL/analysis/materialization plan and fixture shall produce equivalent governed values, counts, units, quality states, reason codes, and evidence keys; representation bytes may differ only where declared. |
| DDA-039 | P0 | When a required Local/Hybrid source Device is offline, revoked, stale, or awaiting review/sync, cloud surfaces shall show the last authorized complete snapshot plus exact source/freshness reason and shall not upload, reroute, or substitute data automatically. |
| DDA-040 | P0 | Android V1 receipt capture shall require explicit user action and an authorized Hybrid/Cloud destination, preserve immutable originals, use encrypted account/workspace-scoped staging, and upload resumably through unique idempotent WorkManager operations. |
| DDA-041 | P0 | The receipt profile shall version merchant, transaction date/time, currency, subtotal, tax, total, optional payment method/reference, and optional line-item candidates with field/token confidence, adapter/model version, and evidence coordinates. |
| DDA-042 | P0 | Deterministic receipt validation shall reconcile subtotal/tax/total, enforce required type/currency/date rules, detect probable duplicate captures, and route low-confidence, conflicting, or duplicate candidates to review before governed dataset acceptance. |
| DDA-043 | P0 | Source values, filenames, worksheet cells, comments, OCR text, metadata, and evidence shall be treated as untrusted data and isolated from system/developer instructions; content shall not authorize tools, queries, canvas mutations, publication, or egress. |
| DDA-044 | P0 | Workspace AI/egress policy shall specify permitted adapter, locality, metadata, samples, result rows, evidence, retention, and purpose; provider failure or disablement shall not prevent deterministic ETL, saved dashboard viewing, or typed manual analysis. |
| DDA-045 | P0 | Intake, ETL proposals/acceptance, dataset registration, analyst plans/executions, canvas proposals/acceptance, refreshes, publication, sharing, downloads, evidence access, projection transfer, OCR review, and administrative changes shall be audited by the owning services with content-safe summaries. |
| DDA-046 | P0 | IAE shall remain authoritative for originals, derivatives, rejected-row bundles, materialized result bytes, snapshots, retention, legal hold, deletion, and recovery; DDA may add a retention constraint but shall not delete IAE content directly. |
| DDA-047 | P1 | Users shall compare two compatible dashboard snapshots and see changed inputs, transformations, quality dimensions, metrics, filters, widgets, and absolute/percentage/contribution result changes with declared null/zero behavior. |
| DDA-048 | P1 | Dashboard templates shall support reusable page/widget/filter patterns without embedding another workspace/project's data, secrets, permissions, or materialized results. |
| DDA-049 | P1 | An authorized viewer shall export permission-filtered widget data, chart specifications, dashboard metadata, and a provenance manifest in open formats without gaining broader source access. |
| DDA-050 | P1 | The system shall recommend related governed questions or visualizations using authorized metadata and prior typed results, but recommendations shall not imply a result before deterministic execution. |
| DDA-051 | P2 | A future streaming extension may maintain continuously updated materializations only after a separate specification defines ordering, lateness, corrections, replay, windowing, capacity, cost, and snapshot-consistency behavior. |
| DDA-052 | P0 | Every logical dataset shall expose a permission-filtered source catalog with opaque source ID, safe display label, type, version, status, health, transformations, refresh history, and authorized original/evidence action without transferring a Local path. |
| DDA-053 | P0 | First-run preparation may create an automatically accepted version only under an approved `SAFE_NON_LOSSY` policy, with no omitted rows, no ambiguity, no incompatible drift, no blocked quality gate, complete before/after accounting, immutable original, reversible derived steps, and an immediately visible summary; all other plans shall remain review candidates. |
| DDA-054 | P0 | An eligible accepted DatasetVersion may receive a private starter DashboardVersion from a deterministic allowlisted template without an AI call; AI-authored or shared-canvas changes shall remain proposals requiring confirmation. |
| DDA-055 | P0 | Conversations shall be workspace-owned, permission-filtered, dataset-scoped records containing version-bound messages, bounded summaries, retrieved evidence references, context events, retention state, and audit history; history shall never embed unrestricted source content. |
| DDA-056 | P0 | Opening an old conversation shall restore its recorded dataset/dashboard/filter context; old answers shall retain original provenance; a new request shall use the latest compatible authorized DatasetVersion only after recording and displaying a typed context-change event and shall never rewrite prior answers. |
| DDA-057 | P0 | Versioned receipt/invoice and generic table extraction profiles shall declare supported media, page/pixel/cell/row/column bounds, output schema, confidence, evidence coordinates, validation, duplicate behavior, review policy, cost admission, and immutable original retention. |
| DDA-058 | P0 | V1 DashboardSnapshot audiences shall be Owner, Workspace members, or Project members only; public, anonymous, bearer-link, and external guest resolution shall be rejected. |
| DDA-059 | P0 | A Desktop folder can be Web-usable only through an explicitly consented Cloud or Hybrid projection whose preview declares original transfer, safe label metadata, bytes, classification, destination, and evidence consequences; `LOCAL` shall remain non-transferable. |
| DDA-060 | P0 | The workspace agent may invoke only registered typed tools over authorized resource IDs; each tool shall resolve tenant scope server-side, enforce the independent agent grant, admit usage, return bounded structured results and evidence, and audit proposals or effects. |

## 7. Data model extensions

Every entity includes full applicable TenantScope, stable UUID, timestamps, optimistic revision where mutable, and actor attribution where applicable.

| Entity | Purpose and key fields |
|---|---|
| `Dashboard` | Stable dashboard identity, workspace/project, owner, title/description localization, current draft/published version IDs, status, and policy references. |
| `DashboardVersion` | Immutable parent, exact DSM binding versions, page/widget/filter graph, freshness/publication policies, locale/timezone, canonical hash, creator, and creation time. |
| `DashboardPage` | Stable page ID inside a version, order, localized title, responsive layout definitions, page filters, and accessibility summary. |
| `DashboardWidget` | Stable widget ID, type, typed display configuration, query/materialization binding, filter scope, evidence/freshness behavior, layout references, and accessibility metadata. |
| `DashboardDataBinding` | Exact DSM dataset/schema/semantic/metric versions or governed selectors, required quality/freshness policy, DSO constraint/projection reference, and permission policy. |
| `MaterializationDefinition` | Exact typed plan, parameters, output schema/bounds, dependency set, incremental-compatibility declaration, engine/capability requirements, and cache/retention policy. |
| `MaterializationRun` | JRA job/result-manifest binding, exact inputs/permissions/policy, attempt/occurrence identity, usage estimate/actuals, business projection, and failure reason. |
| `MaterializedResult` | Verified immutable bounded result partitions/summary, schema/content hashes, completeness/truncation, IAE object/evidence refs, and cache identity. |
| `DashboardSnapshot` | Immutable DashboardVersion plus exact required MaterializedResult IDs, input/permission/policy versions, freshness state/time, audience, approval binding, hash, and IAE snapshot manifest. |
| `DashboardRefreshBinding` | Freshness mode, trigger/selectors, debounce, schedule/timezone, next/last occurrence, budget, and disabled/blocked state. |
| `DashboardRefreshOccurrence` | Idempotency key, trigger event/range, selected definitions, JRA jobs, previous/new snapshot IDs, status, safe counts, usage, and reason. |
| `DashboardFolderBinding` | Reference to DSO Device capability/grant, local manifest identity/hash/version, DSM target binding, publication projection, content-safe health, and last accepted source fingerprint. Canonical path remains local. |
| `ReceiptCaptureProfile` | Versioned receipt field schema, locale/currency behavior, required fields, reconciliation/duplicate rules, confidence policy, OCR adapter capability, and DSM target binding. |
| `ReceiptExtractionReview` | Capture/source version, candidate-set version, field dispositions/corrections, shared JRA review ID, accepted output binding, and evidence references. |
| `DatasetSourceCatalogEntry` | Opaque source ID, safe display label, type, version, status, health summary, transformation/receipt refs, authorized original/evidence action, and no Local path. |
| `PreparationSummary` | Exact input/output/rejected counts, six named quality dimensions, transformation receipts, review reasons, and `automaticPolicy: SAFE_NON_LOSSY | NONE`. |
| `WorkspaceConversation` | Workspace-owned thread, permission filter, dataset scope, retention state, revision, and content-safe summary pointer. |
| `ConversationMessage` | Immutable version-bound message, actor, bounded text, evidence refs, and idempotency key. |
| `ConversationContextEvent` | Typed context change (`CONTEXT_RESTORED`, `DATASET_VERSION_ADVANCED`, `DATASET_ATTACHED`, `DATASET_DETACHED`, `DASHBOARD_VERSION_ADVANCED`, `FILTER_CONTEXT_CHANGED`) with before/after version refs. |
| `TableExtractionCandidate` | Table-profile candidate bounded by page/column/cell limits with per-cell evidence coordinates and review policy. |
| `NamedDashboardView` | Personal filter/view state bound to a DashboardVersion without changing the shared published definition. |

Mutable drafts use revision preconditions. Published definitions, accepted outputs, materialized results, and snapshots are immutable. Large layout graphs, result partitions, rejected rows, and provenance manifests use checksummed IAE-managed objects when PostgreSQL row storage would be inappropriate.

## 8. Processing, evidence, and confidence

- Typed ETL, analysis, materialization, and receipt-processing adapters declare input/output schemas, deterministic/AI role, locality, resource bounds, version compatibility, evidence behavior, incremental semantics, and golden fixtures.
- AI may propose a typed plan but the plan validator enforces authorization, types, cardinality, grain, units, time semantics, output bounds, cost, and quality gates.
- Numeric dashboard results come only from deterministic execution. Optional narrative receives a bounded structured result/provenance package.
- Every transformed field records source fields/coordinates, mapping/transform/rule versions, execution, and evidence set.
- OCR confidence is calibrated per field/token and adapter version. A high document-level score cannot substitute for critical-field review.
- Quality dimensions use deterministic denominators. Unknown/not-evaluated is not zero or pass.
- Sampling is visible and cannot satisfy a full gate unless that gate explicitly permits the published sampling policy.

## 9. Permissions, privacy, and data modes

Representative capabilities are `dashboard.create`, `dashboard.edit`, `dashboard.publish`, `dashboard.view`, `dashboard.share`, `dashboard.refresh`, `dashboard.export`, `analysis.execute`, `etl.review`, `folder.bind`, `projection.publish`, `receipt.capture`, and `receipt.review`. IAM owns roles/evaluation.

- **Local:** Source bytes, reconstructable rows/cells, local paths, detailed evidence, local plan drafts, and local result partitions remain on Desktop unless a separately confirmed DSO-allowed projection/result synchronizes. Cloud shows content-safe status and the last authorized published result.
- **Hybrid:** Default. Originals remain local unless explicitly selected; policy-approved governed rows/columns, dashboard aggregates, evidence derivatives, or results may synchronize through a named projection.
- **Cloud:** Authorized originals, governed datasets, materializations, OCR, and execution may reside in workspace-controlled cloud storage/workers.

Dashboard audience grants are independent from dataset/evidence permissions. A viewer can see only the authorized projection and aggregate behavior. Small groups and complementary values are suppressed when policy requires inference protection. Signed object grants are short-lived, resource-bound, and re-authorized.

Retention combines Workspace minimum, DDA constraint, IAE artifact/result lineage, published snapshot/share state, AUD class, legal hold, and recovery window. Cache eviction is not authoritative deletion and cannot remove the last required published/evidence object.

## 10. Offline, synchronization, failure, and recovery

- Desktop persists encrypted folder manifests, fingerprints, local dataset/catalog state, plan drafts, result manifests, and an idempotent outbox. Local execution may continue with valid signed policy/authorization snapshots and required definitions.
- Android persists encrypted capture/upload/review state and resumes from verified chunk boundaries across process death, reboot, network change, or lost acknowledgement.
- Offline work may create provisional local results but never a cloud publication, approval decision, permission change, or cross-mode transfer without current online authority.
- Folder event storms debounce and deduplicate by stable binding plus content fingerprint. Changed content under the same filename is a new intake version.
- If ETL or refresh input changes mid-run, the run completes against its frozen versions or cancels; inputs never mix.
- A failed optional widget may remain absent only when the published DashboardVersion declares it optional; required widget failure blocks snapshot publication.
- OCR/AI provider failure creates a retry or review state and preserves the capture/source; deterministic saved dashboards remain usable.
- Device revocation stops new folder/OCR/sync work, invalidates routes/grants, quarantines unsynchronized governed work when necessary, and never deletes user source files silently.

## 11. APIs, events, and extension points

Representative resource groups are:

- `/v1/dashboards`, `/versions`, `/pages`, `/widgets`, `/filters`, `/proposals`, and `/publications`;
- `/v1/dashboard-bindings`, `/materialization-definitions`, `/refresh-bindings`, `/refresh-occurrences`, `/snapshots`, and `/exports`;
- `/v1/dashboard-folder-bindings` for content-safe control-plane state, with DSO owning capabilities/grants;
- `/v1/receipt-profiles`, `/receipt-captures`, `/extractions`, and `/reviews`, with IAE/DSM/JRA owning their canonical foundation records;
- existing IAE upload/evidence, DSM dataset/definition/profile/validation, JRA job/review/approval, DSO sync/transfer, and BUA usage endpoints.

Typed jobs include `PROFILE_DASHBOARD_SOURCE`, `EXECUTE_DASHBOARD_ETL`, `PLAN_DASHBOARD`, `EXECUTE_DASHBOARD_ANALYSIS`, `MATERIALIZE_DASHBOARD_RESULTS`, `REFRESH_DASHBOARD`, `PROCESS_RECEIPT_CAPTURE`, and `VALIDATE_RECEIPT_RECORD`. Jobs contain exact resource IDs/hashes and typed parameters, never arbitrary code/paths/credentials.

Domain events include `dashboard.created`, `dashboard.version.created`, `dashboard.proposal.created`, `dashboard.snapshot.published`, `dashboard.refresh.requested`, `dashboard.refresh.blocked`, `dashboard.refresh.failed`, `dashboard.folder_binding.updated`, `dashboard.source_review_required`, `receipt.capture.synchronized`, `receipt.extraction.review_required`, and `receipt.record.accepted`. Canonical artifact/dataset/job/review/approval/sync/usage/audit events remain owned by their foundations.

Extension points include reviewed source profiles, transformation functions, profiler adapters, metric compilers, widget/renderers, OCR adapters, dashboard templates, and publication adapters. Extensions cannot broaden policy, bypass review/approval, read feature persistence directly, or execute arbitrary code in a client/application origin.

## 12. Performance and capacity

Default V1 reference ceilings may be lowered by plan/policy:

| Budget | Default target |
|---|---|
| Standard cloud file | 500 MiB, 1 million rows, 500 columns, 20 worksheets under a supported profile |
| Large local file | Existing Desktop/DSM ceiling of 5 GiB or 10 million streaming rows when supported |
| Dashboard | 10 pages, 100 total widgets, 50 filters/parameters, and 20 required materializations per visible page |
| Initial published view | Shell/loading state within Web budget; first visible required materialization within 2 seconds p95 when cached/warm |
| Bounded cached interaction | Filter/highlight/sort response within 200 ms p95 for client-held bounded data; otherwise visible async state within 300 ms |
| Analyst plan proposal | Within 10 seconds p95 excluding user clarification/provider unavailability |
| On-change refresh | Complete snapshot within 60 seconds p95 for <=10,000 added/changed rows and <=20 affected standard materializations after accepted commit |
| Receipt capture | Durable upload acknowledgement within 2 seconds p95 after complete verified upload; OCR target is adapter/profile-specific and visible |
| Refresh concurrency | Workspace and global limits enforced with fair queueing, coalescing, cancellation, and safe backpressure |

Over-limit actions show the limiting dimension, estimate, cost/usage effect, and safe split/sample/local/manual alternative. DataBreeze never silently truncates or downgrades quality/evidence to meet a budget.

## 13. Observability and product metrics

Traces correlate intake, artifact version, profile, ETL proposal/run, dataset version, analysis plan/run, dashboard/version/widget, materialization run/result, snapshot, refresh occurrence, folder binding/device, receipt/OCR/review, publication, usage, and audit IDs.

Operational metrics include queue/processing latency, cache hit/miss by safe keys, affected/reused/recomputed materializations, debounce/coalescing, snapshot publication/failure, freshness age, blocked reason, source-device availability, processed rows/bytes, reject rate, quality dimension coverage, OCR confidence/review, duplicate detection, and cost/usage units. Source values, filenames, paths, prompts, OCR text, dashboard titles, and evidence content are excluded from ordinary telemetry.

Product success measures time to first governed dashboard, ETL-review completion, percentage of material values with resolvable evidence, dashboard refresh success/freshness, repeat data additions without rebuild, analyst non-answer/clarification rate, canvas proposal acceptance/edit rate, receipt correction/duplicate rate, and sustained dashboard use.

## 14. Acceptance and testing

- A golden Web fixture uploads a messy Vietnamese/English sales CSV/XLSX, exposes deterministic quality dimensions/rejects, accepts a typed ETL plan, creates a governed dataset, answers a question, generates/edits/publishes a dashboard, and resolves every material value to evidence.
- Source-catalog tests prove opaque IDs, safe labels, Local path redaction, restricted-source non-enumeration, and authorized original viewing.
- Automatic-preparation tests prove `SAFE_NON_LOSSY` auto-accept bounds and that ambiguous, drifted, or incomplete plans remain review candidates with complete accounting.
- Starter-canvas tests prove private deterministic template creation without an AI call and that AI/shared-canvas mutations remain proposals.
- Conversation tests cover workspace ownership, permission filtering, version-bound messages, context restore, typed context-change events, and non-rewrite of prior answers.
- Table OCR tests cover declared bounds, evidence coordinates, hostile content isolation, and review for uncertainty.
- Sharing tests reject public, anonymous, bearer-link, and external guest snapshot audiences while preserving workspace/project member resolution.
- Desktop projection-consent tests prove Cloud/Hybrid preview consequences and that `LOCAL` never transfers.
- Agent-tool tests prove registered tools only, independent grant enforcement, tenant resolution, usage admission, and audited proposals/effects.
- Dashboard tests cover responsive pages, stable widget IDs, compatible/incompatible charts, filters, drill-down, permissions, accessibility, Vietnamese/English formatting, version diff, publication, withdrawal, and export.
- Refresh tests cover duplicate/out-of-order events, debounce, exact dependency selection, cache-key isolation, incremental/full fallback, worker retry, mixed-version rejection, required/optional widget failure, last-good retention, stale reasons, and SSE reconciliation.
- Hybrid tests prove paths stay local, prohibited bytes never upload, projections match previews/policy, folder replay is idempotent, schema drift/overlap/duplicates quarantine, offline work catches up, and revocation fails closed.
- Android tests cover CameraX capture, immutable originals, WorkManager resume, hostile content/metadata, OCR field confidence/evidence, arithmetic reconciliation, duplicate receipt, correction versions, tenant isolation, and dashboard update.
- AI security tests treat source cells, filenames, OCR text, comments, and evidence as prompt-injection content; they cannot authorize tools/code, change permissions, publish, or exfiltrate another scope.
- Local/cloud parity fixtures compare ETL, quality, analysis, materialization values, reason codes, and evidence keys.
- Performance/cost tests use declared reference profiles and verify no idle continuous polling or per-view raw-dataset scan.

## 15. Delivery slices and future expansion

### V1.1 — Cloud dashboard foundation

Web CSV/XLSX intake, immutable source, ETL/quality review, governed dataset, typed analyst, dashboard canvas, interactive publication, on-change/manual/scheduled refresh, evidence, cost controls, and atomic snapshots.

### V1.2 — Hybrid Desktop folder agent

Approved-folder binding/manifests, stable-file processing, local ETL/analysis, drift/duplicate review, publication projections, encrypted/offline sync, and cloud dashboard refresh.

### V1.3 — Cloud-connected Android receipt capture

Native capture, secure staging/resumable upload, cloud OCR adapter, field-level review, receipt validation/deduplication, governed record insertion, dashboard viewing, and refresh.

### Future expansion

Database/API/cloud-drive connectors, manual table/form intake, richer widgets/templates, advanced multi-dataset models, formal dashboard certification, customer portals, iOS, additional document profiles, and genuine streaming remain separately designed extensions. The retained specialist module specifications remain post-V1 and do not expand the DDA V1 gate automatically.
