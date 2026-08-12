# DataBreeze Product Roadmap

**Status:** Product specification<br>
**Version:** 2.1

This roadmap delivers one unified data workspace in dependency order. It is not a date commitment. Each production slice requires its own approved implementation plan and release evidence.

## 1. Delivery rules

- Keep the complete V1 outcome coherent, but implement it in vertical slices.
- Each slice must produce a user-observable intake-to-result journey.
- No dashboard, agent, capture, or folder workflow bypasses shared identity, tenant scope, artifacts, datasets, jobs, evidence, data mode, retention, approval, usage, or audit contracts.
- AI may propose; deterministic typed execution calculates displayed values.
- A dashboard update publishes only when all required materializations bind the same accepted input/version set.
- Direct connectors and genuine streaming are not first-release blockers.

## 2. Stage 0: Engineering and governed-data foundation

Outcome: independently releasable Web, Desktop, Android, API, and Engine deployables support the shared contracts needed by the first vertical slice.

Includes:

- root toolchains, generated TypeScript/Kotlin/Python contracts, and CI;
- IAM tenant/session/device boundaries and AUD append-only history;
- IAE immutable artifacts, uploads, placements, evidence, retention, and deletion;
- DSM datasets, schemas, mappings, typed transforms, rules, profiles, validation, metrics, and lineage;
- JRA typed jobs, result manifests, reviews, approvals, retry, and cancellation;
- DSO Hybrid-default policy, device grants, encrypted queues, resumable sync, and derived-result publication;
- BUA/NCO/INT foundations required for limits, notifications, and APIs;
- the AWS Singapore portable baseline defined by accepted architecture decisions.

Exit gate:

- contract compatibility across all languages;
- tenant-scope, authorization, upload, job, result-manifest, audit, and data-mode reference tests;
- no customer data, secrets, or runtime artifacts in the repository.

## 3. V1.1: Cloud dashboard foundation

Outcome: a user uploads a messy CSV/XLSX file on Web and publishes a trustworthy interactive dashboard without writing code.

Includes:

- cloud upload and immutable raw artifact;
- source profiling and schema/mapping suggestions;
- typed ETL plan with before/after preview, changed/rejected counts, validation, quality dimensions, and lineage;
- governed dataset and semantic/metric versions;
- Vietnamese/English typed analyst with visible assumptions and evidence;
- agent-proposed dashboard plan;
- editable responsive canvas with KPI, table, bar, line/area, pie/donut, filters, and evidence notes;
- interactive published dashboard snapshots;
- on-change, manual, and scheduled refresh policies;
- dependency-aware materialization, cache isolation, atomic publication, last-good fallback, visible freshness, usage, and cost controls.

Exit gate:

- golden messy-data fixture reaches a published dashboard;
- every numeric value has deterministic provenance;
- an accepted small dataset update refreshes the affected dashboard within 60 seconds under the reference profile;
- a failed/blocked refresh preserves the last complete snapshot;
- tenant, permission, cache, AI-egress, accessibility, and Vietnamese/English tests pass for the slice.

## 4. V1.2: Hybrid Desktop folder agent

Outcome: a user registers an approved Windows folder, processes recurring data locally, and refreshes a cloud dashboard through an explicit Hybrid publication projection.

Includes:

- folder picker and scoped device capability grant;
- local-only canonical path and opaque cloud binding;
- versioned folder manifest for purpose, accepted types, schema fingerprints, grouping, append/replace/version policy, date/overlap rules, duplicate keys, saved mappings, stability, and debounce;
- compatible-file automation and explicit review/quarantine for drift or ambiguity;
- local ETL, quality review, analyst execution, and evidence;
- selected governed-column, dashboard-aggregate, metadata-only, or explicitly authorized original publication modes;
- incremental/idempotent sync, offline queue, conflicts, revocation, and cloud catch-up;
- event-driven dashboard refresh after the synchronized dataset version is accepted.

Exit gate:

- dropping a compatible file updates the intended dataset once despite duplicate filesystem events;
- schema drift, overlapping periods, duplicates, and unstable files do not silently update a dashboard;
- Local/Hybrid network tests prove prohibited bytes never upload;
- the cloud dashboard shows source-device/freshness/evidence availability and recovers after offline operation.

## 5. V1.3: Cloud-connected Android capture

Outcome: a user scans a receipt, invoice, or table, corrects uncertain OCR fields, and updates an authorized cloud dataset/dashboard.

Includes:

- profile-bound CameraX capture for receipt, invoice, and table;
- encrypted account/workspace-scoped staging and resumable WorkManager upload;
- field/cell confidence, evidence coordinates, and explicit review;
- logical-dataset selection before acceptance;
- responsive dashboard viewing with evidence drill-down;
- permitted agent analysis without complex canvas authoring.

Includes:

- native CameraX capture and immutable original preservation;
- secure account/workspace staging and resumable WorkManager upload;
- provider-neutral cloud OCR adapter with field/token confidence and evidence coordinates;
- merchant, date/time, currency, subtotal, tax, total, optional payment reference/method, and optional line-item candidates;
- deterministic arithmetic reconciliation and probable duplicate detection;
- field-level review and versioned corrections;
- governed captured-record publication and affected-dashboard refresh;
- responsive dashboard viewing, freshness/caveats, and focused analyst questions.

Exit gate:

- interrupted upload resumes idempotently and preserves the original;
- low-confidence/conflicting fields cannot silently enter the accepted dataset;
- duplicate capture does not create duplicate expense facts;
- mobile, API, OCR-adapter, tenant, evidence, accessibility, and data-mode tests pass for the slice.

## 6. V1 production readiness

Outcome: the three slices operate as one supportable product.

Includes:

- signing, upgrades, rollback, restoration, data export/deletion, retention, support diagnostics, and incident runbooks;
- quota, billing/usage, materialization cost, cache retention, abuse, and backpressure controls;
- representative performance, security, accessibility, recovery, parity, and disaster-restoration evidence;
- progressive alpha/beta/GA channels with explicit capability claims.

## 7. Rapid mentor prototype gate

A rapid prototype may demonstrate the complete story with constrained breadth:

- one workspace/persona and synthetic data;
- CSV plus a bounded XLSX subset;
- a small typed transformation catalog;
- one dashboard page and the V1 widget catalog;
- one approved Desktop folder with CSV intake;
- one receipt profile and one reviewed OCR adapter path;
- on-change refresh over the reference fixture.

This gate validates the concept. It does not satisfy production security, tenant isolation, retention, recovery, accessibility, parity, provider, or capacity requirements without recorded evidence.

## 8. Post-V1 specialist extensions

After product evidence, the retained specialist specifications may be planned independently:

- Quote Intelligence;
- Spreadsheet Auditor;
- Invoice Leak Detector;
- Embedded Importer;
- Client Report Factory;
- Migration Ready;
- Folder Autopilot;
- Data Quality Guard;
- Private Data Analyst as a standalone governed-analysis product; and
- Operations Capture as a full field-operations suite.

Other potential expansions include authorized database/cloud-drive/accounting connectors, industry templates, iOS, enterprise SSO/SCIM, customer-managed keys, regional storage, dedicated analytical infrastructure, and streaming dashboards after measured demand.

## 9. Explicitly deferred

- Kubernetes before managed-container limits are measured.
- Microservices before the modular monolith creates an operational bottleneck.
- Kafka or a dedicated event platform before PostgreSQL outbox and Redis Streams are insufficient.
- Continuous raw-data queries for every dashboard view.
- Genuine second-by-second streaming without an accepted streaming specification.
- A general-purpose remote PC agent.
- Arbitrary generated code execution.
- Automatic publication, permission expansion, external actions, or payment execution by the analyst.
- A broad connector catalog without stable authorization and customer demand.
