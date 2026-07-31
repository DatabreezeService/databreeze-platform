# DataBreeze Invoice Leak Detector

> **Status:** Product specification<br>
> **Version:** 1.0<br>
> **Requirement prefix:** `ILD`<br>
> **Dependencies:** Identity and RBAC; workspaces and projects; Inbox and immutable artifacts; artifact versions; datasets; `IAE` Inbox, Artifacts, and Evidence foundation; `DSM` Datasets, Schemas, Rules, and Mappings foundation; `JRA` Jobs, Recipes, and Approvals foundation; `DSO` Devices, Synchronization, and Offline Operation foundation; evidence store; typed jobs and device routing; findings, cases, and assignments; approvals; audit history; notifications; report/export service; Python processing engine; object storage

## 1. Purpose and outcome

Invoice Leak Detector matches supplier invoices against contracts, purchase orders, goods or service records, and approved rate cards to identify duplicate billing, price or quantity overcharges, unauthorized fees, tax discrepancies, and other explainable exceptions. It produces a reviewable expected-versus-billed calculation and a dispute evidence package; it does not execute payments, withhold funds, contact suppliers, or modify accounting systems.

The intended outcome is a governed exception case with:

- normalized invoice, supplier, contract, purchase-order, receipt, and rate facts;
- deterministic match and calculation results;
- evidence for every billed and expected value;
- estimated exposure separated from validated recoverable amount;
- reviewer decisions, approvals, and case status; and
- an exportable, redaction-aware evidence package suitable for internal review or user-controlled supplier communication.

## 2. Users and jobs-to-be-done

| User | Job to be done |
|---|---|
| Accounts payable analyst | Screen invoices before or after payment for duplicates, overbilling, and unsupported charges. |
| Procurement/contract owner | Confirm which contract, PO, amendment, rate, or delivery record governs a charge. |
| Finance manager | Prioritize material exceptions, validate exposure, and approve a dispute package. |
| Operations reviewer | Confirm quantities, milestones, service periods, and receipts from source evidence. |
| Workspace admin | Configure matching policy, tolerances, currencies, tax rules, narrowing data-location and retention constraints under `DSO`/`IAE`, and separation of duties. |
| Auditor/viewer | Reconstruct a case from immutable source versions, rules, and reviewer actions. |

## 3. Scope and explicit non-goals

### In scope

- Invoice intake from user-controlled PDF, image, DOCX, XLSX, CSV, Android scan/share, and approved desktop folders.
- Governed contract, amendment, PO, receipt, service-entry, and rate-card libraries.
- Supplier identity resolution, document classification, header and line extraction, versioning, and evidence.
- Exact and scored candidate matching followed by human resolution when ambiguous.
- Duplicate, price, quantity, rate, discount, fee, freight, tax, period, and cumulative-cap checks.
- Exception workflow, assignment, comments, approval, analytics, and dispute evidence packages.

### Explicit non-goals

- Initiating, approving, stopping, reversing, or reconciling a payment.
- Writing to an ERP, accounting package, bank, email account, or supplier portal without a separately authorized product integration.
- Reading private sites, mailboxes, or marketplace accounts through scraping or restricted APIs.
- Giving legal or tax advice or declaring an amount legally recoverable.
- Treating fuzzy or AI-assisted matches as confirmed financial findings.
- Replacing accounts payable, procurement, contract management, or general-ledger systems.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Manage supplier and governing-document libraries, configure policies, review matches and exceptions, assign cases, approve evidence packages, view exposure and recovery analytics, and run cloud processing. |
| Windows Desktop | Watch approved invoice folders, process sensitive or high-volume local documents, match against local libraries, work offline, resolve local evidence, and generate export copies. |
| Android | Scan/share invoices, correct uncertain fields, review material exceptions and evidence, comment, assign, approve, reject, or escalate. It cannot manage rate libraries or execute payments. |

## 5. Primary workflows

### 5.1 Ingest and match an invoice

