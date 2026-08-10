# DataBreeze Data Quality Guard — Product Specification

**Status:** Product specification<br>
**Delivery position:** Post-V1 specialist extension; not part of the Data-to-Dashboard Agent V1 release gate.<br>
**Version:** 1.0<br>
**Requirement prefix:** DQG<br>
**Dependencies:** Platform identity and workspace services; artifact, dataset, evidence, version, typed-job, approval, audit, notification, and sync services; `IAE` Inbox, Artifacts, and Evidence foundation; `DSM` Datasets, Schemas, Rules, and Mappings foundation; `JRA` Jobs, Recipes, and Approvals foundation; `DSO` Devices, Synchronization, and Offline Operation foundation; Python processing engine; PostgreSQL; S3-compatible object storage; Redis Streams; registered Desktop devices

## 1. Purpose and outcome

Data Quality Guard continuously evaluates governed files and datasets against reusable deterministic quality, reconciliation, and drift rules. It turns failed checks into owned incidents, provides traceable evidence, proposes safe repairs, verifies remediation, and reports whether data is fit for an explicitly defined use.

The module produces four durable outcomes:

- a versioned data-quality contract describing expectations and ownership;
- reproducible monitoring runs bound to exact dataset and rule versions;
- module incident projections that group immutable diagnostic details without replacing canonical `JRA` actionable findings; and
- repair or waiver decisions with before/after verification and a complete audit trail.

Deterministic rules are primary. Statistical methods may identify drift, and provider-neutral AI may explain a result or suggest a rule or repair, but neither may silently change pass/fail status, modify source data, close an incident, or approve a repair.

## 2. Users and jobs-to-be-done

| User | Jobs-to-be-done |
|---|---|
| Data owner | Define what “fit for use” means, assign accountability, use the `JRA` facade for material-waiver approval, and see quality trends. |
| Data steward | Author reusable rules/reference data through `DSM`, triage actionable work through `JRA`, resolve root causes, and maintain quality-contract bindings. |
| Analyst | Validate a dataset before analysis, understand failures at row/cell level, and compare current quality with a baseline. |
| Operator | Run approved checks, investigate assigned incidents, apply approved repairs to derived copies, and verify outcomes. |
| Approver | Review consequential repair, waiver, and reconciliation `JRA` approval requests. |
| Workspace admin | Configure schedules, limits, narrowing data-mode/retention constraints under `DSO`/`IAE`, devices, roles, severity policy, and notifications. |
| Auditor or viewer | Inspect contracts, results, ownership, remediation, waivers, and evidence without editing them. |

Primary user jobs are:

1. “Tell me whether this dataset meets the rules required for this business process.”
2. “Alert the right owner when a previously healthy dataset becomes incomplete, invalid, late, or inconsistent.”
3. “Reconcile record counts and control totals between related datasets and explain every variance.”
4. “Show exact evidence, not just a quality score.”
5. “Help repair the problem safely, then prove the repaired version passes the same rules.”

## 3. Scope and explicit non-goals

### In scope

- Governed artifact and dataset versions from files, Operations Capture records, other DataBreeze modules, and user-authorized standards-based database extracts.
- Versioned quality-contract bindings to immutable `DSM` dataset, schema, semantic-definition, rule-set, and reference-dataset versions, plus module-owned ownership, criticality, freshness, fitness, incident, and waiver policy.
- Deterministic schema, type, completeness, uniqueness, validity, format, range, set-membership, reference, cross-field, temporal, and referential checks.
- Exact count, sum, balance, and grouped reconciliation with defined precision, currency, rounding, and tolerances.
- Distribution, volume, category, schema, and freshness drift detection against versioned baselines.
- Manual, scheduled, event-triggered, and pre-release monitor runs.
- Immutable quality diagnostic details and module incident projections, with assignment, disposition, comments, service targets, acknowledgements, and escalation projected from canonical `JRA` findings/review tasks.
- Repair proposals that generate a preview or derived dataset version, followed by approval and verification.
- Time-bounded waivers with scope, reason, owner, expiry, and residual-risk disclosure.
- Local, Hybrid, and Cloud execution according to dataset location and policy.

### Explicit non-goals

