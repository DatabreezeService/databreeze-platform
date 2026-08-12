# Unified Data Workspace Experience Design

**Status:** User-approved product direction

**Date:** 2026-08-12

**Applies to:** DataBreeze Web, Windows Desktop, Android capture, IAM, connected-source intake, datasets, ETL, OCR, analyst conversations, dashboards, workspace membership, evidence, refresh, and synchronization

**Build authority:** This design records the approved experience. It does not replace accepted specifications or authorize implementation where Section 17 identifies a normative delta. Applicable canonical specifications must be revised and approved before an implementation plan may weaken or replace current requirements.

**Primary requirements:** IAM-001 through IAM-025; WEB-002 through WEB-016, WEB-020, WEB-021, WEB-023, WEB-024; DSK-001 through DSK-027; AND-001 through AND-024; DDA-001 through DDA-060

## 1. Product outcome

DataBreeze is one Vietnamese-first data workspace that turns business files, connected Desktop folders, scanned receipts, invoices, and tables into logical datasets, transparent prepared versions, evidence-backed analysis, and interactive dashboards.

The product should save time and minimize configuration. Its operating principle is:

> Automate routine work. Ask users only when their judgment is genuinely needed.

The primary product loop is:

```text
Add or connect data
-> Understand and classify files
-> Prepare and explain the data
-> Create a versioned dataset
-> Generate a useful starter dashboard
-> Analyze, explore, and refine with one agent
-> Refresh deterministic results when the data changes
```

DataBreeze is not ten unrelated applications and is not a chat box that invents charts. AI interprets intent and proposes useful work. Typed deterministic services calculate displayed values, validate data, preserve versions, and bind evidence.

## 2. Approved product principles

1. **Immediate access:** There is no mandatory onboarding wizard. A signed-in user enters the complete product.
2. **One agent:** Bảng điều khiển, Dữ liệu, and Phân tích expose the same workspace agent through different layouts.
3. **Logical datasets first:** Users work with complete business datasets while retaining direct access to every source file and original document.
4. **Automatic but visible:** Routine classification, preparation, refresh, and dashboard generation happen automatically where policy allows. The product explains what happened and keeps recovery simple.
5. **Exception-based review:** Ambiguity, drift, mismatch, low-confidence OCR, incompatible joins, and security-sensitive effects ask for human judgment.
6. **Immutable evidence:** Original files and scans are never silently changed. Derived data and corrections create versions.
7. **Deterministic numbers:** AI may select, explain, and investigate. It does not become the authority for numeric results.
8. **Workspace permission first:** The agent can only retrieve or affect resources available to the current member.
9. **Low cognitive load:** Screens use strong defaults, plain Vietnamese, progressive disclosure, and one obvious primary action.
10. **Cost-aware by architecture:** Normal dashboard views, filtering, and compatible refreshes do not require repeated AI calls.

## 3. Authentication and account lifecycle

### 3.1 Sign-in methods

The authentication surface supports:

- Continue with Google.
- Email and password registration.
- Email and password sign-in.
- Password recovery.

A display name is not required during registration. The account may use an email-derived label until the user optionally adds profile information in Settings.

### 3.2 Email registration and verification

1. The user enters email, password, and password confirmation.
2. DataBreeze creates a bounded unverified registration and sends a six-digit OTP.
3. The OTP expires after 10 minutes, permits at most five failed attempts, and may be resent after 60 seconds.
4. Successful verification activates the account, creates its personal workspace, and signs the user in automatically.
5. Unverified registrations expire and are removed according to a declared retention policy.
6. Public responses do not disclose whether an email already owns an account.

Google sign-in treats the provider-verified email as verified. If it matches an existing password account that is not linked, DataBreeze requires the existing password or an email OTP before linking. It never merges accounts silently.

### 3.3 Persistent sessions

- There is no Keep me signed in checkbox.
- Web, Desktop, and mobile appear persistently signed in by default.
- Access credentials remain short-lived and rotate invisibly through server-tracked refresh families.
- Web refresh credentials remain in `HttpOnly`, `Secure`, appropriately scoped cookies and never in local storage.
- Desktop credentials remain in Windows Credential Manager or equivalent device-protected storage.
- Android credentials remain in Android Keystore-backed storage.
- Logout ends the current session and clears local session material.
- Security settings list active sessions and allow one or all sessions to be ended.
- Password recovery, account suspension, confirmed compromise, and explicit logout-all revoke affected session families.
- Sensitive account, membership, deletion, billing, and security actions use recent step-up authentication as required by IAM.

The persistent user experience does not permit non-expiring bearer tokens, plaintext credentials, or removal of server-side revocation.

