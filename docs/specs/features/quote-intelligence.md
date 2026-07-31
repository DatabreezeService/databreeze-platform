# DataBreeze Quote Intelligence

> **Status:** Product specification<br>
> **Version:** 1.0<br>
> **Requirement prefix:** `QI`<br>
> **Dependencies:** Identity and RBAC; workspaces and projects; Inbox and immutable artifacts; artifact versions; datasets; evidence store; typed jobs and device routing; authoritative `JRA` ApprovalPolicy, ApprovalRequest, and ApprovalDecision contracts; audit history; notifications; report/export service; Python processing engine; object storage

## 1. Purpose and outcome

Quote Intelligence turns supplier quotations and request-for-quotation packages into a comparable, evidence-backed sourcing decision. It normalizes inconsistent descriptions, units, currencies, taxes, freight, lead times, and commercial terms into one comparison while keeping every value traceable to a source page, table region, sheet, cell, or user-entered assumption.

The outcome is an approved comparison version containing:

- a normalized requirement and supplier line-item matrix;
- total and per-line landed cost under an explicit cost scenario;
- deterministic compliance and exception findings;
- a configurable weighted score with a visible calculation breakdown;
- unresolved questions, reviewer corrections, and supplier coverage gaps; and
- an exportable decision pack whose figures can be reproduced from immutable inputs.

Quote Intelligence recommends no supplier by default. A workspace may label the highest eligible score as a candidate, but a human approver owns the award decision.

## 2. Users and jobs-to-be-done

| User | Job to be done |
|---|---|
| Procurement analyst | Convert mixed PDF, image, DOCX, XLSX, CSV, and email-export quote files into one comparable bid table. |
| Request owner | Confirm that each offer satisfies required specifications, quantities, delivery locations, and dates. |
| Finance reviewer | Validate tax, currency, freight, duties, discounts, payment terms, and landed-cost assumptions. |
| Approver | Review the calculation and evidence, document the decision, and approve or reject a comparison version. |
| Workspace admin | Configure units, currencies, scoring policies, extraction thresholds, retention, and allowed execution locations. |
| Auditor/viewer | Reconstruct what source and rule version produced a decision without changing it. |

## 3. Scope and explicit non-goals

### In scope

- RFQ requirement entry or import and versioning.
- Supplier quote ingestion from user-controlled files, Android capture, approved desktop folders, and product APIs.
- Header, commercial-term, and line-item extraction with Vietnamese and English field aliases.
- Unit, currency, tax, discount, freight, duty, and lead-time normalization.
- Many-to-one, one-to-many, alternate, and partial line matching with review.
- Landed-cost scenarios and weighted scoring with deterministic eligibility gates.
- Side-by-side evidence, review, approval, comments, exports, and supplier decision history.

### Explicit non-goals

- Sending RFQs through a restricted marketplace or reading private supplier portals.
- Autonomous supplier negotiation, purchase-order creation, contract signature, or payment.
- Treating AI similarity or generated explanations as financial evidence.
- Silently guessing missing currency, tax basis, incoterm, quantity, unit, or conversion rate.
- Replacing a procurement suite, ERP, or contract lifecycle system.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Create RFQs and comparison projects; manage supplier sets, policies, exchange-rate assumptions, scoring weights, collaboration, approvals, cloud processing, history, and reports. |
| Windows Desktop | Read explicitly selected files and watched folders; run extraction and comparison locally; process large workbooks/PDF batches; resolve evidence in local files; support offline review; export approved copies. |
| Android | Scan or share quote files; correct uncertain fields; answer assigned questions; review a compact comparison and evidence; comment; approve or reject through the `JRA` facade. It does not configure scoring models, edit bulk mappings, or imply cloud upload/live relay for strict-Local originals. |

## 5. Primary workflows

### 5.1 Create and populate a comparison

