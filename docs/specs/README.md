# DataBreeze Specification Index

**Status:** Product specification<br>
**Version:** 1.0

This directory contains normative product behavior. Product and architecture documents provide context and constraints; the specifications below provide stable requirement IDs and acceptance criteria.

## 1. Priority

- **P0:** Required for the capability’s first production release or for platform safety.
- **P1:** Required for the complete generally available capability; it may follow an explicitly limited beta.
- **P2:** Designed extension that must not distort the foundation but is not committed to the first general release.

## 2. TenantScope Contract

`TenantScope` is normative shorthand for `organizationId + workspaceId`, plus `projectId` when the resource belongs to a project. Every persisted tenant-owned row and every tenant-sensitive composite foreign key includes the full applicable scope even when an illustrative schema, API example, or entity table omits those fields for brevity. A child row must carry and validate the same scope as its parent; an unscoped ID match never authorizes access or satisfies referential integrity.

## 3. Foundation Specifications

| Prefix | Specification | Purpose |
|---|---|---|
| IAM | [Identity, workspaces, and permissions](foundation/identity-workspaces-permissions.md) | Tenant, membership, role, session, and authorization foundation |
| IAE | [Inbox, artifacts, and evidence](foundation/inbox-artifacts-evidence.md) | Intake, immutable versions, lineage, and evidence |
| JRA | [Jobs, recipes, and approvals](foundation/jobs-recipes-approvals.md) | Typed automation, durable work, review, and approval |
| DSO | [Devices, sync, and offline](foundation/devices-sync-offline.md) | IAM Device operational projection, capabilities/grants, data modes, synchronization, and offline transfer |
| DSM | [Datasets, schemas, rules, and mappings](foundation/datasets-schemas-rules-mappings.md) | Governed structured data, definitions, validation, lineage, and deterministic reuse |
| INT | [Integrations, public API, and webhooks](foundation/integrations-api-webhooks.md) | Public protocol rules, connector boundaries, credentials, receipts, and delivery |
| NCO | [Notifications and collaboration](foundation/notifications-collaboration.md) | Assignments, comments, mentions, delivery, and safe previews |
| BUA | [Billing, usage, and administration](foundation/billing-usage-administration.md) | Entitlements, metering, plan behavior, and administration |
| AUD | [Audit Ledger](foundation/audit-ledger.md) | Append-only attributable history, safe query/export, integrity, retention, and legal hold |

## 4. Platform Specifications

| Prefix | Specification | Primary responsibility |
|---|---|---|
| WEB | [Web](platforms/web.md) | Full organizational, cloud, collaboration, and administration workspace |
| DSK | [Windows Desktop](platforms/desktop.md) | Local files, approved folders, heavy processing, recipes, and offline work |
| AND | [Android](platforms/android.md) | Native capture, offline field work, review, notifications, and approvals |

## 5. Feature Specifications

| Prefix | Feature | Initial wave |
|---|---|---|
| QI | [Quote Intelligence](features/quote-intelligence.md) | 1 |
| SA | [Spreadsheet Auditor](features/spreadsheet-auditor.md) | 1 |
| ILD | [Invoice Leak Detector](features/invoice-leak-detector.md) | 2 |
| EI | [Embedded Importer](features/embedded-importer.md) | 3 |
| CRF | [Client Report Factory](features/client-report-factory.md) | 2 |
| MR | [Migration Ready](features/migration-ready.md) | 3 |
| FA | [Folder Autopilot](features/folder-autopilot.md) | 1 |
| DQG | [Data Quality Guard](features/data-quality-guard.md) | 3 |
| PDA | [Private Data Analyst](features/private-data-analyst.md) | 2 |
| OC | [Operations Capture](features/operations-capture.md) | 1 |

## 6. Dependency Rules

All features depend on:

- IAM for authorization
- IAE for sources and evidence
- JRA for execution and human control
- DSO when local/offline behavior exists
- DSM for governed datasets, schemas, semantics, metrics, rules, mappings, profiling, validation, and lineage
- INT for public APIs, service integrations, connector transport, and inbound/outbound webhooks
- NCO for assigned work and notifications
- BUA for entitlement and usage enforcement
- AUD for the canonical append-only audit history

Feature-specific dependencies:

```text
Folder Autopilot ------> Desktop + Jobs + Devices
Spreadsheet Auditor ---> Engine + Evidence + Desktop/Web review
Quote Intelligence ----> Document extraction + Evidence + Approval
Operations Capture ----> Android + Sync + Inbox

Invoice Leak Detector --> IAE evidence + DSM rules/data + JRA approval
Client Report Factory -> DSM datasets/metrics + IAE evidence + JRA approval
Private Data Analyst --> DSM datasets/definitions + IAE evidence

Migration Ready -------> DSM schema/mapping primitives + JRA jobs
Data Quality Guard ----> DSM datasets/rules + module incidents
Embedded Importer ----> DSM schemas/mappings + INT public API/webhooks
```

A dependency means reuse through a public contract, not permission for a source-code import or direct persistence access. A feature may not access another feature's persistence directly. Cross-foundation execution admission follows the acyclic `ExecutionAdmissionCoordinator` composition defined in [System Architecture](../architecture/system-architecture.md#6-foundation-composition-and-dependency-direction); IAM, IAE, DSM, DSO, BUA, and JRA exchange version-bound decisions and IDs through that coordinator rather than importing one another's application services.

### Shared workflow authority

- `JRA` owns the canonical actionable `Finding` and `ReviewTask` envelopes: fingerprint, source subsystem/detail reference, severity, workflow state, assignment, evidence references, disposition, and immutable history.
- DSM and feature modules own immutable diagnostic details and subject-specific states, and link them using `sharedFindingId` or `jraReviewTaskId`; they do not maintain a competing actionable finding or review authority.
- `JRA` owns `ApprovalPolicy`, `ApprovalRequest`, and `ApprovalDecision`. A module owns the exact subject/release state and stores only the JRA request ID plus bound resource version and subject hash.
- Module-specific routes may provide an authorized application facade over JRA creation, reads, and decisions for a better workflow. They do not create independent approval decisions, bypass JRA policy, or relax separation of duties, MFA, expiry, or material-change invalidation.
- Every asynchronous feature run stores `jraJobId` and the pinned JRA result-manifest ID. JRA alone owns dispatch, progress, cancellation, retry, and terminal execution state; a feature status is an idempotent business projection from committed JRA results/outbox events and must define an explicit mapping when it differs from Job state.

### Policy layering

- The DSO Workspace DataMode policy is the maximum authority. A resource or module may store only a `dataModeConstraint` or `effectiveDataModePolicyRef` that narrows placement, processing, or synchronization; execution resolves the intersection and no feature may broaden the Workspace policy.
- IAE owns authoritative retention and deletion. A module may add a retention constraint but cannot directly delete IAE bytes. Effective deletion waits until Workspace minimums, resource constraints, evidence/report lineage, legal holds, AUD retention class, and the recovery window all allow it. Local cache cleanup is not authoritative retention.

## 7. Requirement Traceability

Each implementation change references requirement IDs in its issue or plan. Tests use requirement IDs in names or metadata where practical.

The traceability chain is:

`Product outcome -> Specification requirement -> Implementation plan task -> Code/schema/migration -> Test evidence -> Release record`

When a requirement applies across several platforms, the feature specification defines the outcome and the platform specification defines platform behavior. Both IDs are referenced.

## 8. Interpretation

If two documents appear to conflict:

1. Security, privacy, and tenant-isolation constraints cannot be weakened by a feature.
2. The more specific accepted specification governs its feature behavior.
3. A later version governs only when it explicitly supersedes the earlier requirement.
4. The ambiguity is resolved in documentation before implementation.

## 9. Specification Template

New modules and major capabilities use [the feature specification template](spec-template.md). Small additive changes may amend an existing specification when they preserve its boundary.