- Replacing source-system governance, master-data management, or an enterprise observability platform.
- Hidden access to private sites or restricted vendor systems.
- Unapproved continuous access to databases or folders.
- Arbitrary SQL, shell, Python, JavaScript, macros, or executable rule logic.
- Modifying immutable originals or performing silent in-place repairs.
- Using an opaque model score as the sole basis for a consequential quality finding.
- Automatically closing an incident because an AI-generated explanation sounds plausible.
- Claiming a dataset is universally “good”; fitness is always evaluated against a named contract and version.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Bind published `DSM` datasets, schemas, semantic definitions, rules, and reference datasets into quality contracts; submit reusable definition drafts through `DSM`; define baselines, monitors, schedules, ownership, fitness, severity, and escalation policies; review runs and trends; use authorized `JRA` finding/review/approval facades; manage repair proposals, waivers, and cloud execution; expose audit and reports. |
| Desktop | Bind explicitly selected local files/folders or approved extracts; execute large or sensitive checks and repairs locally; maintain offline schedules; inspect detailed row/cell evidence; create derived repaired files; synchronize only policy-approved results. |
| Android | Receive incident and freshness alerts; view quality status and compact evidence; use authorized `JRA` facades to acknowledge, assign, comment, approve/reject repairs or waivers, and confirm operational resolution. Android does not author complex rule graphs or process large datasets. |

The control plane owns durable quality-contract bindings, monitors, immutable diagnostic details, feature-specific incident projections, repair/waiver subject state, and audit references. `DSM` is the canonical publisher for governed datasets, schemas, semantic definitions, mappings, rule definitions, and rule sets. `JRA` owns Jobs, the canonical actionable `Finding` and `ReviewTask` envelopes, and all `ApprovalPolicy`, `ApprovalRequest`, and `ApprovalDecision` records. Data Quality Guard stores exact immutable `DSM` references plus `jraJobId`, `resultManifestId`, `sharedFindingId`, `jraReviewTaskId`, or `jraApprovalRequestId` bindings and read-only business projections, then evaluates bound definitions through the Python engine in cloud workers and the Desktop sidecar. Redis Streams carries typed dispatch; PostgreSQL persistence follows those ownership boundaries.

## 5. Primary workflows

### 5.1 Define a quality contract

1. A steward selects a `DSM` `Dataset` and binds exact immutable `DatasetVersion` records or a governed version selector.
2. The steward selects published `DSM` schema and semantic-definition versions, then configures module-owned criticality, expected cadence, owner, and intended business uses.
3. Existing `DSM` rules and rule sets are selected; a new reusable rule remains a draft submitted to the canonical `DSM` publication workflow.
4. DataBreeze validates bound version existence, rule types, field compatibility, reference-dataset versions, cost bounds, and dependency order before activating the quality contract.
5. An authorized user publishes an immutable contract version.

### 5.2 Establish a baseline and monitor

1. A steward selects one or more approved historical runs or dataset versions as a baseline.
2. DataBreeze calculates versioned structural and distribution summaries and records whether statistics are exact or sampled.
3. A monitor binds contract version, source selector, schedule/trigger, execution location, late-arrival policy, and escalation policy.
4. Before activation, a dry-run estimates runtime, result volume, and expected findings.
5. The monitor runs on schedule, source-arrival event, or explicit request.

### 5.3 Detect and own an incident

1. A run evaluates deterministic rules, reconciliation, and configured drift tests.
2. Each failed rule result creates an immutable `QualityFindingDetail` with a stable fingerprint and source evidence; when actionable, the module creates or links the canonical `JRA` `Finding` and stores `sharedFindingId`.
3. Incident policy groups diagnostic-detail and shared-finding references by dataset, rule, partition, root key, or time window in a module projection without copying workflow authority.
4. `JRA` owns severity, workflow state, assignment, acknowledgement/resolution targets, disposition, review tasks, and immutable history; the incident view projects that state.
5. Web and Android notify only authorized recipients with policy-filtered evidence.

### 5.4 Propose, approve, and verify a repair

1. A steward selects immutable diagnostic details or their linked `JRA` findings and chooses an allowlisted repair template or accepts an AI-assisted suggestion into a draft.
2. DataBreeze generates a deterministic repair plan and preview showing affected records, before/after values, side effects, unresolved findings, and reconciliation impact.
3. The module facade creates a `JRA` `ApprovalRequest` bound to the requested action and exact repair-plan subject type, ID, version, and hash, stores `jraApprovalRequestId`, and proceeds only after a valid `JRA` `ApprovalDecision`.
4. The engine applies the plan to a derived artifact/dataset version, never the original.
5. Verification reruns the contract and links results to the repair. The module may request closure through the `JRA` facade only when resolution policy is satisfied; `JRA` owns the transition.

### 5.5 Waive and review residual risk

1. If a known exception cannot be repaired immediately, an authorized owner proposes a bounded waiver.
2. The waiver identifies rule, dataset/partition, reason, compensating control, requested action, exact subject type/ID/version/hash, expiry, and its `jraApprovalRequestId`; `JRA` owns approver eligibility and decision.
3. Waived findings remain visible and quality reports separate passed, failed, and waived results.
4. Expiry requests `JRA` to reopen or escalate affected actionable findings unless replaced by a waiver backed by a valid `JRA` decision or a verified repair.

## 6. Functional requirements

Priorities are `P0` (required for first production release), `P1` (required for complete module operation), and `P2` (planned enhancement).