1. An analyst creates an RFQ version with currency, destination, required lines, quantities, delivery constraints, and mandatory criteria.
2. The analyst uploads, links, scans, or shares quote artifacts and binds each source to an exact authorized DSM `BUSINESS_PARTY` ReferenceEntityVersion while retaining the raw extracted supplier name separately.
3. If Android holds `ORIGINAL_CONTENT` in strict Local mode and cannot run the required processor, the source remains on Android and its IAE InboxItem enters `NEEDS_REVIEW` with reason `LOCAL_PROCESSOR_REQUIRED`. The UI guides the user through an explicit `DSO` user-mediated encrypted offline package export/import to a registered Desktop; it is never uploaded or live-relayed through cloud.
4. Otherwise, DataBreeze creates a `COMPARE_QUOTES` job routed to cloud or a registered desktop device according to data mode and artifact location.
5. The engine extracts terms and line items, normalizes candidate values, and preserves raw text plus evidence.
6. Exact rules and deterministic matching run first; ambiguous matches and low-confidence fields enter review.
7. The analyst resolves exceptions and freezes an input version for calculation.

### 5.2 Calculate landed cost and score

1. The analyst selects or creates a versioned cost scenario.
2. The system validates required assumptions and refuses a final total when a required basis is missing.
3. The engine calculates line extensions, discounts, taxes, freight allocation, duties, other charges, and scenario totals.
4. Mandatory gates are evaluated before weighted scoring.
5. The UI shows each supplier's score, component values, eligibility, exclusions, and evidence.
6. Changing an input, mapping, rate, or weight creates a new comparison calculation version.

### 5.3 Review and approve

1. The owner submits a frozen comparison version and exact calculation hash to an applicable `JRA` ApprovalPolicy, creating an authoritative ApprovalRequest whose `subjectRef` binds type, ID, version, and hash.
2. Approvers review unresolved warnings, score calculations, source evidence, and any manual overrides.
3. An eligible approver records the authoritative ApprovalDecision and rationale through `JRA`; any selected supplier is stored as a module release choice bound to that request and frozen subject.
4. Quote Intelligence projects the accepted `JRA` decision, locks the exact approved version, writes its module audit event, and generates a decision pack.
5. Later source changes create a new version and never rewrite the approved record.

### 5.4 Reuse a completed comparison

An analyst may copy a prior RFQ structure, supplier aliases, unit mappings, and scoring policy. Source documents, decisions, exchange rates, and manual overrides are not copied as current facts.