## 4. Workspace and visible information architecture

### 4.1 Customer-visible hierarchy

The normal interface exposes:

```text
Account
└── Workspace
    ├── Datasets and source files
    ├── Dashboards and saved views
    ├── Agent conversations and analyses
    ├── Connected folders and devices
    ├── Members and permissions
    └── Settings and usage
```

IAM may retain Organization and Project records as internal tenant, billing, and authorization authorities. The default customer experience does not require users to understand or navigate those layers.

Every new verified account receives one personal workspace. The workspace switcher is hidden when the user has access to only one workspace and appears after the user creates or joins another.

Stores, product lines, periods, and business purposes are normally represented by datasets, dimensions, dashboards, or saved views, not by extra workspace or project layers.

### 4.2 Primary navigation

The application has exactly three primary destinations:

1. **Bảng điều khiển:** The dashboard canvas, dataset selector, personal filters, freshness, evidence, and contextual agent.
2. **Phân tích:** The full agent conversation experience and workspace conversation history.
3. **Dữ liệu:** Logical datasets, source files, review items, data health, transformations, versions, refresh, and evidence.

Notifications, global search, workspace switching, Desktop download, members, settings, security, usage, help, and logout are utilities rather than primary navigation destinations.

### 4.3 Web shell

- A narrow cobalt application rail contains the three primary destinations.
- Bảng điều khiển and Dữ liệu show a bottom-right agent entry point.
- Phân tích has no floating agent because its primary content is already the complete agent interface.
- Phân tích adds a collapsible Codex-style conversation-history column beside the rail.
- Collapsing history preserves a compact application rail and maximum working width.
- Web uses `Be Vietnam Pro` for Vietnamese and English interface text.

## 5. Members, sharing, and permissions

### 5.1 Visible roles

The normal interface presents three understandable roles:

- **Owner:** Workspace ownership, members, permissions, security, billing, data deletion, and all product capabilities.
- **Editor:** Dataset, connected-source, ETL, analysis, and dashboard editing within granted scope.
- **Viewer:** Read, filter, evidence inspection, and conversation reading within granted scope.

These visible roles map to the canonical IAM permission model. They do not replace server-side tenant, resource, policy, data-mode, approval, or action checks.

### 5.2 Agent access is independent

Agent permission is configured independently of visible role:

- **Không có quyền:** Cannot send messages to the agent.
- **Chỉ phân tích:** Can ask questions and create analyses without changing shared datasets or dashboards.
- **Đề xuất thay đổi:** Can create governed proposals that an authorized member must approve.
- **Áp dụng thay đổi:** Can confirm agent actions only when the member's ordinary permissions also allow the action.

Defaults are:

- Owner: Áp dụng thay đổi.
- Editor: Áp dụng thay đổi.
- Viewer: Không có quyền.

An Owner may grant a Viewer Chỉ phân tích without granting edit permission. An Editor may have agent access disabled without losing manual editing permission.

### 5.3 Workspace and dataset visibility

- Workspace members can see workspace datasets by default.
- An Owner may restrict a sensitive dataset to selected members.
- A restricted dataset also restricts its files, original documents, evidence, dashboards, materialized results, and attached conversations.
- The agent never bypasses dataset restrictions.
- Conversation continuation executes with the current sender's permissions, not the permissions of the conversation creator.
- Removing a member invalidates their access across Web, Desktop, mobile, synchronization, downloads, events, and agent retrieval.

### 5.4 Sharing boundary

V1 has no anonymous dashboards, public links, external guest dashboards, or unauthenticated evidence links. Dashboard access requires authenticated membership in the workspace. Adding or removing access uses workspace membership and dataset restrictions rather than a separate public publication flow.

Internal immutable DashboardVersions and DashboardSnapshots remain available for reproducibility, refresh consistency, restore, and audit even when the normal authoring interface does not display Draft or Publish terminology.

## 6. Data sources and ingestion

### 6.1 Core sources

V1 sources are:

- Web CSV upload.
- Web XLSX upload.
- Web image and PDF upload for supported OCR profiles.
- Desktop manual CSV, XLSX, image, and PDF selection.
- Desktop connected folders approved through the OS folder picker.
- Android camera capture and existing image or PDF selection.

Future database, API, cloud-drive, Slack, Discord, accounting, and streaming connectors remain outside the core release unless separately specified.

### 6.2 Logical dataset model

A dataset is a logical business container, not one source file. For example:

```text
Dataset: Doanh thu Cửa hàng TP.HCM
Sources:
- hcm-sales-jan.xlsx
- hcm-sales-feb.xlsx
- hcm-sales-mar.xlsx
- refunds-q1.csv
```

