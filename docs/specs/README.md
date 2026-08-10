# DataBreeze Specification Index

**Status:** Product specification<br>
**Version:** 2.0

This directory contains normative product behavior. Product and architecture documents provide context and constraints; the specifications below provide stable requirement IDs and acceptance criteria.

The first product version is one [Data-to-Dashboard Agent](features/data-to-dashboard-agent.md) across Web, Windows Desktop, and Android. The ten earlier feature specifications are retained as post-V1 specialist extensions and are not simultaneous first-release commitments.

## 1. Priority

- **P0:** Required for the capability's first production release or for platform safety.
- **P1:** Required for the complete generally available capability; it may follow an explicitly limited beta.
- **P2:** Designed extension that must not distort the foundation but is not committed to the first general release.

P0 applies to the named capability, not automatically to the first DataBreeze product release. A post-V1 specialist module retains its P0 requirements for that module's eventual first production release.

## 2. TenantScope contract

`TenantScope` is normative shorthand for `organizationId + workspaceId`, plus `projectId` when the resource belongs to a project. Every persisted tenant-owned row, cache entry, materialization, object key, event subscription, and tenant-sensitive composite foreign key includes the full applicable scope even when an illustrative schema, API example, or entity table omits those fields for brevity. A child row must carry and validate the same scope as its parent; an unscoped ID match never authorizes access, cache reuse, referential integrity, or evidence resolution.

## 3. Foundation specifications

| Prefix | Specification | Purpose |
|---|---|---|
| IAM | [Identity, workspaces, and permissions](foundation/identity-workspaces-permissions.md) | Tenant, membership, role, session, Device identity, and authorization foundation |
| IAE | [Inbox, artifacts, and evidence](foundation/inbox-artifacts-evidence.md) | Intake, immutable versions, bytes, lineage evidence, retention, and deletion |
| JRA | [Jobs, recipes, and approvals](foundation/jobs-recipes-approvals.md) | Typed automation, durable work, findings/review, approval, and result manifests |
| DSO | [Devices, sync, and offline](foundation/devices-sync-offline.md) | Device capabilities/grants, Hybrid-default data modes, synchronization, transfer, and offline queues |
| DSM | [Datasets, schemas, rules, and mappings](foundation/datasets-schemas-rules-mappings.md) | Governed datasets, schemas, semantics, metrics, mappings, typed transforms, quality, and lineage |
| INT | [Integrations, public API, and webhooks](foundation/integrations-api-webhooks.md) | Public protocol rules, connector boundaries, credentials, receipts, and delivery |
| NCO | [Notifications and collaboration](foundation/notifications-collaboration.md) | Assignments, comments, mentions, delivery, and safe previews |
| BUA | [Billing, usage, and administration](foundation/billing-usage-administration.md) | Entitlements, metering, plan behavior, limits, and administration |
| AUD | [Audit Ledger](foundation/audit-ledger.md) | Append-only attributable history, safe query/export, integrity, retention, and legal hold |

## 4. Platform specifications

| Prefix | Specification | Primary responsibility in V1 |
|---|---|---|
| WEB | [Web](platforms/web.md) | Cloud intake/ETL, analyst, dashboard canvas, publication, sharing, and administration |
| DSK | [Windows Desktop](platforms/desktop.md) | Approved-folder intake, local processing/analysis/evidence, offline work, and Hybrid publication |
| AND | [Android](platforms/android.md) | Active receipt/document capture, secure upload/review, dashboard consumption, and focused analysis |

## 5. Core V1 feature specification

| Prefix | Feature | V1 role |
|---|---|---|
| DDA | [Data-to-Dashboard Agent](features/data-to-dashboard-agent.md) | Composes governed intake, visible ETL/quality review, typed analyst, editable dashboard canvas, Hybrid folder flow, mobile receipt capture, and event-updated materialized snapshots |

DDA owns dashboard/product composition only. It references foundation records and version-bound public contracts; it does not copy their authorities or directly access a specialist feature's persistence.

## 6. Post-V1 specialist extension specifications

| Prefix | Specialist extension | Product status |
|---|---|---|
| QI | [Quote Intelligence](features/quote-intelligence.md) | Retained design; post-V1 planning |
| SA | [Spreadsheet Auditor](features/spreadsheet-auditor.md) | Retained design; post-V1 planning |
| ILD | [Invoice Leak Detector](features/invoice-leak-detector.md) | Retained design; post-V1 planning |
| EI | [Embedded Importer](features/embedded-importer.md) | Retained design; post-V1 planning |
| CRF | [Client Report Factory](features/client-report-factory.md) | Retained design; post-V1 planning |
| MR | [Migration Ready](features/migration-ready.md) | Retained design; post-V1 planning |
| FA | [Folder Autopilot](features/folder-autopilot.md) | Retained design; post-V1 planning |
| DQG | [Data Quality Guard](features/data-quality-guard.md) | Retained design; post-V1 planning |
| PDA | [Private Data Analyst](features/private-data-analyst.md) | Retained standalone specialist design; post-V1 planning |
| OC | [Operations Capture](features/operations-capture.md) | Retained full field-operations design; post-V1 planning |

