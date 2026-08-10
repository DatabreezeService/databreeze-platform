# DataBreeze Private Data Analyst — Product Specification

**Status:** Product specification<br>
**Delivery position:** Post-V1 standalone specialist extension; DDA V1 implements only its bounded typed-analyst contract.<br>
**Version:** 1.0<br>
**Requirement prefix:** PDA<br>
**Dependencies:** Platform identity and workspace services; governed artifact, dataset, evidence, version, permission, typed-job, approval, audit, notification, report, and sync services; `IAE` Inbox, Artifacts, and Evidence foundation; `DSM` Datasets, Schemas, Rules, and Mappings foundation; `JRA` Jobs, Recipes, and Approvals foundation; `DSO` Devices, Synchronization, and Offline Operation foundation; Python processing engine with DuckDB/Polars execution; PostgreSQL; S3-compatible object storage; registered Desktop devices; provider-neutral optional AI adapter

## 1. Purpose and outcome

Private Data Analyst answers business questions over governed user-controlled datasets while preserving privacy, semantic consistency, and evidence. It converts a question or analysis definition into a typed query plan, executes deterministic calculations locally or in the workspace cloud boundary, and returns an answer whose figures and claims link to dataset versions, semantic definitions, query steps, and source evidence.

The module’s successful outcome is an evidence-backed analysis, not merely fluent text. Every answer must distinguish:

- results calculated from the selected governed data;
- semantic assumptions such as metric, unit, date, filter, and grouping definitions;
- source coverage, freshness, exclusions, and known quality limitations;
- optional AI-generated narrative or suggestions; and
- statements that cannot be answered from available authorized data.

Analyses can be saved, parameterized, shared, rerun, scheduled, and used in reports. Optional AI can run through a local model or a workspace-approved provider-neutral adapter. When data or semantics are insufficient, Private Data Analyst asks for clarification or says it cannot answer; it never invents a value or source.

## 2. Users and jobs-to-be-done

| User | Jobs-to-be-done |
|---|---|
| Business operator or manager | Ask a question in Vietnamese, understand the result and its limitations, and inspect the supporting records. |
| Analyst | Select published `DSM` metrics and dimensions, propose reusable-definition drafts through `DSM`, author reusable analyses, verify query plans, create charts, and publish governed results. |
| Data steward | Publish canonical semantic, metric, relationship, and alias definitions through `DSM`; manage analysis bindings, sensitivity, quality requirements, and certification status. |
| Workspace admin | Configure narrowing execution/retention constraints under `DSO`/`IAE`, AI and egress policy, quotas, permissions, devices, and allowed schedules. |
| Approver | Approve publication or external sharing of sensitive or consequential analysis results. |
| Viewer | Read an approved saved analysis or report without receiving broader dataset access. |

Primary user jobs are:

1. “Answer this business question using only the data I selected and can access.”
2. “Use our agreed definition of revenue, customer, order date, and business calendar.”
3. “Show how each number was calculated and let me drill to its source rows or cells.”
4. “Keep sensitive analysis on my PC when required.”
5. “Save this analysis so the team can rerun the same logic on a later dataset version.”

Vietnamese is the default interface and question language. The canonical `DSM` semantic catalog supports Vietnamese and English labels and aliases without translating source values unless an explicit governed rule requests it.

## 3. Scope and explicit non-goals

### In scope

- Analysis over governed tabular datasets derived from files, documents, other DataBreeze modules, Operations Capture records, or approved standards-based extracts.
- Versioned analysis-semantic bindings and read-only projections over immutable `DSM` schema, semantic, metric, relationship, calendar, and dataset versions.
- Vietnamese and English text questions and Android voice questions after explicit speech-to-text confirmation.
- Typed query planning for filter, project, join, aggregate, compare, rank, period-over-period, cohort, and bounded statistical operations.
- Deterministic execution using the Python engine, DuckDB, Polars, or equivalent reviewed engine components.
- Tables, a constrained chart catalog, concise narrative summaries, evidence drill-down, and downloadable result snapshots.
- Saved analyses, parameters, versions, certification, sharing, reruns, schedules, alerts, and report embedding.
- Optional local or workspace-approved provider-neutral AI for intent interpretation, plan suggestions, explanation, and narrative.
- Local, Hybrid, and Cloud execution according to data location, field policy, and device capability.

### Explicit non-goals

