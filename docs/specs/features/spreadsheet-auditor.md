# DataBreeze Spreadsheet Auditor

> **Status:** Product specification<br>
> **Delivery position:** Post-V1 specialist extension; not part of the Data-to-Dashboard Agent V1 release gate.<br>
> **Version:** 1.0<br>
> **Requirement prefix:** `SA`<br>
> **Dependencies:** Identity and RBAC; workspaces and projects; Inbox and immutable artifacts; artifact versions; `IAE` Inbox, Artifacts, and Evidence foundation; `DSM` Datasets, Schemas, Rules, and Mappings foundation; `JRA` Jobs, Recipes, and Approvals foundation; `DSO` Devices, Synchronization, and Offline Operation foundation; evidence store; typed jobs and device routing; findings and assignments; approvals; audit history; notifications; report/export service; Python processing engine; object storage

## 1. Purpose and outcome

Spreadsheet Auditor finds formula, structure, and data-quality risks in user-controlled workbooks and proposes safe, previewable repairs. It is designed for operational and financial spreadsheets where a wrong reference, overwritten formula, hidden dependency, inconsistent type, or duplicate row can cause a consequential decision.

Every audit produces an immutable audit run containing workbook and sheet inventory, rule findings, formula-family analysis, evidence at workbook/sheet/cell/range level, severity and confidence, and an optional repair plan. DataBreeze never silently edits an original workbook. An accepted repair is applied only to a new artifact version or exported copy after an authorized user reviews a cell-level diff.

## 2. Users and jobs-to-be-done

| User | Job to be done |
|---|---|
| Spreadsheet owner | Check a workbook before distribution, reporting, import, or period close. |
| Analyst | Find broken formulas, inconsistent regions, data-quality issues, and high-risk manual constants efficiently. |
| Reviewer/approver | Inspect evidence and repair previews, accept or reject proposed changes, and preserve a defensible audit trail. |
| Team lead | Define audit profiles, severity policy, tolerated patterns, ownership, and recurring checks. |
| Workspace admin | Configure narrowing processing/retention constraints under `DSO`/`IAE`, file access, repair permissions, and resource limits. |
| Auditor/viewer | Read a signed-off audit report and reconstruct each finding without changing the workbook. |

## 3. Scope and explicit non-goals

### In scope

- XLSX, XLSM, and CSV intake; XLS/XLSB may be supported through an explicit conversion copy when a compatible converter is available.
- Workbook inventory, structure checks, formula parsing, formula-family comparison, dependency analysis, external-link inventory, and data-quality rules.
- Findings for broken references, formula inconsistencies, suspicious constants, stale ranges, hidden content, validation gaps, duplicate/blank/key issues, type drift, and configurable reconciliation rules.
- Evidence-linked suppression, assignment, comments, sign-off, and reports.
- Repair proposals with before/after values or formulas, impact scope, validation results, and downloadable copy.
- Local offline audits and folder-triggered recurring audits for explicitly approved paths.

### Explicit non-goals

- Executing VBA, macros, add-ins, Power Query, external data refreshes, or arbitrary workbook code.
- Guaranteeing calculation parity with every spreadsheet application.
- Editing a workbook through unrestricted desktop control.
- Silently changing source files, accepting repairs based only on AI output, or deleting macros.
- Replacing spreadsheet authoring, enterprise data governance, or accounting controls.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Configure audit profiles and recurring schedules; run cloud audits for cloud artifacts; triage findings; assign work; review repair plans; approve exports; view trends and audit reports. |
| Windows Desktop | Audit local and large workbooks; watch approved folders; inspect workbook structure and formulas without executing macros; open evidence at sheet/cell; build repaired copies; work offline. |
| Android | Receive alerts; view high-priority findings and compact evidence; comment, assign, approve, or reject a repair plan. It does not edit formulas, configure complex rules, or render entire workbooks. |

## 5. Primary workflows

### 5.1 Run an audit