1. A user uploads, scans, shares, or places an invoice in an approved folder.
2. DataBreeze creates an immutable artifact version and routes an `AUDIT_INVOICE` job according to workspace data mode.
3. In strict Local mode, Android capture/share may create the local intake, but when no ILD processor is available on Android the `IAE` `InboxItem` remains `NEEDS_REVIEW` with reason `LOCAL_PROCESSOR_REQUIRED`. The UI offers only an explicit `DSO` user-mediated encrypted offline package export/import to a registered Desktop; it never uploads or live-relays `ORIGINAL_CONTENT`.
4. The engine extracts header, totals, taxes, payment reference, service period, and line items with evidence.
5. A `SupplierBinding` resolves an exact `DSM` BusinessParty `ReferenceEntityVersion`; its canonical aliases and identifiers identify candidate supplier, contract, amendment, PO, receipt, and rate versions.
6. Deterministic matching evaluates explicit identifiers first, then configured date, amount, item, and text features.
7. Ambiguous or low-confidence relationships create or link a canonical `JRA` review/finding envelope; they do not produce confirmed overcharge diagnostics.

### 5.2 Calculate expected charges

1. The engine resolves the governing document hierarchy and effective dates for each invoice line.
2. It applies quantity, unit, tier, index, currency, discount, fee, cap, minimum, tax, and rounding rules.
3. The result records billed amount, expected amount, variance, completeness, rule version, and evidence set.
4. Missing or contradictory governing data creates an unresolved exception rather than a zero expected amount.
5. Duplicate and cumulative-cap checks compare the invoice with the permitted historical invoice set.

### 5.3 Review and validate a case

1. Immutable `LeakFindingDetail` records and their `sharedFindingId` values are grouped into a feature-specific case by invoice and root cause.
2. An analyst confirms or changes document relationships and corrects extracted values with reason; valid, invalid, duplicate, or awaiting-information dispositions are submitted through the canonical `JRA` finding/review facade.
3. A validated amount is separately recorded from initial estimated exposure.
4. A material case or package creates a canonical `JRA` `ApprovalRequest` bound to its exact subject type, ID, version, hash, and requested action; `JRA` enforces policy and separation of duties.
5. Closure records outcome, rationale, approved amount, and optional user-entered recovery status.

### 5.4 Build a dispute evidence package

The system freezes selected findings and source versions, applies configured redactions, and produces a PDF/web package plus structured XLSX/JSON schedule. The package includes calculations and citations, but sending it to a supplier remains a deliberate action outside this module.