## 6. Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| QI-001 | P0 | The system shall create a comparison under one workspace and project with a unique, tenant-scoped identifier. |
| QI-002 | P0 | The system shall version RFQ requirements and preserve previously used versions. |
| QI-003 | P0 | The system shall ingest PDF, common image formats, DOCX, XLSX, and CSV artifacts without modifying originals. An Android-held `ORIGINAL_CONTENT` source that cannot be processed on Android in strict Local mode shall remain on that device with its IAE InboxItem in `NEEDS_REVIEW` and reason `LOCAL_PROCESSOR_REQUIRED` until an explicit `DSO` user-mediated encrypted offline package is exported and imported on a registered Desktop; cloud upload and live relay are forbidden. |
| QI-004 | P0 | The system shall retain the supplier name extracted from each quote separately and bind the quote to an exact authorized DSM `BUSINESS_PARTY` ReferenceEntityVersion; QI shall not own supplier aliases, identifiers, visibility, or merge history. |
| QI-005 | P0 | The engine shall extract raw and normalized header terms and line items with field-level evidence references. |
| QI-006 | P0 | The system shall support Vietnamese and English labels, decimal conventions, dates, currencies, and unit aliases. |
| QI-007 | P0 | The system shall normalize units only through a versioned compatible-dimension conversion rule. |
| QI-008 | P0 | The system shall support exact, tolerance-based, many-to-one, one-to-many, partial, alternate, and unmatched line states. |
| QI-009 | P0 | A user shall be able to confirm, reject, split, merge, or remap a proposed line match without losing the proposal history. |
| QI-010 | P0 | The system shall calculate landed cost from a versioned formula and expose every intermediate component. |
| QI-011 | P0 | Required but absent cost inputs shall produce an incomplete result, not an assumed zero. |
| QI-012 | P0 | Currency conversion shall store source currency, target currency, rate, effective date, provenance, and rounding policy. |
| QI-013 | P0 | The system shall distinguish tax-inclusive, tax-exclusive, exempt, unknown, and not-applicable states. |
| QI-014 | P0 | Scoring shall use workspace-configurable weights totaling 100%, deterministic normalization functions, and mandatory eligibility gates. |
| QI-015 | P0 | The score view shall show raw value, normalized value, weight, contribution, gate result, and policy version. |
| QI-016 | P0 | Manual values and overrides shall require a reason and actor and shall remain visually distinct from extracted values. |
| QI-017 | P0 | Consequential compliance, cost, and eligibility findings shall be rule-derived and reproducible without an AI provider. |
| QI-018 | P0 | Submission to a `JRA` ApprovalRequest shall be blocked while required fields, invalid conversions, or unresolved blocking findings remain. |
| QI-019 | P0 | A version released by an accepted `JRA` ApprovalDecision shall be immutable and shall retain source, rule, rate, reviewer, exact subject type/ID/version/hash, and authoritative approval provenance. |
| QI-020 | P0 | All read, edit, export, submit, and approve-facade operations shall enforce workspace and project permissions plus the applicable `JRA` ApprovalPolicy; Quote Intelligence shall not persist an independent ApprovalDecision. |
| QI-021 | P1 | Users shall be able to compare multiple landed-cost scenarios without duplicating source artifacts. |
| QI-022 | P1 | The system shall detect duplicate quote artifacts and superseded supplier revisions while allowing an explicit override. |
| QI-023 | P1 | The system shall support configurable tolerances for quantity, price, delivery, and specification comparisons. |
| QI-024 | P1 | Users shall be able to assign extraction or matching questions and receive notifications. |
| QI-025 | P1 | The system shall export XLSX, PDF, and web decision packs with evidence identifiers and version metadata. |
| QI-026 | P1 | The system shall expose comparison history for a supplier without leaking data across projects lacking access. |
| QI-027 | P1 | A copied comparison shall reference its source template but shall receive new independent versions and, when required, new `JRA` ApprovalRequests. |
| QI-028 | P2 | An AI adapter may suggest semantic matches or plain-language explanations, but suggestions shall require confirmation and never change deterministic calculations. |

## 7. Data model extensions

All entities include `id`, `workspace_id`, timestamps, optimistic version, and audit metadata unless noted.

| Entity | Key fields and invariants |
|---|---|
| `QuoteComparison` | `project_id`, title, business lifecycle, target currency, destination, active requirement version, `dataModeConstraint`, `effectiveDataModePolicyRef`, `retentionConstraint`, and `effectiveRetentionPolicyRef`. DSO policy can only be narrowed and IAE remains deletion authority. |
| `RfqRequirementVersion` | Immutable snapshot of requirement lines, mandatory criteria, delivery constraints, and author. |
| `RfqLine` | Stable logical line key, description, specification, requested quantity/unit, tolerance, required date, lot/group, and mandatory flag. |
| `SupplierQuote` | Exact `DSM` `BUSINESS_PARTY` ReferenceEntityVersion binding, separately retained raw supplier text, source artifact version, quote number/date, revision, validity, currency, and processing state. One artifact version is unique within a comparison unless explicitly reused. |
| `QuoteLineExtraction` | Raw text, normalized fields, extraction method/version, confidence, and evidence references. |
| `QuoteLineMatch` | RFQ line(s), quote line(s), match type, deterministic features, suggestion source, reviewer, and status. |
| `CommercialTerm` | Typed term such as incoterm, payment, warranty, validity, lead time, tax, discount, or freight with raw/normalized value and evidence. |
| `CostScenarioVersion` | Immutable target currency, exchange rates, tax/duty rules, allocation rules, destination, rounding, and assumptions. |
| `CostCalculation` | Per-line components, supplier totals, completeness, formula version, input hash, and calculation hash. |
| `ScoringPolicyVersion` | Criteria, gates, weights, direction, normalization functions, missing-value behavior, and effective dates. |
| `SupplierScore` | Eligibility, criterion contributions, total, rank if enabled, policy version, and input calculation version. |
| `QuoteDecision` | Module release projection containing the exact comparison subject type/ID/version/hash, selected supplier(s) if any, release rationale, `jraApprovalRequestId`, and accepted JRA decision reference. `JRA` owns ApprovalPolicy, ApprovalRequest, ApprovalDecision, approver identity, and decision rationale. |
| `QuoteProcessingProjection` | Operation type, exact input/version hashes, `jraJobId`, pinned `resultManifestId`, and feature business state. JRA owns execution; this row is updated idempotently from committed JRA events/results. |