- A general web-search chatbot or source of facts not contained in selected workspace data and definitions.
- Private-site scraping, invisible browser automation, restricted marketplace access, or credential replay.
- Training a shared model on workspace data.
- Executing AI-generated arbitrary SQL, Python, JavaScript, shell commands, macros, or unrestricted database queries.
- Inferring or exposing rows, fields, or aggregates the user is not authorized to access.
- Automatically taking operational, financial, payment, file, or external-system actions from an analysis answer.
- Replacing formal statistical review, accounting sign-off, or legal/compliance interpretation.
- Fabricating an answer, citation, dataset, metric, trend, cause, or level of certainty.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Bind published `DSM` datasets, schemas, semantic definitions, and metrics into analysis models; submit reusable definition drafts through `DSM`; ask questions over cloud/synchronized data; inspect and edit typed plans; create tables/charts; save, certify, schedule, share, and embed analyses; manage permissions, AI/egress policy, quotas, audit, and cloud execution. |
| Desktop | Catalog explicit local datasets; profile and index local files; execute sensitive or large plans locally; offer optional local AI; inspect detailed row/cell evidence; save offline analyses and result snapshots; synchronize only policy-approved definitions, metadata, and outputs. |
| Android | Ask text or confirmed voice questions over authorized cloud/synchronized datasets; choose known metrics/filters; view compact tables, charts, caveats, and evidence; receive scheduled insight notifications; review and approve publication. Heavy local file analysis is not performed on Android. |

The control plane owns durable analysis-semantic bindings and projections, saved-analysis, schedule, sharing, feature-specific certification state, approval subject bindings/projections, and audit references. `DSM` remains the canonical publisher for governed datasets, schemas, semantic definitions, metrics, mappings, rules, and their immutable versions. `JRA` owns `ApprovalPolicy`, `ApprovalRequest`, and `ApprovalDecision`. The Python engine produces deterministic data results from exact bound versions. AI adapters may propose a typed plan or narrative, but the plan validator and deterministic engine remain authoritative.

## 5. Primary workflows

### 5.1 Govern a dataset and semantic model

1. A steward binds an existing `DSM` `Dataset` and pins an exact immutable `DatasetVersion`.
2. The system profiles fields and proposes `DSM` type, alias, entity, relationship, dimension, and measure drafts without publishing them.
3. The steward selects published `DSM` versions or edits proposals through the `DSM` workflow, then configures only analysis-specific default filters, sensitivity projection, and quality requirements in the binding.
4. Selected `DSM` `MetricDefinitionVersion` records specify formula, grain, aggregation behavior, exclusions, null handling, rounding, and allowed dimensions; new reusable metrics are drafted and published through `DSM`.
5. An authorized steward validates the analysis binding and activates an immutable binding version over the already published `DSM` definitions.

### 5.2 Ask and clarify

1. A user selects a governed data scope or starts from a certified analysis.
2. The user asks in text or, on Android, reviews and confirms the speech transcript.
3. DataBreeze identifies candidate metrics, dimensions, time range, filters, comparisons, and output form.
4. When multiple materially different interpretations remain, the system presents explicit alternatives or asks a concise clarification; it does not silently choose.
5. The selected interpretation becomes a typed analysis plan with visible semantic definitions and estimated resource cost.

### 5.3 Execute and answer with evidence

1. The authorization layer calculates allowed datasets, rows, fields, aggregates, and execution route.
2. The plan validator checks types, join paths, grain, fan-out risk, units, time semantics, quality gates, output bounds, and resource policy.
3. The deterministic engine executes the validated plan against pinned dataset versions.
4. DataBreeze returns result data, calculation provenance, coverage and quality notes, and evidence drill-down.
5. Optional AI generates narrative only from the structured result and supplied provenance. Every material numeric claim links to a result cell or evidence bundle.

### 5.4 Save, certify, and share

1. An analyst saves the question, typed plan, semantic version, parameter schema, display configuration, and result policy as an immutable analysis version.
2. For policy-controlled certification, the module facade creates a `JRA` `ApprovalRequest` with requested action and exact analysis subject type, ID, version, and hash; only a valid `JRA` `ApprovalDecision` permits the module to mark its certification state active.
3. Sharing grants access to the analysis artifact, not automatically to the underlying dataset.
4. A viewer sees either a frozen approved snapshot or a permission-checked rerun, as defined by share policy.
5. Export and report embedding preserve provenance, freshness, limitations, and approval state.

### 5.5 Schedule a recurring analysis

1. An authorized analyst chooses a saved version, parameters, data-version selector, schedule/event trigger, freshness policy, and recipients.
2. Each occurrence resolves exact input versions and executes idempotently.
3. Notification contains a redacted summary and a link to authorized details.
4. If inputs are late, quality gates fail, or semantics changed, the occurrence reports `BLOCKED` or `NEEDS_REVIEW` rather than publishing a stale or incompatible answer.

## 6. Functional requirements

Priorities are `P0` (required for first production release), `P1` (required for complete module operation), and `P2` (planned enhancement).