## 6. Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| ILD-001 | P0 | The system shall create each invoice record from an immutable `IAE` artifact version, retain its content hash, and bind every asynchronous audit to `jraJobId` and a pinned `resultManifestId`. |
| ILD-002 | P0 | The engine shall extract invoice identifiers, dates, supplier, currency, totals, tax, payment reference, service period, and line items with field evidence. |
| ILD-003 | P0 | Users shall manage versioned contracts, amendments, POs, receipts/service records, and rate cards without overwriting prior effective versions. |
| ILD-004 | P0 | Supplier identity shall be a binding to an exact `DSM` BusinessParty `ReferenceEntityVersion`, separate from extracted supplier text; aliases, identifiers, project visibility, and merge history shall remain canonical in `DSM` and shall not be persisted independently by ILD. |
| ILD-005 | P0 | Candidate matching shall prioritize explicit identifiers and expose feature contributions and disqualifying conflicts. |
| ILD-006 | P0 | Ambiguous or low-confidence matches shall require review before a consequential variance is confirmed. |
| ILD-007 | P0 | The system shall support one invoice to many POs/contracts and split invoice lines across governing records with explicit allocations. |
| ILD-008 | P0 | Expected-charge calculations shall be deterministic, versioned, reproducible, and show every intermediate component. |
| ILD-009 | P0 | The system shall distinguish missing, zero, not applicable, unknown, estimated, and confirmed values. |
| ILD-010 | P0 | The engine shall detect exact and near duplicate invoices using identifiers, supplier, dates, amounts, line fingerprints, and artifact hashes. |
| ILD-011 | P0 | Duplicate `LeakFindingDetail` records shall disclose which signals matched, shall not rely on file name alone, and shall link `sharedFindingId` when actionable. |
| ILD-012 | P0 | The engine shall support price, quantity, unit, tiered-rate, discount, fee, freight, tax, service-period, and cumulative-cap checks. |
| ILD-013 | P0 | Unit and currency conversions shall require compatible dimensions and versioned rate provenance. |
| ILD-014 | P0 | Missing governing terms shall produce an incomplete calculation and a canonical `JRA` `ReviewTask` reference, not an assumed entitlement or module-owned review workflow. |
| ILD-015 | P0 | Every immutable financial diagnostic detail shall link billed evidence, governing evidence, calculation version, tolerance, variance, stable fingerprint, and `sharedFindingId` when actionable. |
| ILD-016 | P0 | Estimated exposure, reviewer-validated amount, approved dispute amount, and user-entered recovered amount shall be separate fields. |
| ILD-017 | P0 | Manual corrections and relationship overrides shall require an actor, reason, and retained prior value. |
| ILD-018 | P0 | Feature-specific case status changes, package generation, and closure shall enforce configured permissions; materiality or package approval shall use `JRA` with requested action and exact subject type/ID/version/hash, and the module shall persist only `jraApprovalRequestId` plus that binding. |
| ILD-019 | P0 | Approved evidence packages and closed case versions shall be immutable. |
| ILD-020 | P0 | The module shall expose no payment-execution, payment-status-changing, banking, or autonomous supplier-contact action. |
| ILD-021 | P1 | Users shall configure tolerances by supplier, contract, charge type, currency, amount, and percentage with an effective period. |
| ILD-022 | P1 | The system shall compare invoice totals and quantities across configurable historical windows for duplicate and cap analysis. |
| ILD-023 | P1 | Users shall assign actionable findings, request information, comment, and set due dates through the canonical `JRA` finding/review facade, while supporting-artifact links remain subject details owned by this module. |
| ILD-024 | P1 | The system shall support redaction profiles and preview redactions before evidence-package generation. |
| ILD-025 | P1 | The system shall export PDF, web, XLSX, and JSON case packages with stable evidence identifiers. |
| ILD-026 | P1 | Dashboards shall separate gross flagged exposure, validated amount, approved dispute amount, and user-confirmed recovery. |
| ILD-027 | P1 | Recurring approved-folder intake shall deduplicate identical artifacts and link supplier revisions. |
| ILD-028 | P2 | Provider-neutral AI may suggest classification, line descriptions, or candidate relationships, but no AI suggestion shall establish a confirmed financial finding or amount. |

## 7. Data model extensions