| ID | Priority | Requirement |
|---|---|---|
| DQG-001 | P0 | The system shall create a quality-dataset binding to an existing `DSM` `Dataset` and exact immutable `DatasetVersion` records, then record module-specific criticality, intended use, cadence, locale, `dataModeConstraint`, `effectiveDataModePolicyRef`, `retentionConstraint`, and `effectiveRetentionPolicyRef` without registering a parallel dataset identity or broadening workspace policy. |
| DQG-002 | P0 | A quality contract shall bind immutable `DSM` dataset, schema, semantic-definition, key, rule-set, and reference-dataset versions plus module-owned ownership, fitness, incident, and waiver policy. |
| DQG-003 | P0 | Published quality-contract binding versions shall be immutable; edits shall create a draft with a named parent and machine-readable diff, while referenced rule-suite publication and versioning remain canonical in `DSM`. |
| DQG-004 | P0 | Quality contracts shall select schema, type, requiredness, completeness, uniqueness, format, range, allowed-set, reference, cross-field, and referential rules from the canonical `DSM` rule catalog. |
| DQG-005 | P0 | Every bound `DSM` `RuleDefinitionVersion` or `RuleSetVersion` shall expose the scope, severity, typed parameters, null behavior, evidence fields, cost class, version, and stable failure reason code required by the quality engine. |
| DQG-006 | P0 | Quality-contract activation shall reject arbitrary code, unknown functions, type mismatches, cycles, missing or incompatible `DSM` references, ambiguous locale/rounding, and resource-unbounded definitions without republishing the referenced rules. |
| DQG-007 | P0 | The system shall support exact count, distinct-count, sum, signed-balance, and grouped control-total reconciliation between named dataset versions. |
| DQG-008 | P0 | Reconciliation definitions shall state join/group keys, units or currencies, decimal precision, rounding mode, tolerance, missing-key behavior, and severity. |
| DQG-009 | P0 | The system shall support volume, schema, category-frequency, numeric-distribution, null-rate, and freshness drift against a versioned baseline. |
| DQG-010 | P0 | Every drift rule shall record metric, baseline population/window, minimum sample, comparison method, threshold, direction, and multiple-comparison policy where applicable. |
| DQG-011 | P0 | A monitor shall bind an immutable contract version, source selector, execution location, trigger/schedule, late-arrival policy, and escalation policy. |
| DQG-012 | P0 | Monitors shall support manual, cron-like scheduled, governed dataset-version arrival, and pre-release invocation without unrestricted event subscriptions. |
| DQG-013 | P0 | A run shall bind exact dataset, contract, rule, reference, baseline, engine, and parsing versions plus `jraJobId` and a pinned `resultManifestId` before its result is accepted. |
| DQG-014 | P0 | Deterministic rule results shall be `PASS`, `FAIL`, `NOT_EVALUATED`, or `ERROR`; statistical drift results shall additionally expose statistic, threshold, sample size, and significance. |
| DQG-015 | P0 | Every failed or errored result shall expose stable reason codes, affected counts, denominators, and evidence or an explicit reason evidence could not be produced. |
| DQG-016 | P0 | Every record-level `QualityFindingDetail` shall be immutable and retain page/sheet/cell/row/column or dataset-row evidence, the exact observed value subject to masking policy, its stable fingerprint, and `sharedFindingId` when linked to actionable work. |
| DQG-017 | P0 | Repeated failures with the same diagnostic fingerprint shall retain immutable occurrence detail and shall link to the same canonical `JRA` `Finding` envelope when policy considers them one actionable issue rather than creating duplicate workflow records. |
| DQG-018 | P0 | Incident projections shall group immutable diagnostic-detail and `sharedFindingId` references without copying or overriding their `JRA` workflow state, assignment, disposition, evidence references, or history. |
| DQG-019 | P0 | The canonical `JRA` `Finding` and `ReviewTask` envelopes shall own severity, status, owner, acknowledgement and resolution targets, comments, timeline, disposition, and escalation state; module incident views shall be permission-filtered projections only. |
| DQG-020 | P0 | Every module finding or incident transition facade shall delegate to `JRA`, enforce its permission and reason requirements, and return the canonical revision without persisting an independent transition or decision. |
| DQG-021 | P0 | A repair proposal shall use allowlisted typed transformations and bind exact diagnostic-detail IDs, linked `sharedFindingId` values, source dataset version, contract version, expected outcome, and plan hash. |
| DQG-022 | P0 | Repair preview shall show exact affected count, bounded before/after examples, rule impacts, control-total changes, collisions, and unrepairable findings. |
| DQG-023 | P0 | Applying a repair shall create a derived artifact/dataset version and shall never mutate an original source artifact or dataset version. |
| DQG-024 | P0 | A consequential repair shall create or reuse one `JRA` `ApprovalRequest` bound to the requested action, exact repair-plan subject type/ID/version/hash, and source fingerprint; the module shall store only `jraApprovalRequestId` plus those subject bindings, and any change shall invalidate the request through `JRA`. |
| DQG-025 | P0 | A verification run shall evaluate the same or explicitly superseding contract version and link before/after results to the repair. |
| DQG-026 | P0 | A module incident projection shall not close solely because a repair job completed; verified results shall be required before requesting an authorized canonical `JRA` transition. |
| DQG-027 | P0 | Waivers shall require scope, reason, risk owner, compensating control, start, expiry, affected rule/dataset versions, requested action, exact subject type/ID/version/hash, and `jraApprovalRequestId`; approver eligibility and decision shall remain owned by `JRA`. |
| DQG-028 | P0 | Waived failures shall remain visible and excluded from pass-rate numerators unless a report explicitly presents a separate policy-compliant metric. |
| DQG-029 | P0 | Monitor and incident notifications shall use canonical `JRA` finding/review state and honor permissions, severity, quiet hours, escalation paths, and deduplication windows. |
| DQG-030 | P1 | Users shall compare runs by rule result, affected rate, distribution, finding set, incident impact, contract diff, and dataset version. |
| DQG-031 | P1 | `DSM` rule templates may be reused across compatible semantic field types; a quality-contract binding shall pin the immutable template or rule version and expose only declared module-local parameter overrides. |
| DQG-032 | P1 | Data owners shall publish a fit-for-use scorecard showing critical-rule status, freshness, reconciliation, open incidents, waivers, and trend without hiding raw results. |
| DQG-033 | P1 | Desktop and cloud execution of the same deterministic fixture shall produce equivalent rule states, reason codes, counts, and exact reconciliation totals. |
| DQG-034 | P1 | The system shall support backfill evaluation of a published contract over a bounded set of historical dataset versions without altering their original monitoring history. |
| DQG-035 | P1 | Users shall export a signed quality report and machine-readable result manifest with checksums and evidence references. |
| DQG-036 | P2 | The system may suggest new rules from recurring data patterns, but every suggestion shall remain an unpublished draft until a steward reviews parameters and estimated impact and publishes it through `DSM`. |