1. A user selects a workbook artifact and an immutable audit-profile version.
2. DataBreeze hashes the source, inventories workbook features, and routes an `AUDIT_WORKBOOK` job according to data mode and device capability.
3. The processor parses supported workbook parts without executing embedded code or refreshing external data.
4. Deterministic implementations registered for bound `DSM` rules produce immutable `SpreadsheetFindingDetail` records, evidence, affected-cell sets, and rule explanations.
5. Diagnostic details are grouped by root-cause candidate and formula family; actionable groups create or link canonical `JRA` `Finding` envelopes using `sharedFindingId`.
6. The user triages, assigns, suppresses, or requests review/sign-off through authorized `JRA` facades; the module does not persist competing workflow decisions.

### 5.2 Propose and review repairs

1. A permitted user requests proposals for selected repairable findings.
2. Rules generate candidate patches against the audited artifact hash.
3. DataBreeze creates a repair plan with per-cell before/after values or formulas, affected dependencies, unsupported-feature warnings, and predicted finding changes.
4. Validation runs on an isolated working copy; the original remains untouched.
5. A reviewer accepts individual patches or the whole plan and submits it for approval when policy requires.
6. Application creates a new workbook artifact version or a separately named export and records its relationship to the source.

### 5.3 Handle a changed source

If the source hash differs before repair application, the plan becomes stale. The system refuses to apply it, re-audits the new version, and may rebase deterministic proposals only when every precondition still matches.

### 5.4 Recurring audit

Desktop watches only admin- or user-approved folders. A stable file creates a new artifact version and audit job. Identical hashes are deduplicated; changed results are compared to the prior successful audit.

## 6. Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| SA-001 | P0 | The system shall create each audit against an immutable `IAE` artifact version and recorded content hash and shall bind its asynchronous execution to `jraJobId` and a pinned `resultManifestId`. |
| SA-002 | P0 | The system shall inspect supported workbooks without executing macros, add-ins, queries, external links, or embedded scripts. |
| SA-003 | P0 | The audit shall inventory sheets, visibility, dimensions, tables, named ranges, formulas, validations, merged cells, links, macros, and calculation settings. |
| SA-004 | P0 | The parser shall preserve formula text, cached value when present, style identity, cell type, and sheet/cell evidence. |
| SA-005 | P0 | The engine shall detect parse errors, broken references, incompatible ranges, and unsupported formulas without inventing calculated values. |
| SA-006 | P0 | The engine shall group structurally equivalent formulas into formula families using relative-reference normalization. |
| SA-007 | P0 | The engine shall identify formula-family outliers, formula-to-constant overwrites, gaps, and inconsistent range boundaries. |
| SA-008 | P0 | Audit profiles shall bind immutable `DSM` `RuleDefinitionVersion` records, compatible registered `AuditRuleVersion` engine/plugin implementations, severities, parameters, scope selectors, and suppression policy. |
| SA-009 | P0 | Every `SpreadsheetFindingDetail` shall be immutable and include the bound `DSM` rule version, diagnostic severity/classification, evidence, affected scope, deterministic reproduction data, stable fingerprint, and `sharedFindingId` when actionable. |
| SA-010 | P0 | The system shall distinguish confirmed rule violations, heuristic warnings, unsupported checks, and informational observations. |
| SA-011 | P0 | Users shall be able to assign, comment on, resolve, reopen, or suppress actionable findings through an authorized facade over the canonical `JRA` `Finding` or `ReviewTask`, subject to permission and revision checks. |
| SA-012 | P0 | A suppression shall require scope, reason, actor, creation time, and optional expiry; broad suppressions require elevated permission. |
| SA-013 | P0 | Repair proposals shall state exact preconditions and exact cell or workbook-part changes. |
| SA-014 | P0 | Repairs shall be previewed as a before/after diff and validated on an isolated copy before application. |
| SA-015 | P0 | The system shall never mutate an original artifact or overwrite a user file in place. |
| SA-016 | P0 | Applying a repair shall create a new artifact version or separately named export with source lineage. |
| SA-017 | P0 | A repair plan shall be rejected as stale when its source hash or required preconditions differ. |
| SA-018 | P0 | Diagnostic details, `JRA` finding/review facades, and repair actions shall enforce tenant, project, artifact, and capability permissions. |
| SA-019 | P0 | Audit sign-off or repair approval shall use a canonical `JRA` `ApprovalRequest` whose exact subject type, ID, version, hash, and requested action bind the audit or repair plan; the module shall store only `jraApprovalRequestId` and that subject binding, and shall not persist an independent actor decision. |
| SA-020 | P0 | Reports shall disclose skipped sheets, unsupported features, truncated analysis, and calculation limitations. |
| SA-021 | P1 | The engine shall support configurable data rules for uniqueness, nulls, type, format, range, membership, pattern, and cross-column conditions. |
| SA-022 | P1 | The engine shall support deterministic reconciliation rules across cells, ranges, sheets, and imported reference datasets. |
| SA-023 | P1 | Users shall be able to compare immutable diagnostic-detail changes between two audit runs of the same logical workbook. |
| SA-024 | P1 | Desktop shall navigate to a finding in a safe read-only workbook view or launch the user's spreadsheet application at best-effort sheet/cell location. |
| SA-025 | P1 | Approved folders shall support debounced recurring audits with hash deduplication and per-folder policy. |
| SA-026 | P1 | The system shall export HTML, PDF, JSON, and XLSX finding reports with evidence identifiers. |
| SA-027 | P1 | Repair plans shall support selective acceptance and shall recompute plan validity after each selection change. |
| SA-028 | P2 | An AI adapter may cluster or explain findings and suggest human-readable rule descriptions, but it shall not create or apply an executable repair without deterministic validation. |