| Entity | Key fields and invariants |
|---|---|
| `SupplierBinding` | ILD binding to an exact `DSM` BusinessParty `ReferenceEntityVersion`, with immutable version/hash and a permission-filtered display projection; aliases, identifiers, project visibility, and merge history remain canonical in `DSM`. |
| `Invoice` | `SupplierBinding`, `IAE` artifact version/hash, invoice number/date, service period, currency, totals, revision state, `dataModeConstraint`, `effectiveDataModePolicyRef`, `retentionConstraint`, and `effectiveRetentionPolicyRef`. |
| `InvoiceAuditRun` | Invoice/version, pinned governing inputs, `jraJobId`, pinned `resultManifestId`, effective execution policy/location, business-state projection, completeness, and failure summary; no independent dispatch/retry/terminal Job state. |
| `InvoiceLine` | Raw and normalized description, quantity, unit, unit price, tax, charges, extension, coding fields, extraction confidence, and evidence. |
| `GoverningDocument` | Typed contract, amendment, PO, receipt, service entry, or rate-card artifact with effective dates and version lineage. |
| `CommercialRuleVersion` | ILD binding to an immutable `DSM` `RuleDefinitionVersion` plus governing-source evidence, effective period, precedence, applicability, and compatible deterministic implementation; it is not a canonical rule definition. |
| `InvoiceMatch` | Invoice/line to governing record, match features, score, conflicts, allocation, status, reviewer, and version. |
| `ExpectedChargeCalculation` | Inputs, intermediate components, billed/expected/variance values, currency, completeness, rule versions, tolerance, input hash, and result hash. |
| `LeakFindingDetail` | Immutable module/`DSM` diagnostic detail with type, diagnostic severity/materiality, estimated exposure, evidence, deterministic rule binding, stable fingerprint, duplicate group, and optional `sharedFindingId`; no assignment, disposition, or workflow status. |
| `InvoiceExceptionCase` | Invoice, grouped diagnostic-detail and `sharedFindingId` references, feature-specific case state, validated amount, approved dispute amount projection, external outcome, and approval binding reference; `JRA` owns actionable workflow. |
| `InvoiceApprovalBinding` | Requested action, exact subject type/ID/version/hash, `jraApprovalRequestId`, projected canonical status, and last verified `JRA` revision; no independent actor or decision payload. |
| `DisputeEvidencePackage` | Frozen case version, selected evidence, redaction profile, `IAE` output artifacts, generation hash, `retentionConstraint`, `effectiveRetentionPolicyRef`, feature-specific release state, and `InvoiceApprovalBinding`. |
| `RecoveryRecord` | User-entered external outcome, amount, currency, date, evidence, and actor; explicitly not a payment transaction. |

## 8. Processing, evidence, and confidence rules

- Raw values and normalized values are stored together. A correction creates a new extraction revision and never changes source bytes.
- Evidence uses page/bounding box, sheet/cell/range, or row/column locators. Derived findings reference all billed inputs, all governing inputs, relationship decisions, conversion rates, tolerance policy, and calculation code version.
- Arithmetic validation reconciles invoice subtotal, discounts, charges, tax, and total within the larger of one minor currency unit or 0.05% by default. Workspace policy may set stricter, versioned thresholds.
- Matching stages are: exact invoice/PO/contract/reference identifiers; aliases and identifiers from the bound `DSM` BusinessParty version; effective-date and currency constraints; normalized item/rate keys; then scored descriptive similarity. A hard identifier conflict prevents auto-match.
- Default auto-match requires no hard conflicts, all mandatory keys present, and calibrated score `>= 0.97`. Scores `0.80-0.9699` require review; lower scores remain candidates only. Workspaces may raise the threshold.
- An expected-charge calculation is `complete` only when every consequential relationship and rule input is resolved. Findings from incomplete calculations are labeled estimated and cannot become an approved dispute amount.
- Duplicate rules use artifact hash and normalized business fingerprints. Exact artifact duplicates can be auto-grouped; near duplicates require review and preserve revision/credit-note possibilities.
- Rate selection obeys explicit precedence: approved override, exact PO line, applicable amendment, base contract/rate card, then unresolved. The chosen source and rejected alternatives are visible.
- Credits and negative lines are not converted into overcharges by absolute-value comparison. Taxes and rounding are applied in the order specified by the governing rule.
- AI adapters can assist OCR, classify documents, and propose matches. Consequential relationship confirmation, expected amounts, tolerance results, duplicate findings, and package figures remain deterministic and provider-neutral.

## 9. Permissions, privacy, and data modes

Capabilities are `invoice.read`, `invoice.ingest`, `invoice.library.binding.manage`, `invoice.audit.run`, `invoice.match.review`, `invoice.finding.facade.manage`, `invoice.case.manage`, `invoice.case.approval.facade`, `invoice.package.generate`, `invoice.package.approval.facade`, and `invoice.export`. Canonical supplier edits use `DSM`; `JRA` enforces assignment, disposition, approver eligibility, separation of duties, MFA, expiry, and approval invalidation.