## 7. Data model extensions

All entities include `id`, `workspace_id`, timestamps, actor attribution where applicable, and optimistic-concurrency versions.

| Entity | Purpose and key fields |
|---|---|
| `QualityDatasetBinding` | Module binding to a `DSM` `Dataset` and exact immutable `DatasetVersion` records, with criticality, intended uses, cadence, locale, `dataModeConstraint`, `effectiveDataModePolicyRef`, `retentionConstraint`, `effectiveRetentionPolicyRef`, and active contract. |
| `QualityContract` / `QualityContractVersion` | Contract identity and immutable binding versions containing exact `DSM` schema, semantic-definition, key, rule-set, and reference-dataset version IDs plus fitness and incident policies and checksum. |
| `QualitySemanticProjection` | Read-only projection of bound `DSM` schema/semantic versions with display and evidence-policy fields needed by this module. |
| `QualityRuleBinding` | Exact `DSM` `RuleDefinitionVersion` plus allowed parameter/severity/scope overrides, compatibility state, and engine implementation reference. |
| `QualityRuleSetBinding` | Exact `DSM` `RuleSetVersion`, dependency projection, default ownership, activation state, and canonical hash. |
| `QualityReferenceBinding` | Immutable binding to a `DSM` `DatasetVersion` used as an allowlist, lookup, hierarchy, or relationship source. |
| `QualityBaseline` | Versioned source runs/datasets, window, exact or sampled summaries, sampling method, checksum, and optional `QualityApprovalBinding`. |
| `QualityMonitor` | Contract version, source selector, schedule/trigger, device or cloud route, late policy, limits, state, next/last run. |
| `QualityRun` | Pinned inputs and versions, `jraJobId`, pinned `resultManifestId`, effective execution policy/location, business-state projection, counters, timing, and failure summary; no independent dispatch/retry/terminal Job state. |
| `RuleEvaluation` | Per-rule state, numerator/denominator, metric/statistic, threshold, severity, evidence index, and runtime. |
| `QualityFindingDetail` | Immutable module/`DSM` diagnostic detail with stable fingerprint, bound rule/dataset versions, row/field scope, observed/expected values, evidence, occurrence identity, and optional `sharedFindingId`; it contains no actionable workflow state. |
| `QualityIncidentProjection` | Permission-filtered grouping of diagnostic-detail IDs and canonical `JRA` finding/review references with computed root-cause context; `JRA` remains authoritative for status, assignment, disposition, and history. |
| `IncidentPolicy` | Grouping, severity mapping, acknowledgement/resolution targets, deduplication, escalation, and closure criteria. |
| `RepairProposal` / `RepairPlanVersion` | Diagnostic-detail and `sharedFindingId` references, source version, typed changes, preview, plan hash, expected outcomes, and feature-specific plan state. |
| `RepairApplication` | Derived `DSM` dataset/`IAE` artifact version references, execution, before/after links, affected counts, verification run, and audit. |
| `QualityApprovalBinding` | Requested action, exact subject type/ID/version/hash, `jraApprovalRequestId`, projected canonical status, and last verified `JRA` revision; no actor or decision payload. |
| `QualityWaiver` | Bounded exception scope, reason, risk owner, compensating control, start/expiry, feature-specific state, and `QualityApprovalBinding`; it stores no decision payload. |
| `FitnessAssessment` | Contract/version-specific decision by intended use, critical results, open incidents, waivers, and computed display status. |