| ID | Priority | Requirement |
|---|---|---|
| PDA-001 | P0 | The system shall create an analysis-dataset binding to an existing `DSM` `Dataset` and exact immutable `DatasetVersion` records, then record module-specific locale, time zone, sensitivity projection, quality status, `dataModeConstraint`, `effectiveDataModePolicyRef`, `retentionConstraint`, and `effectiveRetentionPolicyRef` without registering a parallel dataset identity or broadening workspace policy. |
| PDA-002 | P0 | An analysis-semantic binding shall reference exact immutable `DSM` schema, semantic, metric, relationship, calendar, and dataset versions and shall expose only the projections and analysis policies needed for entities, fields, dimensions, filters, aliases, and evidence. |
| PDA-003 | P0 | Activated analysis-semantic binding versions shall be immutable; a referenced `DSM` definition change shall require a new binding version with a machine-readable compatibility diff rather than republishing the definition. |
| PDA-004 | P0 | Every bound `DSM` `MetricDefinitionVersion` shall declare formula, source fields, base grain, aggregation behavior, unit/currency, null handling, rounding, default filters, allowed dimensions, and description before analysis use. |
| PDA-005 | P0 | A relationship shall declare keys, cardinality, direction, optionality, effective-time behavior, and fan-out policy. |
| PDA-006 | P0 | Analysis-binding validation shall reject missing or incompatible `DSM` versions, cycles, missing keys, ambiguous joins, incompatible units, non-additive aggregation misuse, unknown functions, and unbounded definitions without creating a parallel semantic publisher. |
| PDA-007 | P0 | Users shall ask Vietnamese or English text questions within a selected authorized governed-data scope. |
| PDA-008 | P0 | Android voice questions shall display a transcript for user confirmation before any plan is executed. |
| PDA-009 | P0 | The planner shall represent analysis as a versioned typed intermediate plan, not executable free-form code. |
| PDA-010 | P0 | The typed plan catalog shall support projection, filter, governed join, group, aggregate, sort, top/bottom, period comparison, share-of-total, bounded cohort, and allowlisted statistical operations. |
| PDA-011 | P0 | When a question has multiple material interpretations, the system shall request clarification or present named alternatives and shall not silently select one. |
| PDA-012 | P0 | Before execution, the system shall show selected `DSM` metric/semantic versions, dimensions, filters, date range, time grain, dataset versions or selectors, and material assumptions. |
| PDA-013 | P0 | Plan validation shall enforce permissions, semantic types, join cardinality, grain, units, filter scope, output bounds, resource limits, and quality gates. |
| PDA-014 | P0 | The deterministic engine shall calculate all displayed numeric results; an AI adapter shall not supply or alter numeric result values. |
| PDA-015 | P0 | Every result shall bind exact `DSM` dataset and semantic/metric versions, analysis-semantic binding version, plan version, engine version, execution time, locale, time zone, `jraJobId`, and pinned `resultManifestId`. |
| PDA-016 | P0 | Every table or chart value shall expose calculation provenance and, when permitted, drill-down evidence to contributing source rows/cells or an exact aggregate definition. |
| PDA-017 | P0 | Answers shall disclose coverage period, source freshness, applied filters, exclusions, units, quality warnings, and whether results are complete, sampled, or truncated. |
| PDA-018 | P0 | If authorized data cannot answer the question, the system shall return `INSUFFICIENT_DATA`, `AMBIGUOUS`, `UNAUTHORIZED_SCOPE`, or another stable non-answer reason rather than inventing a result. |
| PDA-019 | P0 | Optional AI narrative shall be generated only from a bounded structured result and provenance package and shall label unsupported requested claims as unavailable. |
| PDA-020 | P0 | Each material numeric narrative claim shall link to one or more result cells; qualitative claims shall link to result/evidence or be labeled as interpretation. |
| PDA-021 | P0 | Users shall inspect and edit a typed plan through governed fields and operations before rerunning; arbitrary SQL or code execution shall not be exposed. |
| PDA-022 | P0 | The system shall render accessible tables and allowlisted bar, line, area, scatter, and pie/donut charts only when the selected fields and grain are compatible. |
| PDA-023 | P0 | Saved analysis versions shall retain question, plan, analysis-semantic binding and underlying `DSM` version references, parameter schema, display, result policy, owner, and parent version. |
| PDA-024 | P0 | A saved analysis shall define whether readers see a frozen snapshot or execute a permission-checked rerun; it shall not silently switch behavior. |
| PDA-025 | P0 | Sharing an analysis shall not grant underlying dataset permissions, raw-evidence access, or broader row/field visibility. |
| PDA-026 | P0 | Certified analyses shall display the exact certified subject version, certification scope, data freshness policy, expiry/invalidation conditions, and permission-filtered canonical `JRA` approval projection; the module shall retain requested action, exact subject type/ID/version/hash, and `jraApprovalRequestId` but no independent certifier decision. |
| PDA-027 | P0 | Breaking changes in referenced `DSM` definitions, failed required quality rules, expired certification, or unavailable input versions shall block a certified rerun until a new compatible binding is reviewed. |
| PDA-028 | P0 | Schedules shall bind a saved analysis version, parameters, input selector, trigger, freshness policy, recipients, and idempotent occurrence key. |
| PDA-029 | P0 | Scheduled answers shall not notify success when input freshness or required quality gates fail; they shall create a visible blocked occurrence. |
| PDA-030 | P0 | All questions, plans, executions, analysis-binding activations, referenced `DSM` publications, certifications, shares, exports, and evidence access shall be audited by the owning services according to workspace policy. |
| PDA-031 | P1 | Analysts shall compare two compatible result snapshots and show absolute, percentage, and contribution changes using declared zero and null behavior. |
| PDA-032 | P1 | Users shall create reusable parameter controls with type, allowed values/range, default, sensitivity, and permission-aware options. |
| PDA-033 | P1 | Result snapshots shall be embeddable in DataBreeze reports with immutable provenance and refresh policy. |
| PDA-034 | P1 | Desktop shall offer a provider-neutral local AI adapter when installed and capable; deterministic plan execution shall work without any AI adapter. |
| PDA-035 | P1 | Workspace admins shall configure which metadata, samples, result rows, and evidence may be sent to each approved AI adapter, with a previewable egress policy. |
| PDA-036 | P1 | A user shall export result data, chart specification, permission-filtered projections of referenced `DSM` semantic definitions, and a provenance manifest in open formats subject to permissions. |
| PDA-037 | P1 | Local and cloud execution of the same typed plan and fixture shall produce equivalent result values, row counts, units, reason codes, and evidence keys. |
| PDA-038 | P2 | The system may recommend related certified analyses or follow-up questions using authorized metadata, but recommendations shall never imply a result before execution. |

