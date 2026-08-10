# DataBreeze Client Report Factory

> **Status:** Product specification<br>
> **Delivery position:** Post-V1 specialist extension; DDA V1 implements only its bounded interactive-dashboard publication contract.<br>
> **Version:** 1.0<br>
> **Requirement prefix:** `CRF`<br>
> **Dependencies:** Identity and RBAC; organizations, workspaces, projects, and clients; immutable artifacts and artifact versions; governed datasets and validation; `IAE` Inbox, Artifacts, and Evidence foundation; `DSM` Datasets, Schemas, Rules, and Mappings foundation; `JRA` Jobs, Recipes, and Approvals foundation; `DSO` Devices, Synchronization, and Offline Operation foundation; evidence store; typed jobs and device routing; approvals and comments; audit history; notifications; report/export and object-storage services; Python processing engine

## 1. Purpose and outcome

Client Report Factory creates repeatable, evidence-backed client deliverables from governed datasets and versioned templates. It separates data preparation, metric calculation, narrative drafting, visual layout, review, approval, and publication so that a report can be regenerated consistently and every consequential figure can be traced to source rows, cells, files, transformations, and rule versions.

The outcome is an immutable approved report version with:

- frozen dataset and parameter snapshots;
- deterministic metrics, tables, and charts;
- reviewed narrative and citations;
- reproducible template and renderer versions;
- Office, PDF, and responsive web outputs derived from the same report model;
- comments, approvals, release status, and publication policy; and
- an evidence manifest that allows authorized users to inspect source lineage.

## 2. Users and jobs-to-be-done

| User | Job to be done |
|---|---|
| Analyst | Turn governed client data into recurring reports without manually rebuilding calculations and layouts. |
| Report author | Configure sections, narrative, charts, tables, variables, conditional content, and client-specific language. |
| Client/project manager | Review completeness and presentation, coordinate comments, and approve release. |
| Data steward | Publish canonical dataset, schema, and metric definitions through `DSM`; certify report bindings, quality gates, filters, and allowed evidence exposure. |
| Workspace admin | Manage templates, brands, renderers, narrowing data-mode/retention constraints under `DSO`/`IAE`, sharing, and separation of duties. |
| Client viewer | Read an approved report and permitted evidence without seeing draft or unrelated client data. |

## 3. Scope and explicit non-goals

### In scope

- Client/project-scoped report definitions, schedules, parameter sets, and template versions.
- Governed bindings to immutable `DSM` dataset/schema versions with freshness, quality, and access checks.
- Reusable content blocks for metrics, text, tables, charts, images, evidence notes, and appendices.
- Deterministic calculations and chart/table specifications.
- Provider-neutral AI-assisted narrative drafts constrained by approved facts and requiring review.
- Versioned review, comments, approval, release, controlled sharing, and withdrawal.
- DOCX, PPTX, XLSX, PDF, and responsive web output where supported by the selected template.
- Local, hybrid, and cloud batch generation using the shared report model.

### Explicit non-goals

- A general-purpose desktop publishing or spreadsheet application.
- Live editing of proprietary cloud-office documents through restricted vendor APIs.
- Inventing facts, filling missing data with AI, or treating generated prose as evidence.
- Publishing a draft or exposing client data without explicit permission and release state.
- Scraping client portals or sending reports through private messaging/email systems without a separately authorized integration.
- Replacing business-intelligence exploration, data warehouses, or document-record systems.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Manage clients, bindings to published `DSM` datasets and metric definitions, templates, brands, report definitions, schedules, cloud generation, comments, `JRA` approval facades, publication, share links, release history, and portfolio status. |
| Windows Desktop | Prepare and validate local datasets; preview local evidence; generate large or sensitive report batches offline; render Office/PDF outputs; package approved files; synchronize permitted results. |
| Android | Review a mobile report rendition, inspect permitted evidence, comment, invoke the `JRA` approve/reject facade, receive release alerts, and share an already approved report when policy permits. It does not design templates or edit datasets. |

## 5. Primary workflows

### 5.1 Build and publish a template

1. An author creates a draft template under a workspace or client brand.
2. The template declares supported output formats, required immutable `DSM` dataset/schema and metric versions, parameters, blocks, conditions, styles, and evidence behavior.
3. DataBreeze validates block references, expressions, layout constraints, accessibility metadata, and example fixtures.
4. A preview renders from non-production fixture data.
5. An authorized publisher creates an immutable template version. Existing report runs remain pinned to their original version.