Each logical dataset includes:

- Source-file assignments and source type.
- Immutable original ArtifactVersions.
- Detected and governed schemas.
- Profiling and named quality dimensions.
- Transformation definitions and execution history.
- Prepared and accepted DatasetVersions.
- Rejected, quarantined, and unresolved counts.
- Refresh and synchronization history.
- Lineage and evidence.
- Dashboard and conversation bindings.

### 6.3 Dữ liệu views

Dữ liệu provides three entry views:

- **Bộ dữ liệu:** Logical datasets and their status.
- **Tệp nguồn:** Every uploaded or synchronized source file.
- **Cần xem xét:** Misplaced, incompatible, drifting, duplicate, unsupported, or uncertain inputs.

The dataset catalog is the default view. Opening a dataset shows a source-file list filtered to that dataset.

Each file row shows:

- Original filename.
- File type and source.
- Assigned dataset.
- Folder binding or Web upload origin.
- Workbook sheets where applicable.
- Row count and file version.
- Modified, discovered, processed, and synchronized time.
- ETL state, named quality summary, and review warnings.

Desktop may show the exact local path under its approved folder capability. Web receives only the source metadata explicitly approved for cloud transfer. It never reconstructs or displays an unapproved local path. Whether a Desktop filename becomes cloud-visible source metadata is governed by the connected-source transfer manifest and must be reconciled as identified in Section 17.

Opening a file displays the preserved original in a safe viewer:

- XLSX: Worksheets, cells, and formulas without macros, external refresh, or active content execution.
- CSV: Original rows and columns.
- Image or PDF: Original document viewer with zoom, rotation, and permitted download.
- Receipt or invoice: Original image beside extracted fields and highlighted evidence coordinates.

The same view provides prepared data, before and after transformations, assignment, evidence, version history, and an Ask the agent about this file action.

## 7. Intelligent connected folders

### 7.1 Connected-source behavior

Desktop treats an explicitly approved folder as an intelligent data source. Users may continue placing files into it. Desktop performs stable-file checks, content hashing, type validation, schema inspection, and classification without granting cloud services arbitrary filesystem access.

The classifier considers:

- Folder hierarchy.
- File and worksheet names.
- Column names and detected types.
- Schema similarity.
- Store, product, region, currency, and reporting-period values.
- Duplicate and overlapping periods.
- Previously approved classifications.
- Saved typed mappings and rules.

DataBreeze proposes or creates provisional logical groups such as:

```text
Doanh thu Cửa hàng Hà Nội
Doanh thu Cửa hàng TP.HCM
Kho hàng
Chi phí marketing
Cần phân loại
```

Ambiguous files are never silently accepted into a trusted calculation.

### 7.2 Misplaced-file review

When a file appears to belong elsewhere, Desktop opens a Nằm sai vị trí review surface containing:

- Filename and current permitted location.
- Suggested logical dataset and permitted destination folder.
- Confidence and plain-language reasons.
- Detected store, product, period, and identifying fields.
- A bounded source-data sample.
- Current and suggested schema comparison.
- Duplicate, overlap, and quality warnings.

Actions are:

- Chuyển đến vị trí đề xuất.
- Giữ tại vị trí hiện tại.
- Chọn dữ liệu hoặc thư mục khác.
- Xem toàn bộ dữ liệu.
- Xử lý sau.

An approved move verifies the destination grant, collision state, content hash, and resulting assignment. It never overwrites a destination silently. It records an effect receipt and undo path. Keeping the file records a file-specific approved exception unless the user explicitly creates a broader reusable rule.

### 7.3 Pending-review dashboard behavior

- The logical dataset appears in the Dashboard dataset selector even when it has unresolved files.
- A new dataset opens its preparation and resolution flow in the workspace before trusted dashboard calculations are released.
- An existing dashboard continues showing its last accepted complete DatasetVersion.
- New unresolved files are excluded from trusted calculations and disclosed in a visible freshness or review banner.
- Resolution creates a new version and triggers deterministic dashboard refresh.
- The conversation records which dataset version changed.

### 7.4 Cloud synchronization of connected folders

For the approved cloud-connected source experience, the folder connection flow clearly obtains permission to upload encrypted immutable originals, prepared dataset versions, lineage, and evidence to the selected workspace. This lets Web continue operating after Desktop finishes synchronization or goes offline.

The user-facing source label is Thư mục được kết nối or Desktop Folder Sync. It is distinct from the canonical DSO data-mode policy. A workspace governed as `LOCAL` must continue to obey DSK-010, WEB-005, WEB-023, AND-008, DDA-037, and DDA-039. This design does not authorize a connected-folder label to bypass Local or Hybrid transfer controls.

