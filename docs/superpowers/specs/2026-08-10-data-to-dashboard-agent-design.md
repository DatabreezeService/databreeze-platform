# DataBreeze Data-to-Dashboard Agent Design

**Status:** Validated design<br>
**Date:** 2026-08-10<br>
**Canonicalized by:** [Product definition](../../product/product-definition.md), [roadmap](../../product/roadmap.md), and [Data-to-Dashboard Agent specification](../../specs/features/data-to-dashboard-agent.md)

## 1. Product decision

DataBreeze is a Vietnamese-first, local-first and cloud-capable data-to-dashboard agent. It helps a user bring in business data, understand and improve its quality, create an interactive dashboard on an editable canvas, and ask an analyst questions whose calculations remain reproducible and traceable.

The first product version is one capability delivered through three complementary surfaces:

- Web is the cloud workspace for upload, ETL review, analysis, dashboard authoring, publication, sharing, and administration.
- Windows Desktop is the trusted local and Hybrid data agent for approved folders, large or sensitive files, local ETL/analysis, and policy-controlled synchronization.
- Android is initially a cloud-connected capture and consumption companion for receipt/document scanning, OCR review, dashboard viewing, and analyst questions.

The previously specified specialist modules remain possible post-V1 extensions. They are not parallel first-release commitments.

## 2. User outcome

A successful journey is:

1. The user supplies a CSV/XLSX file, registers an approved Desktop folder, or scans a receipt on Android.
2. DataBreeze preserves the original and creates an immutable intake version.
3. The system profiles the data and proposes a typed transformation plan.
4. The user reviews transformations, affected/rejected rows, quality dimensions, assumptions, and evidence.
5. An accepted run creates a new governed dataset version; it never rewrites the original.
6. The agent proposes metrics, filters, visualizations, and a dashboard page.
7. The user edits the canvas and publishes a versioned interactive dashboard.
8. When trusted data changes, only affected materialized results recompute and a complete new dashboard snapshot becomes visible.
9. The analyst answers questions and proposes canvas changes through typed plans; deterministic processors calculate every displayed value.

## 3. V1 intake boundaries

V1 supports:

- Web upload of CSV and supported XLSX worksheets.
- Desktop monitoring of user-approved folders containing supported CSV/XLSX files.
- Android camera/document capture for receipt-like records with cloud OCR and field-level review.
- Immutable raw artifacts, governed cleaned dataset versions, and versioned materialized dashboard results.

Database connections, cloud-drive connectors, arbitrary APIs, streaming event sources, unrestricted multi-dataset joins, and general document understanding are post-V1 extensions.

## 4. ETL and data quality

ETL is a governed review workflow rather than an invisible preprocessing step. A transformation plan is composed only of registered typed steps. The review shows source and inferred schemas, before/after samples, changed and rejected counts, exclusions, warnings, and lineage. Acceptance creates a new dataset version; editing or rerunning creates another version.

DataBreeze does not claim a percentage of factual correctness without ground truth. It reports independently defined dimensions:

- completeness;
- validity against declared types and deterministic rules;
- uniqueness against declared keys;
- consistency across declared relationships or reconciliation rules;
- freshness against a declared expectation; and
- extraction confidence for OCR/classification candidates.

An optional quality summary must disclose its formula, weights, coverage, sampling, and limitations. AI suggestions never count as validation evidence.

## 5. Dashboard canvas and analyst

A dashboard owns immutable versions containing pages, responsive layouts, widgets, filters, dataset/metric bindings, query-plan bindings, freshness policy, and publication configuration. V1 widgets are KPI, table, bar, line/area, pie/donut, and text/evidence note. Unsupported field/grain combinations are rejected before execution.

The agent may propose a dashboard plan, visualization choice, filter, explanation, or canvas mutation. It may not publish, replace a certified metric, expand dataset permissions, or execute generated SQL/code. Every proposal displays its selected metric, dimensions, filters, date range, assumptions, and estimated processing cost before acceptance.

Interactive pages support bounded filters, date ranges, sorting, highlighting, drill-down, and parameter changes over authorized materialized data. A novel or expensive question runs as a typed on-demand analysis and is cached by tenant scope, dataset version, semantic version, plan hash, permission projection, and parameter values.

## 6. Freshness and cost model

The default dashboard mode is `ON_CHANGE`, not continuous polling. After an accepted dataset version is committed:

1. a versioned event identifies the changed dataset;
2. the dependency index selects affected materializations;
3. changes inside a debounce window coalesce;
4. workers recompute only affected widgets when safe, or perform a bounded full recomputation;
5. all required results are verified against the same input/version set;
6. a complete immutable dashboard snapshot publishes atomically; and
7. connected clients receive a content-safe notification and fetch authorized changed results.

The prior good snapshot remains visible when ETL, quality gates, or materialization fails. The interface shows source version, generated time, freshness, blocked/stale reason, and whether the result is complete, sampled, or truncated.