Data Quality Guard never publishes its own dataset, schema, semantic, mapping, or reusable rule definition. Its mutable drafts describe bindings and module policies; reusable definition drafts become executable only after `DSM` publishes an immutable version. It owns immutable `QualityFindingDetail` records and approval subject bindings, while `JRA` owns actionable findings, reviews, requests, decisions, assignment, disposition, and workflow history.

High-volume row findings are stored in encrypted partitioned objects with query indexes and aggregate counters in PostgreSQL. Local-mode raw findings remain on Desktop; the cloud stores fingerprints, policy-approved aggregates, incident state, and optional masked evidence excerpts.

## 8. Processing, evidence, and confidence rules

### Deterministic evaluation

- Rule results are functions of immutable dataset versions, parsing configuration, contract and rule versions, reference versions, baseline, engine version, and declared parameters.
- The engine uses explicit Unicode normalization, locale, time zone, decimal precision, collation, null semantics, and rounding. Defaults are recorded in the run manifest.
- Exact reconciliation, critical record counts, and critical-rule denominators never use sampling.
- Rules execute in a validated dependency graph. A dependency failure produces `NOT_EVALUATED` with the upstream reason rather than a misleading pass.
- Partition retries are idempotent and merge results by stable rule/partition keys.
- A quality summary cannot be `PASS` if any unwaived critical rule failed, errored, or was not evaluated, unless the published fitness policy explicitly defines a stricter non-pass state.

### Drift and confidence

- Drift is a deterministic decision over a declared statistical method and threshold, not an unconstrained model opinion.
- Baseline and current sample sizes, statistic, effect size, threshold, and exact/sampled status are retained.
- Default minimums are 1,000 non-null observations for distribution drift and 30 expected schedule intervals for seasonality-aware comparisons; insufficient data returns `NOT_EVALUATED`.
- Default alerts require both a configured practical effect threshold and statistical significance of `p <= 0.01` when a hypothesis test is used. Workspace policy may strengthen these requirements.
- Multiple related tests use the rule’s declared correction method; no correction is silently assumed.
- AI may suggest explanations, incident summaries, candidate root causes, rules, or repair templates through a provider-neutral adapter. Suggestions are labeled, evidence-linked where possible, and never alter deterministic results.

### Evidence

- File evidence links artifact/version and page, sheet, cell, row, column, JSON Pointer, or stable record key as applicable.
- Aggregate rules store the contributing dataset version, filter/group definition, exact numerator/denominator or control totals, and bounded representative examples.
- Reconciliation evidence includes unmatched key sets, side-specific totals, variance, tolerance, precision, and rounding.
- Drift evidence includes baseline/current histograms or sketches, exact/sampled status, missing-data handling, and method version.
- Masked evidence retains a one-way fingerprint so repeated occurrences can be correlated without revealing the value.
- A repair stores field-level before/after evidence and the rule result changes it caused.

## 9. Permissions, privacy, and data modes

Module permissions are:

- `quality.dataset.binding.manage`
- `quality.contract.edit`
- `quality.contract.publish`
- `quality.monitor.manage`
- `quality.run.execute`
- `quality.finding-detail.read`
- `quality.finding.facade.manage`
- `quality.repair.propose`
- `quality.repair.approval.facade`
- `quality.waiver.approval.facade`
- `quality.report.export`
- `quality.audit.read`

`DSM` rule authorship, quality-contract publication, and the `JRA` approval facades for repairs and waivers are separable. `JRA` enforces approver eligibility, separation of duties, MFA, expiry, and invalidation; the module cannot create a parallel approval decision. Evidence access is field-policy aware; an assignee may see a masked identifier and aggregate context without seeing unrelated sensitive columns.

Data-mode behavior:

- **Local:** Source files, rows, raw findings, evidence values, repair previews, and derived repaired datasets stay on Desktop. Only content-safe definitions and `CONTROL_METADATA` synchronize automatically; value-bearing findings, incident detail, summaries, or repaired data require a separately confirmed `APPROVED_DERIVED_RESULT` under `DSO`.
- **Hybrid (default):** Originals may remain local. Structured rule results, masked findings, selected evidence, incident state, and approved reports synchronize according to dataset and field policy.
- **Cloud:** Authorized artifacts, datasets, findings, evidence, and derived versions may be stored and processed inside the workspace cloud boundary.

The workspace `DSO` policy is the maximum authority. A quality binding's `dataModeConstraint` and `effectiveDataModePolicyRef` may only narrow placement, processing, or synchronization. Every monitor occurrence, job, repair, and transfer resolves the policy intersection at execution time; changing a constraint cannot retroactively upload local evidence.

`IAE` is canonical for retention and deletion of artifacts, evidence, finding bundles, and derived bytes. Quality resources store only `retentionConstraint` and `effectiveRetentionPolicyRef`, which may narrow or extend but never shorten the workspace minimum. Deletion eligibility intersects workspace minimum, resource constraint, evidence/report lineage, legal hold, audit class, and recovery window; feature code requests deletion through `IAE`, and local cache cleanup is not authoritative retention. Notifications exclude raw values by default. Audit and metric logs never store unrestricted row content.

## 10. Offline, sync, failure, and recovery

- Desktop caches published quality-contract bindings, their immutable `DSM` rule-set and reference-dataset versions, baselines, schedules, and policy needed for assigned local monitors.
- Offline scheduled runs use stable schedule-occurrence keys. On reconnection, missed occurrences follow the monitor’s explicit `SKIP`, `RUN_LATEST`, or bounded `BACKFILL` policy.
- Local results append to a durable outbox and synchronize idempotently. Incident grouping in cloud references stable diagnostic fingerprints and `sharedFindingId` values so retries do not duplicate canonical `JRA` findings.
- Offline comments, acknowledgements, assignments, and closure requests may queue only when the cached `IAM` authorization snapshot permits and must re-authorize as `JRA` facade commands on sync; the module stores no competing transition result.
- The local app may retain non-authoritative repair/waiver approval notes or a draft reason, but sync never creates an `ApprovalDecision`; an eligible actor must reopen the exact current subject online, freshly confirm approve/reject, and satisfy current MFA.
- Quality-contract binding drafts may branch offline; referenced `DSM` definitions are read-only, and published binding versions never merge automatically.
- If the source version is incomplete, still changing, or has a checksum mismatch, the run stops or waits according to source-readiness policy and never evaluates an unbound replacement silently.
- Rule execution checkpoints by rule and data partition. A worker/device restart resumes incomplete partitions without losing acknowledged results.
- A rule timeout or resource violation returns `ERROR` for that rule with a stable reason; it cannot be reported as a data failure or pass.
- A partial run remains non-final and cannot produce a fit-for-use pass. Successful rule results remain inspectable and are reused only when input and all dependency versions match.
- Notification failure retries independently of run and incident durability.
- Repair application is staged, checksum verified, and published atomically as a derived version. Failure leaves the original and last good derived version intact.
- Expired waivers are processed from durable server time. An offline Desktop displays cached expiry and treats uncertain waiver state as non-passing until synchronized.

## 11. APIs, events, and extension points

### REST resources

- `/v1/workspaces/{workspaceId}/quality-dataset-bindings`
- `/v1/quality-dataset-bindings/{bindingId}/contracts`
- `/v1/quality-rule-bindings`
- `/v1/quality-rule-set-bindings`
- `/v1/quality-reference-bindings`
- `/v1/quality-baselines`
- `/v1/quality-monitors`
- `/v1/quality-runs`
- `/v1/quality-runs/{runId}/evaluations`
- `/v1/quality-finding-details`
- `/v1/quality-finding-facades`
- `/v1/quality-repair-proposals`
- `/v1/quality-waivers`
- `/v1/fitness-assessments`

Mutation endpoints require idempotency keys and resource versions. Result and evidence APIs use cursor pagination, bounded projections, and permission-aware masking. Large result exports use short-lived scoped object grants.

These module routes manage quality bindings, immutable diagnostic details, projections, and policies only. Canonical dataset, schema, semantic, mapping, rule, and rule-set drafts and publication use the `DSM` APIs. Finding/review transitions and approval actions are authorized facades over the same canonical `JRA` records and return their IDs and revisions.

### Typed jobs

- `PROFILE_QUALITY_SOURCE`
- `VALIDATE_QUALITY_CONTRACT`
- `BUILD_QUALITY_BASELINE`
- `RUN_QUALITY_MONITOR`
- `EVALUATE_QUALITY_RULE_PARTITION`
- `RECONCILE_QUALITY_DATASETS`
- `GENERATE_REPAIR_PREVIEW`
- `APPLY_APPROVED_REPAIR`
- `VERIFY_QUALITY_REPAIR`
- `GENERATE_QUALITY_REPORT`