The DDA V1 may implement bounded capabilities that resemble a later specialist module, such as typed analysis, folder intake, OCR review, or web publication. It does so through foundation contracts and DDA-owned composition records, not by importing another feature's application service or persistence.

## 7. Core dependency rules

DDA depends on:

```text
Web upload / Desktop folder / Android capture
                  |
                  v
        IAE immutable source + evidence
                  |
                  v
      DSM profile / map / transform / validate
                  |
                  v
       DSM governed dataset + metrics/lineage
                  |
                  v
    DDA typed analyst / canvas / materialization
                  |
                  v
        DDA complete published snapshot
```

Cross-cutting authorities:

- IAM authorizes every resource, query, event, object grant, and action.
- JRA owns every asynchronous job, result manifest, finding/review task, and approval decision.
- DSO selects Device/cloud route and enforces data-mode publication/synchronization.
- BUA admits and meters storage, ETL, AI/OCR, materialization, refresh, and publication usage.
- NCO delivers content-safe review/freshness/refresh notifications.
- AUD records mandatory security and business actions as the sole audit authority.

A dependency means reuse through a public contract, not permission for a source-code import or direct persistence access. Cross-foundation execution admission follows the acyclic `ExecutionAdmissionCoordinator` composition defined in [System Architecture](../architecture/system-architecture.md#6-foundation-composition-and-dependency-direction).

## 8. Shared workflow authority

- JRA owns canonical actionable `Finding` and `ReviewTask` envelopes. DSM/DDA own immutable diagnostic or proposal detail and link by `sharedFindingId`/`jraReviewTaskId`.
- JRA owns `ApprovalPolicy`, `ApprovalRequest`, and `ApprovalDecision`. DDA owns exact dashboard/projection/publication state and stores only the request ID plus bound subject version/hash.
- Module-specific routes may provide an authorized facade over JRA creation, reads, and decisions for a better workflow. They do not create independent decisions or weaken separation of duties, MFA, expiry, or material-change invalidation.
- Every asynchronous DDA run stores `jraJobId` and the pinned JRA result-manifest ID. DDA business state is an idempotent projection from committed JRA results/outbox events.

## 9. Policy layering

- DSO Workspace DataMode policy is the maximum authority. A dashboard, source binding, receipt profile, dataset, or publication projection may only narrow it.
- IAE owns authoritative retention and deletion. DDA may add a retention constraint but cannot delete IAE bytes; effective deletion intersects Workspace minimum, resource constraints, artifact/dataset/dashboard lineage, share/publication state, legal holds, AUD retention class, and recovery window.
- Dashboard sharing is not dataset/evidence permission. Every view, interaction, download, and drill-down re-authorizes the exact projection.
- AI/OCR adapter choice and egress are policy decisions; source values and evidence are untrusted data and never instructions.

## 10. Requirement traceability

Each implementation change references requirement IDs in its issue or approved plan. Tests use requirement IDs in names or metadata where practical.

The traceability chain is:

`Product outcome -> Specification requirement -> Implementation plan task -> Code/schema/migration -> Test evidence -> Release record`

The existing implementation plans and traceability manifest describe the earlier delivery program. They must be revised after written approval of this Version 2 product/specification suite before DDA implementation is delegated. Existing verified evidence remains valid only where its requirement intent and authoritative contract are unchanged.

## 11. Interpretation

If two documents appear to conflict:

1. Security, privacy, tenant isolation, evidence, data mode, retention, approval, usage, and audit constraints cannot be weakened by DDA or a specialist extension.
2. The Version 2 product definition and DDA specification govern first-product scope and sequencing.
3. The more specific accepted foundation/platform requirement governs its boundary.
4. A specialist feature P0 requirement applies to that specialist feature's eventual first production release, not automatically to DDA V1.
5. A later document version governs only when it explicitly supersedes the earlier behavior.
6. Ambiguity is resolved in documentation before implementation.

## 12. Specification template

New major capabilities use [the feature specification template](spec-template.md). Small additive changes may amend an existing specification when they preserve its boundary. Requirement IDs are never reused for a different meaning.