| Data mode | Originals and processing | Synchronization |
|---|---|---|
| Local | Invoice and governing-document bytes stay on an authorized Desktop; matching and calculation run there. Android may capture/share locally, but an unsupported `IAE` `InboxItem` remains `NEEDS_REVIEW` with reason `LOCAL_PROCESSOR_REQUIRED` until the user explicitly transfers a `DSO` encrypted offline package to a registered Desktop. | Only `CONTROL_METADATA` synchronizes automatically. `ORIGINAL_CONTENT` is never uploaded or live-relayed; diagnostic details, case values, and package outputs synchronize only as separately confirmed `APPROVED_DERIVED_RESULT` resources under `DSO`. |
| Hybrid (default) | Originals may remain local while normalized records and selected evidence synchronize by policy. | Web and Android support case review and approval; sensitive evidence fields can remain local-only. |
| Cloud | Authorized originals and governing libraries reside in encrypted workspace storage and run on cloud workers. | Records and evidence are available to clients with supplier/project permissions. |

The workspace `DSO` policy is the maximum authority. ILD `dataModeConstraint` and `effectiveDataModePolicyRef` values may only narrow placement, processing, synchronization, or export; every audit, package transfer, and Desktop import resolves the intersection again at execution time.

`IAE` is canonical for retention and deletion of invoice, governing-document, evidence, and dispute-package bytes. ILD resources store only `retentionConstraint` and `effectiveRetentionPolicyRef`, which may narrow or extend but never shorten the workspace minimum. Deletion eligibility intersects workspace minimum, resource constraint, evidence/package lineage, legal hold, audit class, and recovery window; feature code requests deletion through `IAE`, and local cache cleanup is not authoritative retention.

Access is additionally scoped by project/client and supplier where configured. Events and normal telemetry contain identifiers and classifications, not invoice text, bank details, tax identifiers, or commercial rates. Exports, evidence access, redaction, overrides, approvals, recovery entries, and retention actions are audited.

## 10. Offline, sync, failure, and recovery

- Desktop and Android use client-generated IDs, optimistic versions, and an idempotent outbox. A retried command cannot create a second invoice, case, `JRA` approval request, or package.
- Local audits can complete offline when governing records and policy versions are cached. The app may preserve non-authoritative approval notes/reason as a local draft, but sync never converts it into a decision: an eligible actor must reopen the exact current subject online, freshly confirm approve/reject, and satisfy current MFA before the `JRA` facade records a canonical ApprovalDecision.
- A strict-Local Android intake without a compatible processor remains a durable `IAE` `InboxItem` in `NEEDS_REVIEW` with reason `LOCAL_PROCESSOR_REQUIRED`. Transfer requires a visible user action that exports a resource/hash-bound encrypted `DSO` offline package and a separate explicit import on a registered Desktop; background upload, cloud staging, and live device relay are prohibited. Only after Desktop import creates an eligible processing subject may a canonical `JRA` Job use `WAITING_FOR_DEVICE`.
- Jobs requiring an offline desktop remain `WAITING_FOR_DEVICE`; private originals are not uploaded or rerouted automatically.
- If a governing document changes during processing, the current result remains tied to its immutable version and is marked superseded for new decisions.
- Relationship, correction, and case-state conflicts require explicit review; approved amounts never use last-write-wins.
- Processing checkpoints classification, extraction, candidate generation, matching, calculation, and package rendering. Retries resume only when artifact and policy hashes match.
- Corrupt/password-protected files and unsupported contract terms produce actionable partial or blocked states. Any skipped pages, sheets, rules, or history windows are enumerated.
- Package generation can be retried from the frozen case without rerunning calculations. Partial outputs are quarantined and never marked ready.
- A later credit note or supplier revision creates a related artifact and case update; it does not erase the original diagnostic detail or its canonical `JRA` history.