### 5.2 Generate a report

1. An analyst selects a report definition, period/parameters, template version, and exact immutable `DSM` dataset versions.
2. Preflight validates permissions, client scope, schema compatibility, data quality, freshness, evidence availability, and renderer capability.
3. DataBreeze freezes a run manifest and dispatches `GENERATE_CLIENT_REPORT` to cloud or an authorized desktop.
4. Deterministic metrics, tables, and charts are computed before narrative generation.
5. Optional AI drafts use only an approved fact manifest; missing or contradictory facts create module diagnostic detail and a canonical `JRA` `ReviewTask` reference.
6. Renderers create requested outputs and a validation step verifies hashes, links, counts, citations, and format-specific integrity.

### 5.3 Review, approve, and release

1. Reviewers comment on a specific report version and block, with optional evidence anchors.
2. Changes to data, parameters, metrics, template, or content create a new report version and invalidate prior approvals.
3. The owner submits a frozen version; the module facade creates a `JRA` `ApprovalRequest` with requested action and exact subject type, ID, version, and hash, and eligible approvers review output and evidence through that request.
4. A valid `JRA` `ApprovalDecision` allows the module to create its immutable release candidate. Release makes only configured formats and evidence available to the client audience and retains `jraApprovalRequestId` plus the exact subject binding.
5. Withdrawal disables new access while retaining audit and version history.

### 5.4 Run a recurring batch

A schedule creates one run per client/parameter set from explicit template and dataset-version selection rules. Each run is isolated: one client's failure does not expose data to or block another client's successful report. The batch summary lists every success, skip, block, and failure.

## 6. Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| CRF-001 | P0 | Every report definition, template, run, version, output, and release shall be scoped to a workspace and client/project. |
| CRF-002 | P0 | Published template versions shall be immutable and shall declare supported output formats, exact `DSM` dataset/schema contract references, parameters, blocks, and renderer requirements. |
| CRF-003 | P0 | Report definitions shall pin a template version or an explicit version-selection policy and shall never switch a released report implicitly. |
| CRF-004 | P0 | Each report run shall freeze exact `DSM` dataset, metric, and rule versions, parameters, template version, renderer versions, locale, timezone, effective `DSO` policy, `jraJobId`, and pinned `resultManifestId` in a manifest. |
| CRF-005 | P0 | Preflight shall enforce client scope, permissions, schema compatibility, data-quality gates, freshness, required evidence, and output capability. |
| CRF-006 | P0 | A blocked preflight shall enumerate every blocking and warning condition and shall not produce an approvable report. |
| CRF-007 | P0 | Metric values, table records, and chart series shall be generated by deterministic implementations bound to exact immutable `DSM` metric/rule versions. |
| CRF-008 | P0 | Every consequential metric and derived table/chart value shall have evidence lineage to governed dataset fields and source evidence. |
| CRF-009 | P0 | Report blocks shall support stable IDs, conditional inclusion, page/section behavior, localization, accessibility labels, and per-format fallbacks. |
| CRF-010 | P0 | Narrative content shall distinguish authored text, generated draft text, parameter substitution, and deterministic fact insertion. |
| CRF-011 | P0 | AI-generated narrative shall use a bounded approved fact manifest, be provider-neutral, be labeled during review, and require human acceptance before approval. |
| CRF-012 | P0 | AI or free text shall not alter deterministic metrics, datasets, chart series, or evidence references. |
| CRF-013 | P0 | The system shall create report versions rather than mutating a submitted, approved, released, or withdrawn version. |
| CRF-014 | P0 | Comments shall attach to a report version and stable block or evidence anchor and shall preserve resolution history. |
| CRF-015 | P0 | A material change to data, parameters, bound `DSM` metric/rule versions, template, narrative, or output shall change the subject version/hash and shall invalidate the bound `JRA` `ApprovalRequest`; the module shall not carry a prior decision forward. |
| CRF-016 | P0 | Release shall require a valid `JRA` `ApprovalDecision` for the exact requested action and report subject type/ID/version/hash plus an explicit audience, format set, evidence policy, and expiry/retention constraint. |
| CRF-017 | P0 | Generated DOCX, PPTX, XLSX, PDF, and web outputs shall identify report/version, generation time, client, period, and confidentiality classification where configured. |
| CRF-018 | P0 | Format-specific generation failure shall be visible and shall not mark that output ready or silently substitute another format. |
| CRF-019 | P0 | A released report shall never grant access to source datasets or evidence beyond the release policy and viewer permissions. |
| CRF-020 | P0 | Repeated run, `JRA` approval-facade, release, or export requests shall be idempotent and shall not create duplicate requests, versions, or notifications. |
| CRF-021 | P1 | Templates shall support reusable blocks, nested sections, client brand tokens, headers/footers, tables, charts, images, appendices, and references. |
| CRF-022 | P1 | Report authors shall preview with fixture or authorized data and compare visual/content changes between versions. |
| CRF-023 | P1 | Schedules shall support calendar periods, timezone, client sets, parameter derivation, dataset selection rules, and failure policy. |
| CRF-024 | P1 | Batch runs shall isolate client data and expose per-run status, retry, and audit history. |
| CRF-025 | P1 | Users shall be able to clone a definition or template while preserving attribution and creating independent future versions. |
| CRF-026 | P1 | Evidence manifests shall be exportable in a machine-readable format with stable block/value identifiers. |
| CRF-027 | P1 | Released web reports shall support revocable links, expiry, optional authentication, download policy, and view audit subject to privacy policy. |
| CRF-028 | P2 | Provider-neutral AI may draft summaries, explanations, and transitions, but generated material shall remain reviewable and removable without changing deterministic report content. |

