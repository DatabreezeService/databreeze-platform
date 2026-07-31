# DataBreeze Product Definition

**Status:** Product specification<br>
**Version:** 1.0<br>
**Audience:** Product, design, engineering, operations, and future implementation agents

## 1. Definition

DataBreeze is a Vietnamese-first, local-first business data workspace that turns user-controlled files, documents, photos, voice notes, and datasets into trustworthy actions and reports.

Its product promise is:

> Your data work, handled.

DataBreeze is not ten disconnected tools. It is one governed platform with a shared Inbox, artifact and evidence model, processing engine, recipes, jobs, reviews, permissions, audit history, and three complementary applications:

- **Web** is the complete organizational and cloud workspace.
- **Windows Desktop** is the local file and heavy-processing agent.
- **Android** is the capture, review, notification, and approval companion.

The [platform and feature matrix](platform-feature-matrix.md) shows the responsibility of every module on each application.

## 2. Problem

Vietnamese individuals and small businesses repeatedly handle important data through spreadsheets, PDFs, scans, photographs, email attachments, shared folders, and exported reports. The work is fragmented and manual:

- Files arrive in inconsistent formats and naming conventions.
- People repeatedly copy, clean, map, compare, reconcile, and reformat data.
- Decisions are made from numbers that are difficult to trace back to their source.
- Sensitive files may not be suitable for uploading to an unknown cloud processor.
- Marketplace and enterprise APIs may be unavailable, restricted to certified partners, unstable, or commercially impractical.
- Existing automation tools are often too technical, too cloud-dependent, or unsafe around local files.

DataBreeze reduces that repeated work while preserving evidence, human control, and data-location choice.

## 3. Product Outcome

A successful DataBreeze workflow has five properties:

1. **Easy intake:** A user saves, shares, scans, records, selects, or uploads information once.
2. **Controlled processing:** DataBreeze executes a typed job locally or in the cloud according to policy.
3. **Traceable results:** Every material value or finding links to its source file, page, sheet, cell, row, or capture.
4. **Safe action:** Low-confidence or consequential actions require review, preview, or approval.
5. **Reusable work:** The approved mapping, rule, recipe, or report becomes repeatable rather than a one-off task.

## 4. Product Pillars

### User-controlled data

The primary inputs are data users already possess or are authorized to access: local folders, uploads, Android shares, photographs, scans, voice notes, email attachments forwarded by the user, databases configured by an administrator, and optional public or authorized connectors.

No core workflow requires DataBreeze to hold a privileged Shopee, TikTok Shop, ERP, accounting, or advertising partnership.

### Local-first, cloud-capable

Users choose whether originals remain local, synchronize selectively, or live in the cloud. Hybrid is the default because it provides useful collaboration without requiring every original to leave the device.

### Evidence before confidence

DataBreeze must show why it produced an output. Deterministic rules support consequential conclusions. AI may classify, suggest, summarize, and explain, but it does not erase provenance or silently become the source of truth.

### Human-controlled automation

The desktop application is not an unrestricted remote-control agent. It receives signed typed jobs, operates only within approved capabilities, previews sensitive changes, records an audit trail, and supports recovery or undo where a mutation occurs.

### One platform, modular value

Every module stands on its own but becomes more useful with shared artifacts, governed datasets, rules, suppliers, templates, evidence, approvals, and reports.

## 5. Product Modules