## 7. Data model extensions

All entities include `id`, `workspace_id`, timestamps, actor attribution where applicable, and optimistic-concurrency versions.

| Entity | Purpose and key fields |
|---|---|
| `AnalysisDatasetBinding` | Binding to a `DSM` `Dataset` and exact immutable `DatasetVersion` records, with sensitivity projection, locale/time zone, quality policy, `dataModeConstraint`, `effectiveDataModePolicyRef`, `retentionConstraint`, `effectiveRetentionPolicyRef`, and governed version selector. |
| `AnalysisSemanticBinding` / `AnalysisSemanticBindingVersion` | Stable analysis composition and immutable versions containing exact `DSM` schema, semantic, metric, relationship, calendar, and dataset version IDs plus analysis policies and checksum. |
| `AnalysisEntityProjection` | Read-only projection of a bound `DSM` entity/semantic version with base grain, primary key, backing dataset binding, description, sensitivity, and evidence policy. |
| `AnalysisMetricBinding` | Exact `DSM` `MetricDefinitionVersion` plus analysis certification state, compatibility status, and allowed presentation dimensions; formula semantics remain canonical in `DSM`. |
| `AnalysisDimensionBinding` | Exact `DSM` semantic-definition version plus analysis hierarchy, label projection, allowed-value policy, time behavior, and sensitivity projection. |
| `AnalysisRelationshipBinding` | Exact `DSM` relationship-definition version plus analysis direction, fan-out policy, and validation state. |
| `AnalysisConversation` | User-scoped question context, selected data scope, locale, `retentionConstraint`, `effectiveRetentionPolicyRef`, and authorized participants; not a source of truth for results. |
| `AnalysisQuestion` | Original text or confirmed transcript, normalized intent, actor, semantic candidates, clarification state, timestamp. |
| `AnalysisPlan` / `AnalysisPlanVersion` | Typed immutable plan graph, semantic references, parameters, estimated cost, validation, plan hash, parent version. |
| `AnalysisExecution` | Exact inputs and versions, `jraJobId`, pinned `resultManifestId`, effective route/policy, business-state projection, timings, counters, engine, idempotency key, and failure reason; no independent dispatch/retry/terminal Job state. |
| `AnalysisResultSnapshot` | Bounded immutable table partitions, summary cells, completeness/truncation, checksums, `retentionConstraint`, `effectiveRetentionPolicyRef`, and `IAE` object reference. |
| `ResultCellProvenance` | Result row/column key, metric expression, contributing partitions/rows or aggregate evidence, filters, semantic references. |
| `AnalysisAnswer` | Structured answer status, result references, coverage, limitations, quality notes, narrative adapter/version, publication state. |
| `AnswerClaim` | Narrative claim, type (`CALCULATED`, `INTERPRETATION`, `UNAVAILABLE`), result/evidence references, support status. |
| `ChartSpecification` | Allowlisted chart type, fields, encodings, sort, scale, labels, accessibility description, and result snapshot. |
| `SavedAnalysis` / `SavedAnalysisVersion` | Stable analysis identity and immutable versions containing plan, parameters, display, snapshot/rerun policy, owner, parent. |
| `AnalysisCertification` | Exact analysis version, scope, freshness/quality requirements, start/expiry, invalidation reason, feature-specific certification state, and `AnalysisApprovalBinding`. |
| `AnalysisApprovalBinding` | Requested action, exact subject type/ID/version/hash, `jraApprovalRequestId`, projected canonical status, and last verified `JRA` revision; no actor or decision payload. |
| `AnalysisSchedule` / `AnalysisOccurrence` | Saved version, parameters, input selector, schedule/trigger, recipients, occurrence key, inputs, state. |
| `AnalysisShare` | Recipient/principal, frozen/rerun mode, expiry, result/evidence permissions, export policy, revocation state. |