## 7. Data model extensions

| Entity | Key fields and invariants |
|---|---|
| `ClientReportDefinition` | Client/project, name, owner, template selection policy, immutable `DSM` dataset bindings, parameters, schedule, `dataModeConstraint`, `effectiveDataModePolicyRef`, `retentionConstraint`, `effectiveRetentionPolicyRef`, `JRA` approval-policy reference, and status. |
| `ReportTemplate` | Stable template identity, owner scope, brand, draft state, and current published version pointer. |
| `ReportTemplateVersion` | Immutable block tree, exact `DSM` dataset/schema contract bindings, parameters, styles, per-format layouts/fallbacks, renderer constraints, fixtures, and publication metadata. |
| `ReportBlockDefinition` | Stable block ID, type, immutable `DSM` dataset/metric bindings, condition, format behavior, localization, accessibility metadata, and evidence display policy. |
| `ReportMetricBinding` | Exact immutable `DSM` `MetricDefinitionVersion`, compatibility state, permitted report dimensions/filters, display policy, and deterministic implementation reference; metric semantics remain canonical in `DSM`. |
| `ReportRun` | Definition, client, period, trigger, `jraJobId`, pinned `resultManifestId`, effective execution policy/location, business-state projection, idempotency key, and active report version; no independent dispatch/retry/terminal Job state. |
| `ReportRunManifest` | Frozen template, `DSM` dataset/metric/rule versions, parameters, engine/renderer, locale/timezone, permission snapshot, and input hashes. |
| `ReportFact` | Stable fact ID, typed value, display value, metric version, dimensions, confidence/completeness state, and evidence set. |
| `ReportContentVersion` | Immutable rendered report model: blocks, facts, accepted narrative, charts/tables, comments snapshot, and content hash. |
| `ReportOutput` | Format, `IAE` artifact version, renderer/version, checksum, page/slide/sheet count where applicable, validation state, `retentionConstraint`, `effectiveRetentionPolicyRef`, and failure details. |
| `ReportApprovalBinding` | Requested action, exact report subject type/ID/version/hash, `jraApprovalRequestId`, projected canonical status, and last verified `JRA` revision; no actor, decision, reason, or independent policy copy. |
| `ReportRelease` | Exact approved report version and `ReportApprovalBinding`, audience, formats, evidence/download policy, `retentionConstraint`, `effectiveRetentionPolicyRef`, release/expiry/withdrawal times, and audit identity. |
| `ReportShareGrant` | Release, principal or token hash, capabilities, expiry, authentication requirement, revocation, and access counters. |
| `ReportSchedule` | Timezone, recurrence, client/parameter rules, dataset selection rule, concurrency, failure policy, and next run. |

Client Report Factory owns templates, report bindings, business run projections, facts, release state, and presentation policy. `DSM` remains the canonical publisher for dataset, schema, semantic, metric, mapping, and rule definitions; the module stores immutable `DSM` IDs and permission-filtered projections only. `JRA` alone owns Jobs, approval requests, and decisions, while the module retains `ReportApprovalBinding`.