## 7. Data model extensions

| Entity | Key fields and invariants |
|---|---|
| `WorkbookAudit` | Workspace/project, source `IAE` artifact version/hash, profile/engine versions, `jraJobId`, pinned `resultManifestId`, `dataModeConstraint`, `effectiveDataModePolicyRef`, `retentionConstraint`, `effectiveRetentionPolicyRef`, business-state projection, inventory summary, completeness, and sign-off binding. |
| `WorkbookInventory` | Sheet metadata, used ranges, feature flags, formula counts, external links, macro presence, calculation mode, and unsupported features. |
| `AuditProfileVersion` | Immutable bindings to `DSM` rule definitions and compatible audit implementations, parameters, scope selectors, severity mapping, budget, and creator. |
| `AuditRuleVersion` | Deterministic engine/plugin implementation registered for compatible `DSM` `RuleDefinitionVersion` contracts, with implementation version, input schema, repair capability, resource bounds, fixtures, and compatibility constraints; it is not a canonical rule definition. |
| `FormulaFamily` | Sheet/range, normalized formula pattern, member cells, boundary model, and outliers. |
| `SpreadsheetFindingDetail` | Immutable module diagnostic detail with bound `DSM` rule, category, diagnostic severity/confidence, evidence, affected cells/ranges, reproduction payload, stable fingerprint, root-cause group, and optional `sharedFindingId`; it contains no workflow status or assignment. |
| `FindingSuppressionBinding` | Diagnostic/finding scope, reason, expiry, policy version, and canonical `JRA` disposition/reference; actor and disposition history remain in `JRA`. |
| `RepairPlan` | Source hash, selected diagnostic-detail and `sharedFindingId` references, ordered patches, preconditions, validation summary, feature-specific status, and creator. |
| `RepairPatch` | Target workbook part/cell, operation, before fingerprint/value, after value/formula/style delta, rationale, and dependencies. |
| `SpreadsheetApprovalBinding` | Requested action, exact subject type/ID/version/hash, `jraApprovalRequestId`, projected canonical status, and last verified `JRA` revision; no decision actor or payload. |
| `RepairArtifactResult` | New artifact version/export, repair plan, output hash, residual diagnostic details, and validation report. |
| `WorkbookSeries` | Logical workbook identity used to compare versions and recurring runs without conflating different files with the same name. |