Jobs declare immutable input IDs, checksums, rule and engine versions, effective `DSO` policy, resource bounds, idempotency key, and result schema. `JRA` alone owns dispatch, progress, cancellation, retry, and terminal Job state. Each `QualityRun` stores `jraJobId` and the accepted pinned `resultManifestId`; its business state updates idempotently from committed `JRA` outbox/results. Mapping is explicit: JRA `QUEUED`/`RUNNING` project to quality `SCHEDULED`/`EVALUATING`, `SUCCEEDED` plus accepted manifest projects to `EVALUATED`, and `FAILED`/`CANCELLED` project to corresponding execution failure/cancellation; fitness policy may keep an evaluated run `INCOMPLETE`, `BLOCKED`, or `NEEDS_REVIEW`. Jobs contain declarative rule references, never arbitrary executable code or unrestricted queries.

### Domain events

- `quality.contract.published`
- `quality.monitor.activated`
- `quality.run.started`
- `quality.run.completed`
- `quality.run.failed`
- `quality.rule.failed`
- `quality.drift.detected`
- `quality.incident.opened`
- `quality.incident.escalated`
- `quality.repair.approval_binding.created`
- `quality.repair.verified`
- `quality.incident.closed`
- `quality.waiver.expiring`
- `quality.waiver.expired`

Events are versioned and delivered at least once. They contain identifiers and redacted summaries; recipients fetch authorized detail from APIs and deduplicate by event ID.

### Extension points

- Dataset readers implement versioned artifact/dataset-to-columnar-batch contracts with bounded resource behavior.
- Deterministic rule-function implementations register against `DSM` `RuleDefinitionVersion` contracts and declare typed inputs, exact semantics, supported engines, version, cost class, evidence shape, and test fixtures.
- Drift methods declare baseline requirements, statistic, effect threshold, sample behavior, and calibration tests.
- Incident grouping and severity policies operate on typed result metadata, not arbitrary code.
- Repair templates declare typed before/after transformations, applicability checks, preview, inverse limitations, and verification rules.
- Notification and report adapters receive permission-filtered structured data.

New extensions require local/cloud parity tests where both executors are supported. An extension that cannot provide evidence, bounds, and deterministic versioning cannot produce a consequential finding.

## 12. Performance and capacity budgets

Defaults may be adjusted by workspace policy and capacity, and every run records effective limits.

| Budget | Default target |
|---|---|
| Governed datasets | 1,000 per workspace and 500 active monitors per workspace. |
| Contract complexity | 1,000 rules, 500 semantic fields, 100 reference sets, and 50 dependencies per contract version. |
| DQG high-capacity cloud profile | Up to 10 million rows or 20 GB per asynchronous run with module admission, isolated worker resources, and entitlement; larger workloads require a contracted partitioned capacity profile. |
| DQG high-capacity Desktop profile | Up to 50 million rows or 50 GB per asynchronous run on published reference hardware with preflighted memory/disk and sufficient free space. |
| First result | Schema and critical freshness results within 30 seconds after a ready source is acquired at p95. |
| Rule throughput | At least 250,000 simple scalar validations per second per standard worker core on columnar inputs, excluding I/O and complex joins. |
| Standard monitor latency | Complete 100 deterministic scalar rules over 5 million rows within 10 minutes on reference four-core processing capacity, excluding source transfer. |
| Incident creation | Critical failed results produce a durable incident within 30 seconds after the rule result is committed at p95. |
| Query latency | Scorecard and incident list load in under 2 seconds at p95 for 10 million indexed findings and two years of aggregate history. |
| Schedule accuracy | Connected Cloud monitors dispatch within 60 seconds of due time at p95; Desktop monitors within 120 seconds while the device service is running. |
| Progress freshness | Connected clients receive progress within 5 seconds of durable state at p95. |
| Retention constraint | Request 90 days for detailed diagnostic bundles and 25 months for run aggregates; `IAE` computes the effective policy with lineage, legal hold, audit class, and recovery requirements. |
| Control-plane availability | 99.9% monthly for contract, monitor, incident, approval, and result-summary APIs, excluding declared maintenance. |

Critical counts and reconciliation remain exact regardless of size. Sampling is permitted only for explicitly statistical drift summaries and preview examples, with method and sample size disclosed.

## 13. Observability and product success metrics

### Operational observability