V1 freshness modes are `ON_CHANGE`, `MANUAL`, and `SCHEDULED`. Genuine second-by-second `STREAMING` is explicitly deferred. The target for ordinary on-change dashboards is a new snapshot within 60 seconds after a small accepted dataset update under the reference workload, excluding a user-held review or approval.

Cost controls include incremental processing, dependency-aware recomputation, materialized results, shared cache entries within one authorized permission projection, debounce, concurrency limits, per-workspace compute budgets, idle suspension, retention/eviction policy, and visible usage.

## 7. Platform and data-mode behavior

Hybrid is the default workspace mode.

- Web processes cloud-resident originals or governed synchronized derivatives. It never browses a Desktop folder or receives Local-only bytes.
- Desktop holds actual folder paths locally, fingerprints supported files, proposes dataset grouping, detects schema drift/overlap/duplicates, executes local work, and synchronizes only policy-authorized projections or results.
- Android V1 capture is available for Hybrid/Cloud destinations. It stages captures securely, resumes uploads through the durable queue, preserves originals, and routes uncertain OCR candidates to review. Strict-Local mobile workflows remain governed by the existing Android/DSO requirements and are not claimed complete by the cloud-capture slice.

For each Desktop dataset binding, the user chooses a publication projection: metadata only, dashboard-specific aggregates, selected governed columns/rows, or authorized original upload. The UI previews fields, classifications, estimated bytes, destination, evidence availability, and consequences. A projection can narrow but never broaden Workspace policy.

## 8. Folder intelligence

Desktop access is explicit and bounded. A folder binding stores an opaque cloud identity while the canonical path remains local. Its versioned manifest declares purpose, accepted file types, schema fingerprints, dataset grouping, append/replace/version policy, date/period rules, duplicate keys, saved mappings, debounce/stability behavior, and publication projection.

Known compatible files may process automatically. Schema drift, overlapping periods, ambiguous grouping, changed mappings, suspected duplicates, unstable files, and unsupported content enter review or quarantine. The agent never treats arbitrary folder contents or file text as instructions.

## 9. Receipt capture

The initial receipt profile includes merchant, transaction date/time, currency, subtotal, tax, total, optional payment method/reference, and optional line items. OCR candidates retain field/token confidence, model version, and evidence coordinates. Deterministic checks reconcile subtotal, tax, and total and detect probable duplicate captures. Low-confidence or conflicting values require review before they enter a governed dataset version.

The product specification remains provider-neutral. AWS Singapore is the first hosting target, while the initial receipt-extraction and optional AI implementation uses the OpenAI Responses API under ADR-0005. Only server-side adapters call OpenAI. Receipt images and bounded governed context cross that external-provider boundary only when workspace egress policy permits it. Strict structured responses remain candidates: deterministic reconciliation, duplicate checks, permissions, evidence validation, and human review decide acceptance.

## 10. Security and failure behavior

- Every resource and cache entry carries full TenantScope and current permission projection.
- Sharing a dashboard never grants underlying raw-data or evidence access.
- Source values, filenames, comments, and OCR text are untrusted data and never interpreted as agent instructions.
- AI receives only policy-approved bounded context and cannot produce authoritative numeric values.
- Material changes invalidate approval/certification bindings.
- A partial refresh never replaces the last complete dashboard snapshot.
- Replays, duplicate file events, upload retries, and duplicate refresh events are idempotent.
- Provider failure leaves deterministic ETL, saved dashboards, and previously published snapshots usable.

## 11. Delivery and validation

The complete V1 direction is delivered sequentially:

1. **Cloud dashboard foundation:** Web CSV/XLSX intake, governed ETL review, typed analyst, editable canvas, publication, and on-change snapshots.
2. **Hybrid Desktop:** approved-folder catalog, local ETL/analysis, publication projection, sync, and cloud refresh.
3. **Cloud-connected Android capture:** receipt scanning, resumable upload, OCR review, governed record creation, and dashboard/analyst consumption.

Delivery is task-gated rather than time-gated. The complete program implements contracts, cloud intake/ETL, analyst/canvas, materialization/refresh, Desktop folders, Android/OpenAI receipt extraction, integration/parity, and production readiness. Its golden journey is: messy sales data becomes a reviewed dashboard; a new approved folder file refreshes affected widgets; and a reviewed mobile receipt updates an expense view. No deadline or successful fixture demonstration waives production security, retention, tenant-isolation, recovery, accessibility, performance, provider, signing, or parity evidence.

## 12. Deferred specialist extensions

Quote Intelligence, Spreadsheet Auditor, Invoice Leak Detector, Embedded Importer, Client Report Factory, Migration Ready, Folder Autopilot, Data Quality Guard, Private Data Analyst as a standalone specialist module, and Operations Capture as a full field-operations suite remain designed extensions. The V1 product reuses foundation contracts and implements only the bounded dashboard-related capabilities stated here.