## 8. Automatic preparation and data health

### 8.1 Versioned automatic preparation

DataBreeze profiles and prepares data automatically where the effective policy and an already accepted typed rule permit it. It never edits original source files.

Safe deterministic operations may include:

- Trimming accidental whitespace.
- Parsing unambiguous numbers.
- Standardizing capitalization under a declared rule.
- Normalizing unambiguous date formats.
- Removing completely empty rows while counting them.

Ambiguous or material operations include:

- Merging category meanings.
- Interpreting missing values.
- Removing possible duplicates.
- Filling or inferring values.
- Converting currency or units.
- Joining datasets.
- Deleting non-empty rows.
- Changing column meaning.

Ambiguous operations create review or governed proposals and do not silently enter a trusted version.

### 8.2 Post-run explanation

After an allowed automatic run, the Data Health surface shows:

- Overall quality summary before and after.
- Separate completeness, validity, uniqueness, consistency, freshness, and extraction-confidence dimensions.
- The declared formula and limitations for any combined health score.
- Number of rows and fields processed.
- Every transformation applied.
- Before and after samples.
- Values not corrected confidently.
- Files or scopes rejected or quarantined.
- Warnings that may affect dashboard interpretation.
- Exact DatasetVersion and engine version.
- Restore or undo path.

The interface must not label a health score as percentage correct. It cannot prove factual correctness without ground truth.

Users may tell the agent to correct a rule, restore a previous version, preserve a duplicate, remap a category, or reinterpret a column. The agent produces a typed proposal or versioned correction according to permission and policy.

### 8.3 Notification behavior

- First import opens the complete preparation summary.
- Compatible routine refresh displays a compact in-app completion summary.
- Material mismatch, drift, low-confidence extraction, or failed processing opens a review item.
- Desktop uses a system notification only when a connected source needs attention or synchronization fails.
- The complete report remains available through Dữ liệu and the agent.

## 9. OCR and original-document evidence

OCR is a core ingestion capability across Web, Desktop, and Android.

Initial profiles are:

1. Receipt and invoice extraction.
2. Table extraction from an image or PDF into a governed tabular candidate.

The receipt and invoice profile includes:

- Merchant or supplier.
- Date and time.
- Receipt or invoice number.
- Currency.
- Subtotal, tax, discount, fees, and total.
- Payment method where available.
- Line items, quantity, and unit price where available.
- Field confidence, adapter and model version, and evidence coordinates.

Flow:

```text
Image or PDF
-> Preserve encrypted immutable original
-> Extract typed candidates
-> Validate totals, types, dates, currency, and duplicates
-> Review uncertain fields
-> Accept a governed record version
-> Refresh the logical dataset and affected dashboard
```

The original image or PDF remains attached to the extracted record for as long as the governed dataset and retention policy require it, unless an authorized Owner completes a deletion workflow.

Users can drill from a dashboard value to contributing transactions, select one transaction, and open its original receipt with relevant fields highlighted. Corrections create new extraction or dataset versions and never alter the original image.

## 10. One agent across the product

### 10.1 Surfaces

- Web Bảng điều khiển and Dữ liệu expose the agent through a bottom-right compact entry point.
- Web Phân tích is the full agent interface and has no redundant floating agent.
- Desktop Bảng điều khiển and Dữ liệu use the approved V2 docked agent panel.
- Desktop Phân tích uses the full main work area and removes the separate dock.
- Mobile exposes a full-screen agent suited to the smaller surface.

The compact agent and Phân tích use the same conversation store, permissions, tools, and analytical capabilities. Phân tích provides more space and complete history rather than a different agent.

### 10.2 Capabilities

Within current permissions, the agent may:

- Analyze permitted datasets.
- Answer business questions.
- Calculate metrics and comparisons through deterministic tools.
- Find trends, anomalies, and possible contributing factors.
- Compare stores, products, periods, or compatible datasets.
- Create bounded tables, summaries, and chart proposals.
- Explain metrics, formulas, filters, freshness, and evidence.
- Drill into contributing records.
- Open source files, receipts, and evidence.
- Explain data-health dimensions and transformations.
- Identify possible data-quality problems.
- Propose mapping, ETL, dataset, or dashboard corrections.
- Add, remove, change, or rearrange dashboard widgets when authorized and explicitly confirmed.
- Change or reset personal filters.
- Continue or open saved conversations.

Answers may contain plain-language explanation, deterministic values, interactive tables, temporary charts, evidence links, suggested next questions, and governed change proposals.