## 8. Processing, evidence, and confidence rules

- The report model is the source for all output formats. Format renderers may change layout but not metric values, table row membership, chart series, report identity, or evidence linkage.
- Dataset inputs must be immutable `DSM` versions backed by governed snapshots with schema and content hashes. A live selector is resolved and frozen before generation.
- Metric execution binds an exact `DSM` `MetricDefinitionVersion` to a compatible deterministic implementation and stores exact inputs, filters, grouping, implementation version, units, null handling, rounding, and output hash. Display rounding does not replace the underlying value.
- Evidence for a fact identifies dataset version, field/row keys or aggregates, transformation lineage, and underlying artifact page/sheet/cell/row evidence when available. Aggregate evidence may use a bounded manifest plus reproducible query rather than duplicating every row in the UI.
- Completeness is `complete`, `partial`, or `blocked`. Missing required data cannot be rendered as zero or omitted without a visible template-defined treatment.
- Charts use the same typed fact/table data as displayed values. Axis, unit, time grain, denominator, filters, and truncation are stored and available in the evidence manifest.
- Generated narrative receives only facts explicitly allowed by the block and includes stable fact tokens. A post-generation validator rejects unsupported numbers, unresolved fact tokens, and claims referencing absent facts. Human acceptance is still required.
- Narrative confidence is not a financial confidence score. The UI shows fact completeness and source state separately from whether a draft was AI-assisted.
- External links, images, and fonts are resolved through an allowlisted, versioned asset bundle at generation time. Renderers do not fetch arbitrary remote content.
- Approved outputs are content-addressed and validated against the frozen report model. Regeneration with identical inputs may create a new renderer attempt but must disclose any byte-level difference.

## 9. Permissions, privacy, and data modes

Capabilities are `report.read`, `report.create`, `report.edit`, `report.template.manage`, `report.metric.binding.manage`, `report.generate`, `report.comment`, `report.submit`, `report.approval.facade`, `report.release`, `report.share`, `report.export`, and `report.withdraw`. `DSM` dataset and definition permissions are checked independently; report access does not imply dataset access or definition-authoring authority. `JRA` enforces approver eligibility, separation of duties, MFA, expiry, requested action, and subject-hash invalidation.

| Data mode | Originals and processing | Synchronization |
|---|---|---|
| Local | Source datasets, evidence, generation, and draft outputs remain on an authorized desktop. | Only `CONTROL_METADATA` synchronizes automatically. A report model or output synchronizes only as a separately confirmed `APPROVED_DERIVED_RESULT` under `DSO`; local evidence remains device-bound. |
| Hybrid (default) | Sensitive sources may remain local while governed facts, report model, comments, and approved outputs synchronize by policy. | Web and Android review synchronized content; local-only source evidence offers Open on Desktop and is not live-streamed through cloud. |
| Cloud | Authorized datasets and assets reside in encrypted workspace storage and processing runs on cloud workers. | Web, Android, and controlled share audiences access released content according to client and release permissions. |

The workspace `DSO` policy is the maximum authority. Report `dataModeConstraint` and `effectiveDataModePolicyRef` values may only narrow placement, processing, synchronization, or publication; every run, render, release, and transfer resolves the intersection again at execution time.

`IAE` is canonical for retention and deletion of dataset, evidence, asset, report-output, and package bytes. Report resources store only `retentionConstraint` and `effectiveRetentionPolicyRef`, which may narrow or extend but never shorten the workspace minimum. Deletion eligibility intersects workspace minimum, resource constraint, evidence/report lineage, legal hold, audit class, and recovery window; feature code requests deletion through `IAE`, and local renderer-cache cleanup is not authoritative retention.

Client boundaries apply to datasets, templates, caches, jobs, outputs, share grants, events, and support tools. A global workspace template may be reused but cannot embed one client's data or secrets. Narrative prompts, report values, share tokens, and evidence are excluded from normal telemetry. Downloads, evidence views, comments, approvals, releases, shares, withdrawals, and retention actions are audited.

## 10. Offline, sync, failure, and recovery