## 11. APIs, events, and extension points

Representative REST resources are:

- `POST /v1/invoices`, `GET /v1/invoices/{id}`, `POST /v1/invoices/{id}/audits`;
- `POST /v1/governing-documents` and `/v1/governing-documents/{id}/versions`;
- `GET/PATCH /v1/invoice-audits/{id}/matches/{matchId}`;
- `GET /v1/invoice-audits/{id}/finding-details/{detailId}` and `GET/PATCH /v1/invoice-audits/{id}/finding-facades/{sharedFindingId}`;
- `POST /v1/invoice-cases`, `PATCH /v1/invoice-cases/{id}`;
- `POST /v1/invoice-cases/{id}/submissions` and `/approvals`;
- `POST /v1/invoice-cases/{id}/evidence-packages`;
- `POST /v1/invoice-cases/{id}/recovery-records`.

Typed jobs are `EXTRACT_INVOICE`, `INDEX_GOVERNING_DOCUMENT`, `MATCH_INVOICE`, `CALCULATE_EXPECTED_CHARGES`, `DETECT_INVOICE_DUPLICATES`, and `GENERATE_DISPUTE_EVIDENCE_PACKAGE`. Jobs are signed, permission-scoped, schema-versioned, resource-bounded, bind effective `DSO` policy, and never encode payment or arbitrary PC commands. `JRA` alone owns dispatch, progress, cancellation, retry, and terminal Job state. Each `InvoiceAuditRun` or package-generation projection stores `jraJobId` and the accepted pinned `resultManifestId`; business state updates idempotently from committed `JRA` outbox/results. Mapping is explicit: JRA `QUEUED`/`RUNNING` project to ILD `PENDING`/`PROCESSING`, `SUCCEEDED` plus accepted manifest projects to `CALCULATED`, and `FAILED`/`CANCELLED` project to corresponding execution failure/cancellation; incomplete governing data may keep a successful execution `INCOMPLETE` or `NEEDS_REVIEW`.

Finding/review transitions and `/approvals` call the canonical `JRA` facade. ILD routes return `sharedFindingId`, `jraReviewTaskId`, or `jraApprovalRequestId` plus the canonical revision and store no independent workflow or approval decision.

Events include `invoice.ingested`, `invoice.review.required`, `invoice.audit.completed`, `invoice.finding_detail.created`, `invoice.case.submitted`, `invoice.case.approval_binding.updated`, `invoice.case.closed`, and `invoice.evidence_package.ready`. Canonical finding/review/approval-decision events remain owned by `JRA`; module consumers receive tenant-scoped versions and summaries only.

Extension points include deterministic commercial-rule implementations registered for compatible `DSM` `RuleDefinitionVersion` contracts, approved exchange/index-rate providers, `DSM` BusinessParty binding resolvers, safe parsers, and export renderers. Each declares version, evidence requirements, supported input types, and deterministic test fixtures and cannot create a parallel supplier identity.

## 12. Performance and capacity budgets

Defaults are configurable within workspace plan and infrastructure ceilings.

| Budget | Default target |
|---|---|
| ILD high-capacity batch profile | 10,000 invoices, 1 million lines, 2,000 governing documents, and 10 GB source artifacts per asynchronous batch with module admission, isolated resources, entitlement, and published reference hardware |
| Single document | 500 pages or 250 MB; larger inputs require a configured exception or split |
| Job acknowledgement | Durable job record in <= 500 ms at p95 |
| Single-invoice processing | Text PDF of 50 pages or fewer to review-ready results in <= 90 seconds at p95, excluding queue time |
| Batch matching | 100,000 invoice lines against indexed governing records in <= 15 minutes at p95 on standard batch workers |
| Case view | First 100 findings and totals in <= 2 seconds at p95 after processing |
| Evidence open | Cached locator in <= 1.5 seconds at p95 |
| Package generation | 500-page evidence package in <= 3 minutes at p95 |
| Reliability | >= 99.5% successful supported jobs monthly, excluding invalid inputs; exactly-once case/approval/package records across retries |