If available data cannot support the answer, the agent names missing, unavailable, unauthorized, ambiguous, stale, or quality-blocked inputs rather than guessing.

### 10.3 Bounded context management

The complete conversation and data remain stored by DataBreeze. They are not resent to the model on every message.

Each turn assembles a bounded context package containing only what is relevant and permitted:

- Current workspace and member permissions.
- Current navigation surface.
- Selected dashboard and datasets.
- Exact dataset-version identifiers and compact schemas.
- Active filters and selected chart or data point.
- A rolling conversation summary.
- Recent and retrieved relevant messages.
- Retrieved result cells and evidence required for the question.

The model does not receive whole unrelated conversations or full datasets by default. It uses typed tools such as:

```text
inspect_dataset_schema()
profile_columns()
query_dataset()
calculate_metric()
compare_dataset_versions()
retrieve_evidence()
create_chart_proposal()
create_etl_proposal()
```

Deterministic services enforce authorization, bounds, result shape, provenance, and cost before returning a result.

### 10.4 Conversation history and data context

Conversations belong to the workspace. History items display their dataset context before opening, for example:

```text
Vì sao doanh thu tháng 7 giảm?
Doanh thu TP.HCM · phiên bản 7
Dashboard: Doanh thu tổng quan
```

Opening a conversation restores its original datasets, dashboard, personal filters, selected chart or point, and recorded version context, subject to current authorization.

Previous answers remain bound to the versions that produced them. When the user sends a new message and compatible newer data exists, DataBreeze automatically uses the latest version and inserts a visible context event:

```text
Dữ liệu đã được cập nhật
Doanh thu TP.HCM: phiên bản 7 -> phiên bản 8
Câu trả lời tiếp theo sử dụng dữ liệu mới nhất.
```

Old answers are not rewritten. New answers display the dataset versions used. Removed or changed required fields produce an incompatibility explanation before analysis continues.

Users may select Thêm dữ liệu to attach more datasets. DataBreeze validates schema compatibility, mapping, join paths, grain, units, duplication risk, and permissions before combining them.

The Phân tích history supports search, new conversation, rename, pin, archive, and delete according to workspace policy.

## 11. Dashboard behavior

### 11.1 Automatic starter dashboard

After a new prepared dataset becomes eligible for analysis, DataBreeze creates a useful starter dashboard based on:

- Dates and time periods.
- Numeric measures.
- Categories such as store, product, and region.
- Detected business meaning.
- Trends, comparisons, top and bottom performers, anomalies, and relevant details.
- Quality, confidence, freshness, and evidence availability.

AI may select a useful presentation. Deterministic services calculate every metric and chart result.

If the dataset is unclear, the starter experience contains only supported content and states what information is missing.

### 11.2 Dataset selection and comparison

- One logical dataset is active by default.
- Selecting a different dataset loads that dataset's own saved dashboard canvas rather than rebinding an unrelated canvas silently.
- So sánh dữ liệu explicitly combines compatible datasets.
- Incompatible datasets open mapping or relationship assistance instead of being silently merged.
- Each dataset retains its own dashboard layout and typed widget definitions.
- Normal compatible refresh updates values without asking AI to redesign the canvas.

### 11.3 Personal filters and saved views

- DataBreeze creates useful filters from permitted dates and categorical fields.
- Personal filtering never changes another member's dashboard state.
- Chart selections may filter the canvas when the interaction is typed and declared.
- The agent receives active filter context.
- Đặt lại bộ lọc restores the personal default.
- Users may save a named personal view, such as Hà Nội · Q2 2026.
- Saving a shared default requires dashboard-edit permission.

### 11.4 Canvas and widget changes

The canvas follows the approved dashboard design in `docs/plans/404-dashboard-workspace-redesign-design.md`:

- Responsive 12-column logical grid.
- Stable page and widget identifiers.
- Accessible KPI, table, bar, line/area, pie/donut, and text/evidence-note widgets from the canonical V1 allowlist.
- Move, resize, configure, remove, restore, and compatible duplicate behavior.
- Evidence, freshness, warnings, and fallback tables remain visible across breakpoints.
- Manual edits autosave through revision preconditions.

The agent may analyze freely within permission, but a shared canvas mutation remains governed:

1. The agent explains the proposed change.
2. It presents compatible chart or change previews.
3. Selection alone does not mutate the canvas.
4. The user explicitly confirms.
5. The server creates a new immutable parented DashboardVersion.
6. The canvas autosaves and offers restore or undo.

Temporary charts and conversation-scoped exploratory results may remain inside a workspace conversation. Saving them to a shared dashboard requires dashboard-edit permission.