- Desktop persists manifests, generation checkpoints, comments queued offline, and an idempotent outbox. Offline generation is permitted when all bound `DSM` dataset/metric versions, template assets, and renderer capabilities are available locally.
- A report generated offline remains a draft or pending approval. Sync may create the canonical `JRA` request for the exact subject but never creates an `ApprovalDecision`; an eligible actor must reopen that current subject online, freshly confirm approve/reject, and satisfy current MFA.
- Jobs requiring a local dataset remain `WAITING_FOR_DEVICE` when the device is offline; sources are not uploaded or rerouted without explicit permission.
- Input changes after manifest freeze create a new run/version. The existing run completes against its frozen inputs or is cancelled; inputs are never mixed.
- Comment conflicts preserve both comments. Content edits use version branches or explicit merge; submitted and approved versions never accept last-write-wins updates.
- Generation checkpoints facts, charts/tables, narrative, report model, each format render, validation, and packaging. A retry reuses only checkpoints with matching manifest and renderer compatibility.
- A single format failure leaves other validated formats available as draft outputs, but release policy decides whether the report can proceed without the failed format.
- Batch retries operate per client run and idempotency key. One client's invalid data cannot appear in another run, log, package, or retry.
- Withdrawing a release revokes share grants and new downloads; previously downloaded files cannot be remotely recalled and the UI states this limitation.
- If approved evidence becomes unavailable under the effective `IAE` retention policy, the report remains readable with a provenance tombstone and explicit evidence-unavailable status.

## 11. APIs, events, and extension points

Representative REST resources are:

- `POST /v1/report-templates`, `POST /v1/report-templates/{id}/versions`, and `/publish`;
- `POST /v1/report-metric-bindings` and `PATCH /v1/report-metric-bindings/{id}`;
- `POST /v1/client-report-definitions`, `GET/PATCH /v1/client-report-definitions/{id}`;
- `POST /v1/client-report-definitions/{id}/runs`;
- `GET /v1/report-runs/{id}`, `/manifest`, `/facts`, `/outputs`, and `/evidence`;
- `POST /v1/report-versions/{id}/comments`, `/submissions`, `/approvals`, and `/releases`;
- `POST /v1/report-releases/{id}/share-grants` and `/withdrawals`;
- `POST /v1/report-schedules` and `/v1/report-batches`.

Typed jobs are `PREFLIGHT_CLIENT_REPORT`, `GENERATE_CLIENT_REPORT`, `RENDER_REPORT_OUTPUT`, `VALIDATE_REPORT_OUTPUT`, and `GENERATE_REPORT_BATCH`. Device jobs name authorized artifact/dataset/template IDs, expected hashes, effective `DSO` policy, output capabilities, and resource budgets; they contain no arbitrary script or file operation. `JRA` alone owns dispatch, progress, cancellation, retry, and terminal Job state. Each `ReportRun` stores `jraJobId` and the accepted pinned `resultManifestId`; its business state updates idempotently from committed `JRA` outbox/results. Mapping is explicit: JRA `QUEUED`/`RUNNING` project to report `PREFLIGHT`/`GENERATING`, `SUCCEEDED` plus accepted manifest projects to `REVIEW_READY`, and `FAILED`/`CANCELLED` project to corresponding generation failure/cancellation; output validation or release policy may keep successful execution `BLOCKED` or `NEEDS_REVIEW`.

Report routes create templates and report-specific bindings only. Canonical dataset, schema, semantic, metric, mapping, and rule authoring and publication use the `DSM` APIs; a report binding records the returned immutable version IDs and hashes. `/approvals` is an authorized `JRA` facade and returns the canonical request ID/revision; module storage retains only requested action, exact subject type/ID/version/hash, and `jraApprovalRequestId`.

Events include `report.run.created`, `report.preflight.blocked`, `report.version.generated`, `report.output.failed`, `report.review_binding.created`, `report.approval_binding.updated`, `report.released`, `report.release.withdrawn`, and `report.batch.completed`. Canonical review-task, approval-request, and decision events remain owned by `JRA`; module event payloads contain scoped identifiers, statuses, and safe counts rather than client data.

Extension points include deterministic metric implementations registered against `DSM` metric/rule definitions, dataset resolvers, block types, chart renderers, Office/PDF/web renderers, brand asset packs, and customer-authorized publication adapters. Extensions declare versions, supported formats, evidence behavior, sandbox/resource needs, and compatibility tests and cannot bypass approval or client isolation.

## 12. Performance and capacity budgets

Defaults are workspace-configurable within plan, worker, and renderer ceilings.