## 8. Processing, evidence, and confidence rules

- Deterministic parsing and validation are authoritative. Cached formula values are evidence of the last saved workbook state, not proof that a formula recalculates correctly.
- Evidence identifies artifact version, workbook part, sheet stable identifier and name, cell or range, formula/value fingerprint, and optional neighboring context. Reports escape formulas to prevent spreadsheet-injection on export.
- Formula families normalize relative and absolute references while preserving function names, operators, ranges, sheet boundaries, and structured references. A family outlier is not automatically an error.
- Default classification is `confirmed` for deterministic invalid structures such as `#REF!` syntax or violated explicit rules, `high-likelihood` for strong structural outliers, `review` for heuristic anomalies, and `unsupported` where the engine cannot evaluate safely.
- Heuristic findings expose a 0-to-1 calibrated confidence. Defaults are `>= 0.90` high-likelihood, `0.70-0.8999` review, and `< 0.70` hidden from default view but retained for diagnostics. Workspaces may raise thresholds, not convert heuristic output into confirmed truth.
- Repairable rules must implement `detect`, `preconditions`, `propose`, `apply_to_copy`, and `validate`. If any phase is unsupported, the finding is report-only.
- Proposed formula fill uses verified formula-family neighbors and exact boundary rules. It is blocked across merged cells, array/spill formulas, tables with conflicting semantics, protected regions, or unsupported formulas.
- Macros and unknown workbook parts are byte-preserved where the library supports safe round-trip. If preservation cannot be proven, repair export is blocked or requires an explicitly disclosed converted copy.
- AI-generated explanations are labeled, provider-neutral, and removable. No AI output may change severity, finding state, formula, data value, or repair patch.

## 9. Permissions, privacy, and data modes

Capabilities are `spreadsheet.read`, `spreadsheet.audit.run`, `spreadsheet.finding.facade.manage`, `spreadsheet.profile.manage`, `spreadsheet.repair.propose`, `spreadsheet.repair.approval.facade`, `spreadsheet.repair.export`, and `spreadsheet.audit.signoff.facade`. Folder access is a separate device capability scoped to resolved paths and may be revoked centrally. `JRA` remains authoritative for finding/review workflow and approval decisions.

| Data mode | Originals and processing | Synchronization |
|---|---|---|
| Local | Workbook bytes and audit execution remain on Desktop. | Only `CONTROL_METADATA` synchronizes automatically. Findings, reports, or repaired exports synchronize only as separately confirmed `APPROVED_DERIVED_RESULT` resources under `DSO`; cell content and evidence remain device-bound. |
| Hybrid (default) | Originals may stay local; findings and selected evidence synchronize based on field-level policy. | Web/Android can review synchronized findings; local-only evidence offers Open on Desktop and is not live-streamed through the cloud. |
| Cloud | Authorized cloud artifacts are processed by workspace workers and stored encrypted. | Findings, evidence, repair copies, and reports are available to authorized clients. |

The workspace `DSO` policy is the maximum authority. Audit `dataModeConstraint` and `effectiveDataModePolicyRef` values may only narrow placement, processing, synchronization, or export; every audit, repair, and transfer resolves the intersection again at execution time.

`IAE` is canonical for retention and deletion of workbook, evidence, report, and repaired-copy bytes. Audit resources store only `retentionConstraint` and `effectiveRetentionPolicyRef`, which may narrow or extend but never shorten the workspace minimum. Deletion eligibility intersects workspace minimum, resource constraint, evidence/report lineage, legal hold, audit class, and recovery window; feature code requests deletion through `IAE`, and local cache cleanup is not authoritative retention.

Workbook values, formulas, file paths, and evidence snippets are sensitive payloads and are excluded from normal logs and event bodies. Download, export, local path grant, suppression, repair, and approval operations are audited. A repair never grants broader access than its source.

## 10. Offline, sync, failure, and recovery