`QuoteProcessingProjection` maps JRA `CREATED|QUEUED|WAITING_FOR_DEVICE` to `PENDING`, `DISPATCHED|RUNNING` to `PROCESSING`, `NEEDS_REVIEW|AWAITING_APPROVAL` to `REVIEW_REQUIRED`, `SUCCEEDED` with a verified manifest to `AVAILABLE`, `PARTIALLY_SUCCEEDED` to `INCOMPLETE`, and `FAILED|CANCELLED|EXPIRED` to `UNAVAILABLE`. QI never marks an asynchronous run successful independently.

## 8. Processing, evidence, and confidence rules

- The processor stores raw extracted text before normalization. A normalized value never replaces the raw value.
- Evidence uses page and bounding box for paged documents, sheet and cell/range for workbooks, and row/column for delimited data. Derived values reference all contributing fields plus the exact rule version.
- Field confidence is a calibrated value from 0 to 1. Default workspace thresholds are: `>= 0.92` auto-accept for non-consequential extraction, `0.70-0.9199` review, and `< 0.70` unresolved. Currency, tax basis, unit, quantity, unit price, and total always require either deterministic validation or human confirmation before approval, regardless of confidence.
- Arithmetic reconciliation checks quote subtotal, discount, tax, charges, and grand total within the larger of 0.5 target-currency minor units or 0.05% by default. The limit is workspace-configurable and versioned.
- Exact supplier item code, normalized unit, and specification rules run before semantic similarity. A semantic suggestion cannot auto-resolve a many-to-one, one-to-many, or incompatible-unit match.
- Unit conversions require the same physical dimension. Packaging conversions such as carton-to-piece require an evidenced or user-entered pack size.
- Freight and shared charges use an explicit allocation basis: supplier-stated line allocation, quantity, weight, value, equal allocation, or manual allocation. The basis and remainder handling are recorded.
- Missing and zero are distinct. Unknown values remain unknown through scoring unless a policy defines a conservative penalty.
- Ranks are shown only among eligible suppliers with complete comparable scores; otherwise the UI shows unranked status and the reason.
- AI can propose labels, match candidates, and narrative summaries through a provider-neutral adapter. It cannot establish a mandatory compliance result, conversion factor, exchange rate, landed cost, or final score.

## 9. Permissions, privacy, and data modes

Recommended capabilities are `quote.read`, `quote.create`, `quote.edit`, `quote.review`, `quote.policy.manage`, `quote.submit`, `quote.approve`, `quote.export`, and `quote.delete`. Submitters cannot approve their own version when workspace separation-of-duties policy is enabled. Supplier files inherit project access and are never exposed through a report or share link unless explicitly included.

| Data mode | Originals and processing | Synchronization |
|---|---|---|
| Local | Originals remain on the source Android device or in an approved Desktop location; extraction and calculation run only where a local processor is available. An Android-only source awaiting Desktop processing has IAE intake state `NEEDS_REVIEW` with reason `LOCAL_PROCESSOR_REQUIRED`; this is not a JRA Job state. | Only `CONTROL_METADATA` synchronizes automatically. Moving an Android original to Desktop requires an explicit `DSO` user-mediated encrypted offline export/import package; cloud upload and live relay are forbidden. A comparison, decision pack, or other value-bearing output synchronizes only as a resource/hash-bound `APPROVED_DERIVED_RESULT` confirmed under `DSO`; source evidence remains device-bound. |
| Hybrid (default) | Originals may stay local; structured quote records and chosen evidence snippets may synchronize under policy. | Web collaboration and approval use synchronized records; local-only evidence offers Open on Desktop and is not live-streamed through the cloud. |
| Cloud | Encrypted originals are stored in workspace object storage and processed by authorized workers. | Authorized web and Android clients receive records and evidence according to project permissions. |