## 12. Platform-specific experience

### 12.1 Web

Web is the complete cloud workspace for:

- Authentication and workspace access.
- File and document upload.
- Datasets, source-file viewing, data health, transformations, and versions.
- Full agent conversation history and analysis.
- Dashboard canvas, filters, evidence, and agent.
- Member, permission, security, usage, retention, and device administration.

Web uses the simple three-item rail and dashboard-focused visual language approved in the dashboard workspace design.

### 12.2 Windows Desktop V2

Desktop uses the approved premium native V2 workbench. It is not the Web application placed inside an Electron frame.

The V2 shell contains:

- A narrow cobalt activity rail.
- A source explorer for connected folders, logical datasets, cloud sources, review items, and recent analyses.
- A central tabbed work area.
- Tabs for datasets, original files, receipts, ETL reports, dashboards, and analyses.
- A docked agent on Bảng điều khiển and Dữ liệu.
- No separate dock when Phân tích occupies the full work area.
- A compact status bar for folder monitoring, synchronization, processing engine health, and pending review.
- A premium light visual language using `Be Vietnam Pro`, soft cobalt surfaces, restrained borders, moderate radii, quiet depth, and deliberate spacing.

Desktop additionally owns:

- OS-approved folder connection.
- File stability, hashing, and watch-event deduplication.
- Local source classification.
- Misplaced-file review and safe reversible file movement.
- Background synchronization and resumable transfer.
- Direct original-file access within local capabilities.
- Local engine supervision and safe status.

Desktop shares public contracts, datasets, dashboard definitions, conversations, permissions, and cloud state with Web while retaining its distinct native layout.

### 12.3 Android

Android focuses on fast capture and review:

- Photograph receipts, invoices, and tables.
- Select existing images or PDFs.
- Preserve original captures.
- Review uncertain OCR fields.
- Choose or create a logical dataset.
- View queue and synchronization state.
- View responsive dashboards and drill-down summaries.
- Ask the permitted workspace agent questions.

Complex dashboard canvas authoring remains Web and Desktop scope. Android remains native Kotlin and Compose and consumes generated contracts.

## 13. Storage, synchronization, and refresh

### 13.1 Cloud records

Subject to data-mode policy and explicit transfer authorization, the cloud stores:

- Encrypted immutable source originals.
- OCR candidates, accepted extraction versions, and evidence coordinates.
- Logical datasets and source assignments.
- Prepared and accepted DatasetVersions.
- Schemas, mappings, typed transformations, metrics, and lineage.
- Rejected and quarantined manifests.
- DashboardVersions, DashboardSnapshots, and cached materialized results.
- Conversations, summaries, retrieved-result references, and context events.
- Permissions, audit events, usage, and synchronization state.

IAE remains authoritative for content, retention, deletion, legal hold, evidence, and recovery. DDA does not delete content directly.

### 13.2 Compatible refresh path

```text
New or changed source
-> Stable-file and content validation
-> Classification against saved policy
-> Apply compatible accepted typed rules
-> Create a new DatasetVersion
-> Resolve affected dashboard dependencies
-> Recalculate only affected deterministic results when safe
-> Atomically publish a complete DashboardSnapshot
-> Notify clients and record a conversation context change
```

- Stable identities and content hashes prevent duplicate processing.
- Interrupted uploads resume from verified parts.
- Duplicate and out-of-order events reconcile idempotently.
- Conflicts and incompatible drift create review items.
- The last complete authorized snapshot remains visible when refresh fails.
- Web and Desktop show source, synchronization, and freshness status.

## 14. Cost control and provider use

OpenAI or another approved provider is used only where interpretation adds value:

- Dataset meaning and ambiguous classification.
- OCR extraction.
- Ambiguous mapping assistance.
- Dashboard design proposals.
- Natural-language analysis and explanation.

The system avoids provider calls for:

- Ordinary dashboard page views.
- Personal filter changes.
- Compatible deterministic refresh.
- Reopening a cached accepted result.
- Exact metric calculation.
- Original-file viewing.

Conversation context is bounded and retrieved. Dashboard materialization is cached by complete tenant, permission, input, definition, parameter, locale, policy, and engine identity. Only affected dependencies are invalidated.

Workspace Owners can configure agent availability, provider policy, member access, and usage limits. A materially expensive request shows a safe cost estimate before execution when the canonical entitlement or admission policy requires it.

## 15. Notifications and deferred integrations

Core notification channels are:

- In-app notification center.
- Desktop system notifications for connected-source problems and synchronization failure.
- Email for registration OTP, password recovery, and serious account-security events.

Routine successful refreshes remain quiet unless the user enables them. Related in-app events are grouped.