- Structured logs include correlation ID, workspace, governed dataset, contract, monitor, run, rule, partition, engine version, duration, state, and reason code. Values and evidence are excluded by default.
- OpenTelemetry traces span schedule/event intake, source readiness, dispatch, dataset read, rule execution, result reduction, incident grouping, notifications, repair, verification, and sync.
- Metrics include monitor dispatch delay, run duration, rows/bytes, rule latency and error rate, not-evaluated rate, finding volume, incident age, acknowledgement/resolution time, waiver count/expiry, repair success, sync lag, and device availability.
- Alerts cover missed critical monitors, stale sources, repeated rule-engine errors, unexpected finding-volume spikes, stuck incident escalation, expiring critical waivers, failed repair publication, and local/cloud parity deviations.
- Rule-cost telemetry compares actual scanned rows, memory, and duration with declared cost class without recording values.

### Product success metrics

- At least 99% of critical monitors with ready sources complete within their configured evaluation window.
- Median time to acknowledge critical incidents is below the owner policy target; target compliance is reported per workspace rather than hidden in a global average.
- At least 95% of open findings have an assigned incident owner or an explicit unassigned escalation.
- At least 90% of repair applications receive a linked verification result before incident closure.
- Fewer than 2% of auto-grouped findings are manually split because the grouping hid separate operational causes.
- 100% of passing reconciliation results contain exact totals, tolerance, precision, and input-version evidence.
- Repeated execution against pinned inputs produces identical deterministic outcomes in 100% of integrity checks.

Quality scores are not optimized in isolation; success reporting always includes failed, errored, not-evaluated, and waived critical rules to prevent misleading improvement.

## 14. Acceptance and testing criteria

A release is acceptable when all P0 requirements pass and the following tests are automated or documented:

1. A Vietnamese dataset fixture validates Unicode text, locale-specific dates and decimals, null variants, duplicate keys, invalid references, and cross-field rules without source mutation.
2. Identical pinned inputs produce identical deterministic states, counts, reason codes, finding fingerprints, and exact reconciliation totals on rerun.
3. Desktop and cloud golden fixtures produce equivalent deterministic results and evidence coordinates.
4. A dependency rule failure marks downstream rules `NOT_EVALUATED`, not `PASS`.
5. Exact reconciliation identifies missing keys, duplicate join keys, signed total differences, rounding boundaries, and a one-unit-outside-tolerance failure.
6. Distribution drift exposes baseline/current populations, sample sizes, effect, statistic, threshold, and correction method; insufficient data returns `NOT_EVALUATED`.
7. Repeated monitor runs update occurrence history without duplicating the same open finding or incident.
8. An incident cannot close from repair-job completion alone; only a valid verification result plus authorized closure satisfies policy.
9. Repair preview matches the derived output, retains field-level before/after evidence, and leaves original bytes and dataset version unchanged.
10. A changed source after repair approval invalidates the plan and blocks application.
11. Waived findings remain visible, excluded from ordinary pass numerators, and reopen/escalate on expiry.
12. Missed offline schedules follow `SKIP`, `RUN_LATEST`, and bounded `BACKFILL` policies without duplicate occurrences.
13. A rule timeout or engine crash is reported as `ERROR`, survives retry, and cannot result in a fit-for-use pass.
14. Local mode executes, stores detailed evidence, creates incidents, and repairs a derived copy without sending raw rows or values to cloud.
15. Permission and tenant-isolation tests cover contract publication, raw evidence, incident transitions, repair approval, waiver approval, report export, and object grants.
16. Property and fuzz tests cover typed rule validation, null semantics, decimal arithmetic, Unicode, stable fingerprints, partition reduction, and idempotency.
17. Web, Desktop, and Android critical scorecard, incident, evidence, and approval paths meet WCAG 2.2 AA or native accessibility equivalents.

## 15. Delivery slices and future expansion

### Slice 1 — Contracts and deterministic validation

Bindings to governed `DSM` datasets, schema/semantic definitions, and immutable rule sets; module-owned quality contracts and policies; manual runs, row evidence, Desktop/cloud execution, result comparison, and audit.

### Slice 2 — Monitoring and incidents

Baselines, schedules and arrival triggers, freshness and drift, exact reconciliation, incident grouping and ownership, service targets, Web/Android notifications, escalation, offline schedule behavior, and scorecards.

### Slice 3 — Repair, waiver, and reporting

Typed repair templates, preview, approval, derived versions, verification, waiver lifecycle, signed quality reports, backfills, aggregate trends, and module pre-release gates.

### Future expansion

- Additional deterministic rule and drift-method libraries with published calibration fixtures.
- Sanitized quality-contract binding templates shared between compatible workspaces, with referenced `DSM` definitions promoted separately and explicit ownership transfer.
- Privacy-preserving cross-dataset reconciliation using workspace-controlled tokenization.
- Root-cause suggestion and rule recommendation improvements through optional provider-neutral AI.
- Standards-based database readers and event sources that require explicit credentials, scopes, and bounded queries.

Future work must retain deterministic primary findings, immutable inputs, exact reconciliation for consequential totals, evidence traceability, explicit approvals, and provider neutrality.