Exports, downloads, evidence access, manual overrides, policy changes, and approvals are audited. Retention and deletion follow artifact policy; an approved decision keeps tombstoned provenance even when source content is lawfully removed.

## 10. Offline, sync, failure, and recovery

- Desktop and Android create client-generated IDs and queue writes in an ordered local outbox. Server commands are idempotent by workspace and idempotency key.
- The IAE `NEEDS_REVIEW` / `LOCAL_PROCESSOR_REQUIRED` intake state preserves the Android artifact and content-free control state across restart. It clears only after a registered Desktop verifies and imports the explicit encrypted offline package. A canonical JRA Job may then use `WAITING_FOR_DEVICE` if that Desktop is unavailable; ordinary sync, reconnect, or cloud-worker availability cannot transfer or process the original.
- A local comparison can proceed offline when all required artifacts, rules, rates, and policies are cached. The app may preserve non-authoritative approval notes/reason as a local draft, but sync never converts it into a decision: the eligible actor must reopen the exact current subject online, freshly confirm approve/reject, and satisfy current MFA before `JRA` records an ApprovalDecision.
- If the assigned desktop is offline, the job remains `WAITING_FOR_DEVICE`; it is not rerouted to cloud without explicit policy and source availability.
- Source modification during processing creates or requests a new artifact version. Results tied to the prior hash remain available but are marked superseded.
- Conflicting corrections never use last-write-wins. The record enters conflict review with both values, actors, evidence, and base version.
- Each job step checkpoints extraction, normalization, matching, calculation, and export. Retries resume from a compatible checkpoint and cannot duplicate versions or approvals.
- A failed exchange-rate lookup does not block review of extracted data; it blocks final target-currency totals until an authorized rate is supplied.
- Export failure may be retried from the frozen approved version without recalculation.

## 11. APIs, events, and extension points

Representative REST resources are:

- `POST /v1/quote-comparisons`, `GET/PATCH /v1/quote-comparisons/{id}`;
- `POST /v1/quote-comparisons/{id}/requirements/versions`;
- `POST /v1/quote-comparisons/{id}/quotes`;
- `POST /v1/quote-comparisons/{id}/jobs/compare`;
- `PATCH /v1/quote-comparisons/{id}/matches/{matchId}`;
- `POST /v1/quote-comparisons/{id}/cost-scenarios`;
- `POST /v1/quote-comparisons/{id}/submissions` and `/approvals`; `/approvals` is an authorized module facade using `jraApprovalRequestId` and the exact subject type/ID/version/hash over the bound `JRA` ApprovalRequest and never creates an independent decision;
- `POST /v1/quote-comparisons/{id}/exports`.

Typed jobs are `EXTRACT_QUOTE`, `COMPARE_QUOTES`, `CALCULATE_LANDED_COST`, and `GENERATE_QUOTE_DECISION_PACK`. Contracts are versioned JSON Schema, permission-scoped, signed for device delivery, and limited to artifact IDs, allowed paths/capabilities, policy versions, and resource budgets.

Domain events include `quote.comparison.created`, `quote.extraction.completed`, `quote.review.required`, `quote.calculation.completed`, `quote.submitted`, `quote.approved`, `quote.rejected`, and `quote.export.ready`. `quote.approved` and `quote.rejected` are module projections emitted from an authoritative `JRA` ApprovalDecision; they are not decision authorities. Events carry tenant-scoped identifiers and versions, not unredacted document contents.

Extension points are provider-neutral OCR/extraction adapters, currency-rate sources approved by an admin, unit catalogs, scoring criterion plugins with deterministic contracts, and export renderers. An extension cannot bypass evidence, permission, versioning, or approval rules.

## 12. Performance and capacity budgets

Defaults are workspace-configurable up to plan and infrastructure ceilings.