- Desktop persists mirrored canonical Job state, provisional offline execution state, inventory, immutable diagnostic details, repair plans, and an outbox in a local database; checkpoints are keyed by source hash, engine version, and profile version.
- Offline audits and repair previews are allowed when the profile and engine are available locally. Sign-off cannot complete offline; synchronization may create the canonical request but never its decision.
- If a workbook changes while being read, processing stops with `SOURCE_CHANGED`, waits for the file to stabilize, and starts a new artifact version rather than combining reads.
- Password-encrypted, corrupt, or unsupported workbooks fail with an actionable state and retain no misleading partial success. A partial report is allowed only when every skipped scope is enumerated.
- Processor restart resumes from a compatible inventory/rule checkpoint. Re-running cannot duplicate findings because finding identities derive from audit, rule, and evidence fingerprints.
- Finding dispositions may queue offline only when the cached `IAM` authorization snapshot permits and must re-authorize through the `JRA` facade on sync. The local app may retain non-authoritative approval notes or a draft reason, but synchronization never creates an `ApprovalDecision`: an eligible actor must reopen the exact current subject online, freshly confirm approve/reject, and satisfy current MFA before `JRA` records the decision. Repair-selection conflicts and source-hash changes are never last-write-wins.
- If a repair export fails, temporary output is removed or quarantined, the original remains untouched, and retry begins from the immutable plan.
- Revoking a device prevents new signed jobs and sync; cached workspace data follows the configured lock and purge policy.

## 11. APIs, events, and extension points

Representative REST resources are:

- `POST /v1/spreadsheet-audits`, `GET /v1/spreadsheet-audits/{id}`;
- `POST /v1/spreadsheet-audits/{id}/runs`;
- `GET /v1/spreadsheet-audits/{id}/finding-details/{detailId}` and `GET/PATCH /v1/spreadsheet-audits/{id}/finding-facades/{sharedFindingId}`;
- `POST /v1/spreadsheet-audits/{id}/suppressions`;
- `POST /v1/spreadsheet-audits/{id}/repair-plans`;
- `POST /v1/repair-plans/{id}/validate`, `/submit`, `/approve`, and `/exports`;
- `POST /v1/audit-profiles` and `/v1/audit-profiles/{id}/versions`.

Typed jobs are `AUDIT_WORKBOOK`, `VALIDATE_REPAIR_PLAN`, `APPLY_WORKBOOK_REPAIR_COPY`, and `GENERATE_SPREADSHEET_AUDIT_REPORT`. A job names an artifact or approved local-file capability and effective `DSO` policy; it cannot carry a script or unrestricted file-system command. `JRA` alone owns dispatch, progress, cancellation, retry, and terminal Job state. Each `WorkbookAudit` or repair execution stores `jraJobId` and the accepted pinned `resultManifestId`; business state updates idempotently from committed `JRA` outbox/results. Mapping is explicit: JRA `QUEUED`/`RUNNING` project to audit `PENDING`/`AUDITING`, `SUCCEEDED` plus accepted manifest projects to `RESULT_READY`, and `FAILED`/`CANCELLED` project to corresponding execution failure/cancellation; completeness checks may keep a successful execution `PARTIAL` or `NEEDS_REVIEW`.

Finding-facade transitions and `/approve` or sign-off operations call `JRA` and return the canonical finding/review or approval-request ID and revision. Module storage retains only immutable diagnostics and exact subject bindings containing requested action, subject type/ID/version/hash, and `jraApprovalRequestId`.

Events include `spreadsheet.audit.started`, `spreadsheet.audit.completed`, `spreadsheet.audit.partial`, `spreadsheet.finding_detail.created`, `spreadsheet.repair.proposed`, `spreadsheet.repair.stale`, `spreadsheet.repair.approval_binding.updated`, and `spreadsheet.repair.exported`. Assignment and approval-decision events remain canonical in `JRA`.

Extension points include versioned audit-rule implementations registered for `DSM` rule definitions, safe workbook parsers, report renderers, and reference-dataset resolvers. Rule implementations run in bounded processing workers, declare required workbook features, return typed evidence and immutable diagnostic details, and cannot write source files or bypass permission checks.