| Module | Outcome |
|---|---|
| **DataBreeze Quote Intelligence** | Normalize and compare supplier quotes using landed cost, weighted criteria, and source evidence. |
| **DataBreeze Spreadsheet Auditor** | Find risky formulas, structural inconsistencies, and data-quality problems and propose safe repairs. |
| **DataBreeze Invoice Leak Detector** | Find duplicates, overcharges, and contract or rate mismatches and assemble dispute evidence. |
| **DataBreeze Embedded Importer** | Let another product embed DataBreeze mapping, validation, import, and review capabilities. |
| **DataBreeze Client Report Factory** | Turn governed data and reusable templates into versioned, reviewable client reports. |
| **DataBreeze Migration Ready** | Profile, map, clean, deduplicate, dry-run, reconcile, and export migration-ready data. |
| **DataBreeze Folder Autopilot** | Apply safe, repeatable recipes to files placed in explicitly approved folders. |
| **DataBreeze Data Quality Guard** | Monitor data rules, drift, reconciliation, incidents, and proposed repairs over time. |
| **DataBreeze Private Data Analyst** | Answer questions and produce analysis over governed local or cloud data with evidence. |
| **DataBreeze Operations Capture** | Capture structured operational records through Android camera, forms, voice, barcode, and signatures. |

E-commerce profit analysis remains a supported solution assembled from importer templates, governed datasets, quality rules, reports, and the private analyst. It is not the boundary of the product.

## 6. Platform Responsibilities

### Web

Web owns account and organization management, workspaces, projects, roles, billing, cloud artifacts, schema and recipe design, collaboration, dashboards, approvals, reports, API keys, webhooks, device administration, security policies, audit history, and cloud-capable execution.

### Windows Desktop

Desktop owns approved-folder access, local and sensitive file processing, large spreadsheet and document work, folder recipes, offline execution, previews, safe file mutations, local evidence, and selective synchronization.

### Android

Android owns field capture, Android Share intake, offline records, camera and barcode workflows, voice notes, notifications, exception review, approvals, and concise report consumption. It is not a miniature desktop application.

## 7. Data Modes

| Mode | Original data | Synchronized data | Intended use |
|---|---|---|---|
| **Local** | Remains on an authorized source device: normally Desktop for files and Android for locally captured records until an explicit local transfer/export. | Operational metadata and explicitly approved derived results only. | Highly sensitive or offline-first work. |
| **Hybrid** | May remain local or be uploaded per artifact. | Structured records, evidence excerpts, status, and selected reports according to policy. | Default for individuals and teams. |
| **Cloud** | Stored in workspace-controlled object storage. | Available to authorized web, desktop, and Android clients. | Collaboration and cloud execution. |

The interface must always show where an original lives and what will synchronize before a user commits a sensitive action.

## 8. Target Market and Positioning

Initial users are Vietnamese solo operators, SMEs, agencies, accountants, procurement staff, operations teams, analysts, and technical service providers who already work with business files but do not want to build and maintain custom data pipelines.

DataBreeze should be positioned as a calm operating workspace, not a generic AI chat product:

> Turn the business data you already have into checked, traceable work—without coding or giving up control of your files.

## 9. Business Model Direction

The product supports a free or low-cost individual entry point and paid tiers based on durable value drivers:

- Active workspaces and members
- Registered desktop devices
- Cloud storage and retention
- Monthly processed pages, rows, or compute units
- Scheduled recipes and monitors
- Advanced approvals, audit retention, and client branding
- Embedded Importer API and SDK usage

Local processing must not be presented as unlimited if it creates support, update, or synchronization costs. Entitlements remain understandable and are enforced without destroying customer data.

## 10. Non-goals

DataBreeze will not:

- Scrape authenticated websites or bypass vendor access controls.
- Depend on certification from a marketplace for its core value.
- Act as an unrestricted remote administration tool.
- Replace a complete ERP, CRM, accounting ledger, marketplace, or payment system.
- Execute payments or financial transfers from a detected finding.
- Silently overwrite original customer files.
- Present untraceable AI output as a verified fact.
- Build every module simultaneously.

## 11. Product Success

The product succeeds when users:

- Reach a first trustworthy result without technical assistance.
- Repeat a workflow with materially less manual work.
- Can trace findings and generated values to their sources.
- Keep exception and correction rates visible rather than hidden.
- Continue using recipes, rules, and reports after the first month.
- Confidently select Local, Hybrid, or Cloud based on clear information.
- Add modules because shared data makes them more valuable, not because of forced bundling.