| Budget | Default target |
|---|---|
| QI high-capacity comparison profile | 50 suppliers, 5,000 extracted quote lines, 2,000 RFQ lines, and 2 GB total source artifacts with asynchronous processing, admission, entitlement, and published reference hardware |
| Interactive table | First 200 visible rows in <= 2 seconds at p95 after records exist; virtualized scrolling thereafter |
| Job acknowledgement | API accepts and durably records a job in <= 500 ms at p95 |
| Extraction | 95% of text PDFs with 200 pages or fewer complete in <= 5 minutes on a standard worker, excluding queue time |
| Recalculation | 50 suppliers x 2,000 RFQ lines in <= 30 seconds at p95 after extraction |
| Evidence open | Cached evidence locator opens in <= 1.5 seconds at p95; remote/local file availability is reported separately |
| Export | A 5,000-line XLSX/PDF decision pack completes in <= 2 minutes at p95 |
| Reliability | No duplicate approved version or export record across retries; monthly successful job completion >= 99.5% excluding invalid inputs |

The UI shall warn before configured limits, reject oversized requests with actionable split guidance, and never partially omit suppliers without disclosure.

## 13. Observability and product success metrics

Structured traces connect API request, job, processor step, artifact version, calculation version, and export. Logs exclude document text and supplier commercial values by default. Metrics include queue delay, step duration, page/line throughput, extraction confidence distribution, reconciliation failures, match review rate, retry count, device wait time, export failure, and approval latency. Audit events capture policy changes and every consequential override.

Product success is measured by:

- median analyst time from complete quote set to review-ready comparison;
- percentage of normalized values with resolvable evidence;
- percentage of final cost components reproducible from stored inputs;
- human correction rate by field and source type;
- comparisons approved without spreadsheet rework outside DataBreeze;
- unresolved blocking issue rate at submission; and
- decision-pack use and repeat RFQ-template use.

No success metric rewards automatic supplier selection or reduced human review of consequential fields.

## 14. Acceptance and testing criteria

- Golden fixtures cover Vietnamese and English PDF, scan, XLSX, and CSV quotes with merged cells, repeated headers, decimal variations, tax-inclusive pricing, discounts, freight, revisions, and alternate offers.
- Unit tests verify currency, tax, allocation, rounding, gates, scoring normalization, missing-value behavior, and all supported match cardinalities.
- Property tests prove supplier totals equal rounded components under the versioned formula and that score contributions equal the displayed total.
- Local and cloud processors produce equivalent normalized and calculated outputs for the same engine, rule, and fixture versions.
- Contract tests validate OpenAPI, job schemas, event schemas, idempotency, and backward-compatible readers.
- Security tests attempt cross-tenant IDs, revoked device execution, unauthorized evidence access, self-approval, export leakage, and signed-job tampering.
- Offline tests cover capture, local comparison, restart recovery, queued correction sync, conflicts, and device revocation.
- A strict-Local Android test proves an unprocessable captured quote remains in IAE `NEEDS_REVIEW` with reason `LOCAL_PROCESSOR_REQUIRED`, survives restart, sends no original bytes through sync or live relay, and becomes processable only after a user exports an encrypted `DSO` offline package and a registered Desktop verifies and imports it.
- Accessibility tests cover keyboard comparison navigation, non-color-only finding states, evidence labels, and screen-reader names.
- An end-to-end test must ingest at least three heterogeneous supplier quotes, resolve an ambiguous split match, calculate two scenarios, reject an incomplete submission, approve a complete version, and reproduce its exported totals from provenance.
- Acceptance requires zero silent assumptions for required cost fields, zero mutation of original artifacts, and zero approval duplication under repeated requests.

## 15. Delivery slices and future expansion

### Slice 1: Evidence-backed comparison

RFQ lines, PDF/XLSX/CSV ingestion, deterministic extraction and normalization, one-to-one reviewable matching, basic tax/freight landed cost, web/desktop review, immutable versions, and XLSX export.

### Slice 2: Governed decisions

Complex match cardinalities, configurable scoring and gates, Android review/approval, scenario comparison, decision packs, notifications, and supplier history.

### Slice 3: Scale and extensibility

Folder intake, large-batch performance, admin-approved rate adapters, reusable catalogs, API/event extensions, richer Office/PDF exports, and policy analytics.

Future expansion may add supplier response packages, should-cost analysis, catalog-assisted matching, and public supplier submission links. It must not introduce private-site scraping, autonomous negotiation, hidden scoring, purchase execution, or dependence on a restricted marketplace API.