Slack, Discord, advanced external routing, and agent interaction through external chat platforms are backlogged. They are not release gates for the core product.

## 16. Reliability, accessibility, and verification

### 16.1 Required failure behavior

- Interrupted uploads resume safely.
- Duplicate source content does not create duplicate accepted records.
- Locked, partial, or changing Desktop files wait for stability.
- Desktop offline state preserves queued work without claiming cloud completion.
- Processing failure creates a stable review item and safe retry.
- Provider failure preserves original-file viewing, saved dashboards, deterministic ETL, and typed manual analysis.
- Low-confidence OCR opens review with the original image.
- Incompatible data changes leave the last valid dashboard available with a clear reason.
- Autosave conflicts use expected revisions and never silently discard another member's changes.
- Account or dataset authorization loss removes access without leaking names, counts, samples, or evidence.

### 16.2 Accessibility and localization

- Vietnamese is the default complete locale and English is complete.
- Web meets WCAG 2.2 AA for core workflows.
- Desktop supports keyboard, screen reader, high contrast, reduced motion, and Windows scaling.
- Android supports TalkBack, switch access, font scaling, high contrast, and non-color cues.
- Charts provide accessible summaries and permission-filtered fallback tables.
- All states use text or shape in addition to color.
- Product copy avoids unexplained technical terms and does not use health language that implies factual correctness.

### 16.3 Required end-to-end verification

Implementation plans must link tests to stable requirement IDs and cover:

- Email/password registration, OTP verification, Google sign-in, account linking, recovery, persistent sessions, logout, and session invalidation.
- Workspace creation, membership, visible-role mapping, independent agent permission, dataset restrictions, and tenant isolation.
- Web upload and resumable failure recovery.
- Desktop folder selection, stable-file monitoring, duplicates, classification, misplaced-file review, safe move, undo, offline queue, and synchronization.
- Dataset grouping, source-file catalog, safe original viewer, transformations, health dimensions, version restore, rejected counts, and lineage.
- Receipt/invoice and table OCR, low-confidence review, duplicate detection, immutable original evidence, and drill-down.
- Automatic starter-dashboard proposal or generation according to the approved canonical workflow.
- Deterministic calculations, dashboard filters, personal views, comparison, refresh, and last-good snapshot behavior.
- Floating and docked agent surfaces, full Phân tích history, bounded context retrieval, permission enforcement, old-version restoration, and latest-version context events.
- Canvas proposal preview, explicit confirmation, immutable version creation, autosave conflict recovery, evidence, and accessibility.
- Web/Desktop/mobile synchronization and revocation.
- Vietnamese and English completeness.
- Backup and restoration of cloud content and metadata.
- AI-disabled and provider-outage deterministic fallback.

## 17. Normative deltas required before implementation

The following approved experience decisions were reconciled into canonical specifications for plan 406 on 2026-08-12. Implementation uses the stable requirement IDs listed below. Existing IDs retained their original meaning.

| Area | Approved experience | Canonical outcome | Requirement IDs |
|---|---|---|---|
| Email authentication | Email/password plus six-digit OTP verification, with Google OIDC | IAM authentication, verification, recovery, admission, session, and acceptance amended without weakening IAM-005, IAM-006, IAM-012, or IAM-015. | IAM-022 |
| Persistent Web session | ChatGPT-like persistent sign-in without a Keep me signed in control | Refresh-family lifetime fixed: Web 30/180 days; Desktop/Android 90/365 days; access token at most 15 minutes. | IAM-023 |
| Visible roles | Owner, Editor, and Viewer in normal UI | UI-safe presets map to the six canonical server roles; server authorization remains deny-by-default. | IAM-025 |
| Independent agent permission | Agent use is independent of edit role | Workspace-member grant levels `NONE`/`ANALYZE`/`PROPOSE_CHANGES`/`APPLY_CONFIRMED_CHANGES`; Viewer defaults to `NONE`. | IAM-024 |
| Automatic first preparation | Routine transformations run automatically and are explained afterward | First-run auto-accept only under `SAFE_NON_LOSSY`; otherwise review remains mandatory. | DDA-053 |
| Automatic starter dashboard | A useful first canvas appears as soon as an eligible prepared dataset is ready | Private deterministic allowlisted starter version only; AI/shared-canvas changes remain proposals. | DDA-054 |
| Connected-folder cloud upload | Encrypted originals and prepared versions synchronize so Web remains usable | Explicit Cloud/Hybrid projection consent with preview; `LOCAL` remains non-transferable. | DDA-059 |
| Source catalog and safe originals | Logical datasets list sources and open originals without Local paths | Permission-filtered catalog with opaque IDs and safe labels. | DDA-052 |
| Workspace conversations | Conversations are workspace-owned, dataset-scoped, and permission-filtered | Conversation records, retention, and context events are canonical. | DDA-055, DDA-056 |
| Table OCR | Receipt/invoice and generic table extraction are core ingestion profiles | Versioned extraction profiles with bounds, confidence, evidence, and review. | DDA-057 |
| Workspace-only dashboards | No anonymous, public, or external guest dashboards in V1 | Snapshot audiences narrowed to Owner, Workspace members, or Project members. | DDA-058 |
| Bounded agent tools | Agent invokes only registered typed tools | Server-side tenant, grant, usage, evidence, and audit enforcement. | DDA-060 |
| Web information architecture | Exactly three primary destinations and one agent store | Canonical Web navigation and agent layout. | WEB-024 |
| Desktop V2 workbench | Distinct cobalt rail, source explorer, tabs, docked agent, status bar | New platform requirement; existing offline recipe IDs DSK-024 through DSK-026 remain unchanged. | DSK-027 |
| Android bounded capture | Receipt/invoice/table capture, review, dashboard, and agent analysis | New platform requirement; existing offline-package exporter AND-023 remains unchanged. | AND-024 |