Result partitions and detailed provenance are stored as encrypted objects with permission indexes in PostgreSQL. Local-mode result data and evidence remain in the Desktop store; the control plane receives only definitions, hashes, status, approved snapshots, and aggregate metadata allowed by policy.

Private Data Analyst stores immutable `DSM` IDs, canonical hashes, compatibility state, and permission-filtered read-only projections. Reusable dataset, schema, semantic, metric, mapping, or rule definitions become canonical only through `DSM`; module drafts and bindings cannot publish them.

## 8. Processing, evidence, and confidence rules

### Query planning and execution

- A plan is a typed directed acyclic graph whose nodes reference published semantic identifiers and allowlisted operations.
- AI-generated or user-edited plans pass the same deterministic parser, schema, permission, join, grain, unit, quality, and resource validation.
- The query compiler generates engine instructions internally; generated SQL or engine expressions are never accepted back as untrusted executable input.
- Joins require a published relationship or an explicit draft relationship reviewed in the plan. Many-to-many joins require an approved bridge and grain declaration.
- Metric calculations use declared decimal precision and rounding. Currency conversion requires a governed rate dataset/version and effective-date rule.
- Execution pins dataset versions before reading. A “latest” selector resolves to exact versions recorded on the execution.
- Result reduction, sorting, and truncation are deterministic. Retrying an idempotent plan occurrence cannot create a different saved snapshot under the same input versions.

### Evidence

- Each result cell links to semantic definitions, filters, grouping keys, dataset versions, and either contributing stable row keys or an exact aggregate-evidence record.
- File-derived rows preserve artifact/version and page, sheet, cell, row, column, or JSON Pointer evidence from ingestion.
- Drill-down applies current permissions and may return a masked or aggregate explanation even when the result itself is visible.
- Evidence bundles include input freshness, quality-run references, excluded records, null behavior, sampling, and truncation.
- A chart retains the exact result snapshot and encoding; a narrative retains the exact structured result supplied to its adapter.
- Exported and embedded results carry a provenance manifest and do not rely on a conversational transcript for reproducibility.

### Confidence and non-fabrication

- Deterministic results are not assigned an AI confidence score. Their trust state derives from execution completeness, semantic certification, data freshness, quality gates, and evidence availability.
- Intent interpretation stores candidate semantic matches and component scores. If the top two materially different interpretations differ by less than `0.15`, or the selected metric/dimension is below `0.75`, the default behavior is clarification. Workspaces may require stricter thresholds.
- `COMPLETE` means the validated plan finished on all pinned inputs without truncation affecting the stated answer. `PARTIAL` identifies the exact missing, failed, filtered, sampled, or truncated scope.
- AI narrative is optional and provider-neutral. It receives only policy-approved structured results and definitions, never unrestricted workspace context.
- AI output is post-validated: numeric tokens expected to represent results must map to supplied result cells; unmatched material numbers or citations cause narrative rejection or removal.
- Causal language is prohibited unless the plan implements an approved causal method and the answer discloses its assumptions. Ordinary comparisons use “associated with” or descriptive language.
- If the answer is unavailable, the system returns the reason and a safe next step such as choosing a dataset, resolving a semantic ambiguity, or obtaining permission.

## 9. Permissions, privacy, and data modes

Module permissions are:

- `analyst.dataset.bind`
- `analyst.semantic.binding.edit`
- `analyst.semantic.binding.activate`
- `analyst.question.execute`
- `analyst.plan.edit`
- `analyst.evidence.read`
- `analyst.analysis.save`
- `analyst.analysis.certification.facade`
- `analyst.analysis.share`
- `analyst.analysis.schedule`
- `analyst.result.export`
- `analyst.ai.use`
- `analyst.audit.read`

Permission evaluation combines workspace role, dataset, row, field, metric, purpose, evidence, export, and AI-egress policies. Aggregate access is not inferred from raw-row access or vice versa. Small-group suppression and minimum aggregation thresholds can prevent inference of sensitive individuals.

Certification capabilities authorize a module facade only. `JRA` enforces approver eligibility, separation of duties, MFA, expiry, requested action, and subject-hash invalidation; Private Data Analyst stores no independent approval decision.

Data-mode behavior:

- **Local:** Source data, result rows, detailed provenance, local analysis-binding drafts, and optional local-AI context remain on Desktop. Content-safe published `DSM` definition projections and `CONTROL_METADATA` may synchronize automatically; any result snapshot or value-bearing narrative requires a separately confirmed `APPROVED_DERIVED_RESULT` under `DSO`.
- **Hybrid (default):** Originals may remain local. Governed structured datasets, selected aggregates, saved result snapshots, and evidence excerpts synchronize according to field and analysis policy. Plans route to the location containing all authorized inputs.
- **Cloud:** Authorized source datasets, `DSM` semantic projections, results, evidence, and AI context may be processed inside the workspace cloud boundary under egress policy.