| Budget | Default target |
|---|---|
| Report inputs | 50 dataset bindings, 1 million rows processed per report, 200 blocks, 100 charts/tables, and 500 MB approved assets |
| Batch | 500 client reports per batch with default concurrency of 10 per workspace and 2 per client |
| Job acknowledgement | Durable run in <= 500 ms at p95 |
| Preflight | <= 15 seconds at p95 for indexed datasets and assets |
| Fact generation | 1 million rows and 100 configured metrics in <= 2 minutes at p95 on a standard worker |
| Preview | First web preview in <= 30 seconds at p95 for reports up to 50 blocks after facts exist |
| Render | 100-page PDF/DOCX, 100-slide PPTX, or 20-sheet XLSX in <= 3 minutes per format at p95 |
| Review UI | Initial report outline and first visible block in <= 2 seconds at p95 after generation |
| Release | Approved outputs and grants durably published in <= 10 seconds at p95, excluding file download |
| Reliability | >= 99.5% successful supported single-format renders monthly and zero cross-client output mixing |

The engine checks declared budgets at preflight. Over-limit reports are blocked with split, sampling, or capacity guidance; reports never truncate rows, sections, charts, pages, or clients without a visible template-defined disclosure.

## 13. Observability and product success metrics

Traces correlate schedule/batch, run, manifest, dataset snapshot, metric execution, block build, narrative attempt, renderer, validation, approval, release, and share access. Operational metrics include preflight reasons, data freshness, metric duration, fact count, narrative rejection reasons, renderer duration and memory, output validation failures, batch isolation failures, device wait, approval latency, share denial, and withdrawal propagation. Client content and prompt payloads are excluded from ordinary logs.

Product success is measured by:

- median time to produce a review-ready recurring report;
- percentage of released figures with resolvable evidence;
- report regeneration success with unchanged inputs;
- reduction in manual post-export edits;
- reviewer comment cycles and approval time;
- on-time batch completion by client;
- released output accessibility/validation pass rate;
- template and block reuse across authorized clients; and
- zero cross-client data leakage or draft publication.

## 14. Acceptance and testing criteria

- Golden fixtures cover Vietnamese and English reports, locale-specific dates/numbers, missing data, partial evidence, large tables, charts, images, appendices, client brands, and each supported output format.
- Metric unit and property tests cover filters, grouping, joins, nulls, denominators, timezones, rounding, totals, and stable evidence lineage.
- Template tests cover schema validation, stable block IDs, conditions, recursion limits, per-format fallbacks, fixture previews, accessibility metadata, and immutable publication.
- Narrative tests verify bounded fact manifests, provider-neutral adapters, unsupported-number rejection, missing-fact handling, provider failure fallback, human acceptance, and removability.
- Renderer tests structurally inspect DOCX, PPTX, and XLSX packages; visually compare golden PDF/web pages; verify links, fonts, images, table/chart counts, page/slide/sheet metadata, and accessible labels.
- Cross-format tests prove the same report facts and chart/table data appear in all supported outputs, allowing only declared layout differences.
- Local and cloud generation produce equivalent report models and facts for identical inputs; format bytes may differ only where renderer metadata is declared.
- Security tests cover cross-client dataset bindings, cache keys, batch retries, object paths, share-token hashing, expired/withdrawn access, evidence escalation, and approval bypass.
- Offline tests cover generation restart, queued comments, version conflict, device revocation, format retry, and idempotent sync.
- An end-to-end test freezes governed datasets, generates DOCX/PPTX/XLSX/PDF/web outputs, catches a blocked quality gate, accepts an AI-assisted summary after fact validation, invalidates approval after a material change, approves and releases a new version, then withdraws access without changing the approved record.

## 15. Delivery slices and future expansion

### Slice 1: Governed report runs

Client/report definitions, versioned templates with text/metric/table/chart blocks, bindings to governed `DSM` dataset and metric versions, deterministic facts, web/PDF/DOCX outputs, evidence manifests, web/desktop review, and immutable versions.

### Slice 2: Approval and repeatability

Comments, material-change detection, approvals, releases/share grants, PPTX/XLSX outputs, schedules, batch isolation, Android review, client brands, and portfolio status.

### Slice 3: Extensible report production

Reusable block library, metric/render plugin contracts, advanced per-format layout, large batches, local offline generation, controlled publication adapters, and report-quality analytics.

Future expansion may include additional open output formats, client portals, formally governed narrative libraries, and customer-authorized delivery connectors. It must not rely on restricted office/marketplace APIs, scrape private sites, publish drafts autonomously, or allow generated narrative to override governed facts and evidence.