Historical duplicate windows default to 24 months and are configurable. Truncation is forbidden unless the result prominently identifies the exact omitted period and blocks a “complete” duplicate conclusion.

## 13. Observability and product success metrics

Traces connect API requests, artifacts, extraction, candidate search, match decisions, calculations, cases, approvals, and package exports. Operational metrics include queue delay, page and line throughput, match-score distribution, review rate, incomplete-calculation rate, finding counts by rule, duplicate-group size, processor retry, device wait, package failure, and rules exceeding time budgets. Sensitive commercial payloads are excluded from logs.

Product success is measured by:

- percentage of supported invoices screened with complete governing evidence;
- reviewer-confirmed precision by finding type;
- median time from invoice intake to review-ready exceptions;
- validated amount as a percentage of initially estimated exposure;
- percentage of approved package figures reproducible from stored provenance;
- time from case creation to disposition;
- user-confirmed recovery reporting, explicitly separated from product-generated savings claims; and
- zero payment or supplier-contact actions initiated by the module.

## 14. Acceptance and testing criteria

- Golden fixtures cover Vietnamese and English invoices, scans, multi-page PDFs, XLSX schedules, credit notes, revisions, mixed taxes, currencies, tiered rates, caps, freight, discounts, and service periods.
- Deterministic tests cover precedence, effective dates, quantity/unit conversion, tiers, indices, minimums, caps, tax order, currency, rounding, credits, and missing inputs.
- Duplicate tests cover exact files, rescans, renumbered revisions, recurring legitimate invoices, credit notes, and same-total false positives.
- Property tests verify calculation components reconcile to displayed expected and variance totals under the stored rounding policy.
- Local and cloud engine runs produce equivalent match features, calculations, and finding identities for identical versions.
- Contract tests cover API schemas, signed jobs, events, idempotency, and backwards-compatible event readers.
- Security tests cover cross-tenant supplier IDs, unauthorized governing evidence, revoked devices, tampered jobs, self-approval, redaction bypass, and sensitive log leakage.
- Offline tests cover folder ingestion, restart, outbox replay, source revisions, conflicting relationship decisions, and package retry.
- Strict-Local Android tests prove capture/share remains an `IAE` `InboxItem` in `NEEDS_REVIEW` with reason `LOCAL_PROCESSOR_REQUIRED` when Android cannot process, no `ORIGINAL_CONTENT` reaches cloud or a live relay, and only an explicit encrypted `DSO` package export/import to a registered Desktop resumes processing.
- An end-to-end test ingests an invoice plus contract, amendment, PO, receipt, and rate card; resolves an ambiguous match; identifies a valid overcharge and a false duplicate; approves a redacted package; and proves no payment endpoint or side effect exists.
- Acceptance requires that every approved dispute amount reproduce from immutable evidence and that every incomplete governing-data case remains visibly incomplete.

## 15. Delivery slices and future expansion

### Slice 1: Evidence-backed invoice audit

Invoice and governing-document intake, extraction, supplier aliases, exact PO/contract matching, basic duplicate/price/quantity checks, deterministic calculations, web/desktop review, and XLSX/PDF findings.

### Slice 2: Governed exception cases

Rate-card and amendment precedence, advanced duplicates/caps/fees/tax, assignment, Android review, materiality approvals, redaction, dispute evidence packages, and exposure dashboards.

### Slice 3: Scale and extensibility

Large batch processing, recurring approved-folder intake, commercial-rule SDK, approved rate adapters, richer trend analytics, and API/event integrations initiated by customers.

Future expansion may add user-authorized connectors to systems with accessible APIs, contract clause libraries, and recovery workflow analytics. It must not add payment execution, autonomous supplier communication, private-site scraping, unsupported legal conclusions, or opaque AI-derived financial findings.