## 12. Performance and capacity budgets

Defaults may be changed within workspace plan and device limits.

| Budget | Default target |
|---|---|
| Workbook size | 250 MB, 200 sheets, 5 million populated cells, and 1 million formula cells per audit |
| Job acknowledgement | Durable job record in <= 500 ms at p95 |
| Initial inventory | 50 MB workbook in <= 30 seconds at p95 on a standard desktop/worker |
| Audit | 100 MB or 500,000-formula supported workbook in <= 5 minutes at p95, excluding queue time |
| Finding list | First 100 findings in <= 2 seconds at p95 after audit completion |
| Evidence navigation | Cached sheet/cell evidence in <= 1.5 seconds at p95 |
| Repair preview | 10,000 cell patches validated in <= 90 seconds at p95, subject to formula complexity |
| Memory | Streaming analysis targets <= 3x compressed workbook size plus 1 GB; jobs exceeding the device budget fail safely or require a larger worker |

Limits are checked before and during processing. A budget stop yields a clearly partial audit with completed scopes and omitted scopes; it never presents the result as complete.

## 13. Observability and product success metrics

Traces correlate request, artifact hash, audit, rule batches, repair validation, and export. Technical metrics include queue time, parse duration, cells/formulas per second, rule duration, memory high-water mark, finding counts by rule and severity, unsupported-feature rate, partial-audit rate, retries, stale plans, export failures, and desktop crash recovery. Payload values and formulas are not emitted to telemetry.

Product success is measured by:

- time from file selection to review-ready audit;
- percentage of findings with one-click resolvable evidence;
- confirmed-finding precision from reviewer dispositions;
- reduction in repeat findings across workbook versions;
- percentage of accepted repairs that pass post-repair validation;
- rate of users exporting a repaired copy rather than editing the original; and
- zero incidents of original-file mutation.

## 14. Acceptance and testing criteria

- Golden workbooks cover Vietnamese/English labels, formulas, tables, named ranges, hidden/very-hidden sheets, merged cells, data validation, external links, cached errors, macros, dynamic arrays, and unsupported features.
- Parser tests prove macros are not executed and originals remain byte-identical after audit.
- Formula-family property tests cover relative/absolute/mixed references, cross-sheet references, structured references, gaps, and boundary changes.
- Each P0 rule has positive, negative, boundary, and false-positive regression fixtures with exact evidence.
- Repair tests verify preconditions, deterministic patch content, isolated-copy application, source-hash staleness, post-repair re-audit, and rollback on failure.
- Round-trip tests block repairs when unknown parts or signatures cannot be preserved safely.
- Cloud and Desktop generate equivalent finding identities and severities for the same source, engine, and profile versions.
- Security tests cover cross-tenant artifact IDs, unauthorized cell evidence, folder-scope escape, tampered signed jobs, self-approval, and formula injection in exports.
- Offline tests cover restart, stable-file detection, deduplication, outbox replay, conflict handling, and revoked devices.
- An end-to-end test audits a workbook with formula outliers and data-quality violations, suppresses one finding, proposes a repair, detects a stale source, re-audits, approves a valid plan, exports a new version, and proves the original hash is unchanged.

## 15. Delivery slices and future expansion

### Slice 1: Read-only audit

XLSX/CSV intake, workbook inventory, core broken-reference and formula-family rules, basic data-quality checks, evidence, web/desktop triage, reports, and immutable audit history.

### Slice 2: Safe repair workflow

Versioned profiles, suppression governance, repair proposal/preview/validation, new-version export, approvals, Android review, recurring approved-folder audits, and run comparison.

### Slice 3: Scale and ecosystem

Large-workbook streaming, additional deterministic reconciliation rules, rule SDK, richer trend dashboards, signed report packages, and optional safe conversion adapters.

Future expansion may include organization-specific rule packs, spreadsheet lineage across governed datasets, and assisted test-case generation. It must preserve read-only originals, explicit folder permissions, deterministic consequential findings, and the ban on macro execution or arbitrary PC control.