The workspace `DSO` policy is the maximum authority. Analysis `dataModeConstraint` and `effectiveDataModePolicyRef` values may only narrow placement, processing, synchronization, or AI egress; every execution, snapshot publication, export, and transfer resolves the intersection again at execution time.

`IAE` is canonical for retention and deletion of source, evidence, snapshot, and export bytes. Analysis resources store only `retentionConstraint` and `effectiveRetentionPolicyRef`, which may narrow or extend but never shorten the workspace minimum. Deletion eligibility intersects workspace minimum, resource constraint, evidence/report lineage, legal hold, audit class, and recovery window; feature code requests deletion through `IAE`, and local cache cleanup is not authoritative retention.

No cloud AI adapter is enabled implicitly. An admin must configure the adapter and allowed context classes; a user must have `analyst.ai.use`; each execution records the effective egress policy and adapter version. Secrets remain in the platform secret store or OS credential vault and never enter prompts, plans, logs, or exports.

## 10. Offline, sync, failure, and recovery

- Desktop caches authorized `DSM` dataset catalog entries and immutable semantic/metric projections plus saved plans, reference data, and schedules needed for explicitly enabled offline analysis.
- A local question can execute offline when all pinned inputs and definitions are present. Otherwise it remains an unanswered local draft with reason `MISSING_PINNED_DATA`; this is not a JRA Job state, and the product never answers from stale conversational memory.
- Android may queue a confirmed question while offline and display cached frozen result snapshots with prominent `last refreshed` time. It does not claim a queued question has been answered.
- Offline edits create an analysis-binding draft branch only. Canonical `DSM` definitions are read-only; a concurrent `DSM` publication requires an explicit compatibility diff and new binding version, never last-write-wins.
- Saved analysis changes use immutable child versions and idempotent sync. Duplicate schedule occurrences are prevented by saved-version, scheduled-time, and parameter hash.
- Certification approval cannot complete offline. The local app may retain non-authoritative notes, but sync never creates an `ApprovalDecision`; an eligible actor must reopen the exact current analysis subject online, freshly confirm approve/reject, and satisfy current MFA.
- If a source changes during execution, the current pinned version completes when safely available; the newer version is not substituted silently. If pinned content disappears, execution fails with `INPUT_VERSION_UNAVAILABLE`.
- Engine interruption resumes safe partitions or restarts the deterministic execution. A result is not exposed as complete until all required partitions and reductions commit.
- AI timeout or provider failure does not discard deterministic results. The answer is delivered without narrative and states `NARRATIVE_UNAVAILABLE`.
- If narrative validation finds unsupported numbers or claims, the narrative is rejected and the structured result remains available.
- Schedule occurrences blocked by stale, missing, incompatible, or quality-failed input remain durable and notify owners according to policy.
- Revoking a share immediately blocks future API/object grants. Previously downloaded exports cannot be recalled and are covered by audit and expiry disclosure.
- Result-snapshot publication is atomic and checksum verified. Failed publication cannot replace the last valid certified snapshot.

## 11. APIs, events, and extension points

### REST resources

- `/v1/workspaces/{workspaceId}/analysis-dataset-bindings`
- `/v1/analysis-semantic-bindings`
- `/v1/analysis-semantic-bindings/{bindingId}/versions`
- `/v1/analysis-conversations`
- `/v1/analysis-questions`
- `/v1/analysis-plans`
- `/v1/analysis-executions`
- `/v1/analysis-executions/{executionId}/results`
- `/v1/analysis-results/{resultId}/evidence`
- `/v1/saved-analyses`
- `/v1/saved-analyses/{analysisId}/versions`
- `/v1/analysis-certifications`
- `/v1/analysis-schedules`
- `/v1/analysis-shares`

Mutation endpoints require idempotency keys and resource versions. Result endpoints use cursor pagination, bounded fields, suppression, and permission-aware masking. Large exports use short-lived scoped object grants. APIs return structured answer status and reason codes; HTTP success alone never implies an answered question.

These routes author analysis bindings, plans, projections, and feature-specific certification state only. Canonical dataset, schema, semantic, metric, mapping, and rule authoring and publication use the `DSM` APIs. Certification approval actions call the `JRA` facade and retain only requested action, exact subject type/ID/version/hash, `jraApprovalRequestId`, and canonical revision.

### Typed jobs

- `PROFILE_ANALYSIS_DATASET`
- `VALIDATE_ANALYSIS_SEMANTIC_BINDING`
- `INTERPRET_ANALYSIS_QUESTION`
- `VALIDATE_ANALYSIS_PLAN`
- `EXECUTE_ANALYSIS_PLAN`
- `BUILD_ANALYSIS_EVIDENCE`
- `GENERATE_ANALYSIS_NARRATIVE`
- `RENDER_ANALYSIS_EXPORT`
- `RUN_SCHEDULED_ANALYSIS`
- `COMPARE_ANALYSIS_RESULTS`