ID assignment note: plan 406 draft text proposed `DSK-024` and `AND-023` for the new platform surfaces, but those IDs were already allocated to offline recipe and offline-package requirements. Canonical documents therefore use `DSK-027` and `AND-024` so existing IDs retain their original meaning.

No implementation plan may treat the historical delta register as permission to bypass security, tenant isolation, data-mode, retention, approval, evidence, or audit requirements.

## 18. Deferred scope

- Public or anonymous dashboard links.
- External guest access.
- Slack and Discord notifications or agent chat.
- Broad database, API, cloud-drive, accounting, or marketplace connectors.
- Genuine second-by-second streaming.
- Arbitrary SQL, Python, JavaScript, chart code, macros, shell, or remote-control execution.
- Full complex dashboard canvas editing on Android.
- General unbounded document understanding outside published extraction profiles.
- AI-authored authoritative numeric values.
- Silent data movement across policy boundaries.

## 19. Approved decisions

The user approved these decisions during brainstorming and visual review:

1. Approach A: A unified workspace with automatic processing, visible datasets, trustworthy evidence, and an editable dashboard canvas.
2. Google and email/password authentication with OTP verification and automatic sign-in.
3. Persistent sign-in with no Keep me signed in checkbox.
4. No onboarding wizard.
5. One automatic personal workspace with hidden internal organization and project complexity.
6. Exactly three primary navigation destinations: Bảng điều khiển, Phân tích, and Dữ liệu.
7. A compact cobalt rail with Codex-style history inside Phân tích.
8. The floating agent appears on Web Bảng điều khiển and Dữ liệu, not inside Phân tích.
9. One workspace agent with full permitted analytical capability and bounded retrieved model context.
10. Conversations show datasets before opening, restore original context, and visibly switch new requests to the latest compatible version.
11. Workspace-owned conversations and default workspace-wide dataset visibility with optional sensitive-dataset restrictions.
12. Viewer has no agent-chat permission by default; agent access is independently configurable.
13. No public, anonymous, or guest dashboard sharing.
14. Logical datasets contain multiple source files and remain directly browsable at file level.
15. Original XLSX, CSV, image, PDF, receipt, and invoice content remains viewable through safe viewers.
16. Connected Desktop folders are intelligent monitored sources whose approved cloud projection remains usable on Web.
17. Misplaced files open a rich review surface with samples, reasons, destination, keep, move, reassign, and process-later actions.
18. Pending files remain visible through the dashboard flow while the last trusted version remains authoritative.
19. Routine ETL is automatic, transparent, versioned, and reversible, subject to the normative reconciliation in Section 17.
20. Starter dashboards are generated automatically from eligible data, subject to the normative reconciliation in Section 17.
21. Selecting another dataset loads its own canvas; comparison is an explicit action.
22. Filters are personal by default and may be saved as named views.
23. The compact dashboard and data agent can analyze anything supported by permitted data, not only edit charts.
24. OCR and preserved original scan evidence are core product capabilities.
25. Web and Desktop have distinct interfaces while sharing governed contracts and cloud state.
26. The premium Desktop V2 concept is the selected Desktop visual direction.
27. In-app notifications are core. Email is limited to OTP, recovery, and serious security events. External notification integrations are backlogged.
28. Customer ease, automatic defaults, reversible work, and exception-based review are primary product principles.