Jobs declare immutable inputs, semantic and plan versions, allowed executor, field projection, resource/output bounds, effective `DSO` and egress policy, idempotency key, and typed result schema. `JRA` alone owns dispatch, progress, cancellation, retry, and terminal Job state. Each `AnalysisExecution` stores `jraJobId` and the accepted pinned `resultManifestId`; its business state updates idempotently from committed `JRA` outbox/results. Mapping is explicit: JRA `QUEUED`/`RUNNING` project to analysis `PLANNED`/`EXECUTING`, `SUCCEEDED` plus accepted manifest projects to `RESULT_READY`, and `FAILED`/`CANCELLED` project to corresponding execution failure/cancellation; semantic, quality, or publication policy may keep a successful result `PARTIAL`, `BLOCKED`, or `NEEDS_REVIEW`. No job contains arbitrary SQL, code, credentials, or unrestricted paths.

### Domain events

- `analyst.semantic_binding.activated`
- `analyst.question.clarification_required`
- `analyst.execution.started`
- `analyst.execution.completed`
- `analyst.execution.partial`
- `analyst.execution.failed`
- `analyst.analysis.saved`
- `analyst.analysis.certification_binding.updated`
- `analyst.certification.invalidated`
- `analyst.schedule.blocked`
- `analyst.schedule.completed`
- `analyst.analysis.shared`
- `analyst.share.revoked`

Events are versioned, redacted, and delivered at least once. Consumers deduplicate by event ID and fetch authorized detail through APIs.

### Extension points

- Dataset readers implement bounded, versioned dataset-to-columnar-batch contracts.
- Semantic and metric engine functions register against `DSM` definition contracts and declare typed inputs, output type/unit, grain behavior, determinism, engine support, and golden fixtures.
- Calendar and currency adapters consume governed versioned datasets rather than hidden online data.
- AI adapters implement capability, locality, context/egress, retention, model version, timeout, and structured-output contracts.
- Chart renderers consume allowlisted chart specifications and immutable bounded result snapshots.
- Report integrations accept snapshot, provenance, freshness, and certification metadata.

An extension cannot execute a consequential analysis unless it supports typed validation, permission projection, resource bounds, provenance, versioning, and deterministic result testing.

## 12. Performance and capacity budgets

Defaults are workspace-configurable within device, privacy, and licensed-capacity guardrails. Every execution records effective limits.

| Budget | Default target |
|---|---|
| Semantic model | 100 entities, 1,000 fields, 500 metrics, 1,000 dimensions, and 500 governed relationships per version. |
| PDA high-capacity cloud scan | Up to 20 million rows or 25 GB per asynchronous execution under the named PDA profile, module admission, isolated resources, and entitlement; larger plans require a contracted capacity profile. |
| PDA high-capacity Desktop scan | Up to 100 million rows or 100 GB of local columnar/tabular data per asynchronous execution on published reference hardware with preflighted memory/disk and sufficient free space. |
| Typed plan | 100 nodes, 20 joins, 50 metrics, 50 parameters, and 10 result panels per execution. |
| First plan | Deterministic catalog plan or AI-assisted plan proposal within 8 seconds at p95, excluding user clarification and a declared unavailable provider. |
| Interactive result | Under 5 seconds at p95 for a warm single-dataset aggregate over 5 million columnar rows; under 30 seconds for standard bounded multi-dataset plans. |
| Result preview | 50,000 table rows maximum per interactive snapshot, first page of 100 rows, and 10,000 plotted marks before deterministic aggregation or refusal. |
| Evidence drill-down | First authorized evidence page under 2 seconds at p95 for indexed results. |
| Scheduled dispatch | Within 60 seconds of due time at p95 in Cloud; within 120 seconds while assigned Desktop service is running. |
| Progress freshness | Connected clients receive durable execution progress no more than 5 seconds late at p95. |
| Export | Stream up to 5 million permitted result rows; larger export requires a bounded asynchronous job and workspace policy. |
| Control-plane availability | 99.9% monthly for semantic, execution-state, saved-analysis, share, and schedule APIs, excluding declared maintenance. |

The planner estimates scanned bytes, row expansion, result cardinality, and memory before execution. A plan outside budget is rejected or converted to an explicitly approved asynchronous run; the engine never removes filters or evidence to make a plan fit.

## 13. Observability and product success metrics

### Operational observability

- Structured logs include correlation ID, workspace, user/principal, semantic model/version, plan/execution, dataset IDs/versions, route, durations, row/byte counts, result status, and reason code. Questions, row values, prompts, and result values are redacted by default.
- OpenTelemetry spans cover authorization, semantic resolution, clarification, plan validation, input resolution, execution nodes, reduction, evidence build, narrative, snapshot publication, share access, and schedule delivery.
- Metrics include question-to-plan latency, clarification rate, validation failures, execution duration, scanned bytes, cache hit, join expansion, partial/non-answer rates, evidence latency, narrative rejection, AI/provider failures, schedule blocks, snapshot freshness, and sync lag.
- Alerts cover tenant-policy violations, repeated unsupported narrative claims, anomalous raw-data egress, runaway plan estimates, certified-analysis failures, stale scheduled outputs, local/cloud parity failures, and unauthorized evidence attempts.
- Support bundles contain plan schemas, versions, counters, redacted error codes, and adapter status; including questions or result samples requires explicit case-scoped user authorization.

### Product success metrics

- 100% of material numeric claims in published narrative link to deterministic result cells.
- Zero known fabricated datasets, citations, or numeric results in released answers.
- At least 90% of answered questions expose complete provenance and no unresolved semantic ambiguity.
- At least 80% of common questions over certified models complete without analyst plan correction after the model’s first 30-day stabilization period.
- Median time from question submission to an evidence-backed standard result is below 15 seconds.
- Fewer than 2% of certified-analysis reruns are later corrected because of semantic or join-grain error.
- At least 95% of scheduled occurrences end as delivered, blocked with a specific reason, or intentionally skipped according to policy; none disappear silently.
- Local mode has zero raw-data egress in continuous privacy-contract tests.

Usage analytics rely on aggregate state and timings. Question text, voice, prompts, semantic labels marked sensitive, values, and evidence are excluded unless the workspace explicitly enables bounded diagnostic collection.

## 14. Acceptance and testing criteria

A release is acceptable when all P0 requirements pass and the following tests are automated or documented:

1. A Vietnamese question resolves certified Vietnamese aliases, preserves diacritics, shows its metric/date/filter interpretation, and calculates from a deterministic fixture.
2. Two materially different metric or date interpretations trigger clarification rather than an arbitrary answer.
3. An unavailable metric, missing dataset, denied field, or incomplete source produces the correct non-answer/partial status and never a fabricated value.
4. Metric tests cover additive, semi-additive, ratio, distinct-count, currency, null, zero denominator, rounding, and period-comparison behavior.
5. Join tests reject undeclared, ambiguous, and unsafe many-to-many relationships and prevent fan-out double counting.
6. Every displayed result cell links to the pinned dataset versions, semantic definition, filters, plan nodes, and permitted row/cell or aggregate evidence.
7. A user with access to a shared aggregate but not raw rows cannot retrieve raw evidence, infer suppressed small groups, or expand the share’s scope.
8. AI planner output containing arbitrary SQL, unknown operations, unauthorized fields, or an excessive plan is rejected before execution.
9. Narrative validation removes or rejects invented numbers and unsupported citations while retaining the deterministic structured result.
10. Disabling or failing every AI adapter still permits semantic browsing, manual typed-plan creation, deterministic execution, evidence, save, and export.
11. Desktop and cloud golden fixtures produce equivalent values, units, row counts, reason codes, and evidence keys.
12. A saved frozen snapshot never reruns silently; a rerun share always rechecks permissions, semantic compatibility, freshness, and quality gates.
13. Breaking semantic changes invalidate a certification and block scheduled publication until review.
14. Offline Desktop executes only with available pinned data; offline Android labels cached results with freshness and queues rather than pretends to answer.
15. Duplicate scheduled delivery, worker retry, or sync replay produces one occurrence and one published snapshot per occurrence key.
16. Permission and tenant-isolation tests cover models, questions, plans, rows, metrics, evidence, AI egress, certifications, shares, schedules, exports, and object grants.
17. Property and fuzz tests cover typed plans, filters, time zones, Unicode, decimal arithmetic, join cardinality, output bounds, evidence mapping, and idempotency.
18. Web, Desktop, and Android question, clarification, result, chart, evidence, and approval flows meet WCAG 2.2 AA or native accessibility equivalents.

## 15. Delivery slices and future expansion

### Slice 1 — Governed deterministic analysis

Bindings to the `DSM` dataset catalog and immutable semantic/metric/dimension/relationship versions, Vietnamese text questions through deterministic patterns, typed plan view/editor, local/cloud execution, tables, basic charts, evidence, non-answer states, and audit.

### Slice 2 — Optional AI and saved work

Provider-neutral planner and narrative adapters, local-AI option, structured-output validation, saved/versioned analyses, parameters, snapshots, sharing, export, run comparison, and Android text/voice review.

### Slice 3 — Certification and recurring insight

Certification, semantic compatibility, freshness and quality gates, schedules and occurrence recovery, notifications, report embedding, aggregate suppression, egress controls, and operational dashboards.

### Future expansion

- Additional governed statistical operations with explicit assumptions, diagnostics, and evidence.
- More capable local models and adapters without changing typed-plan or non-fabrication contracts.
- Cross-workspace semantic-package import with explicit compatibility mapping and no data sharing.
- Privacy-preserving aggregate collaboration with minimum-group and differential privacy policies.
- Guided causal-analysis templates subject to a separate methodological and approval specification.

Future work must preserve deterministic numeric execution, governed semantics, permission-scoped evidence, explicit insufficiency, provider neutrality, and the rule that DataBreeze never fabricates an answer.
