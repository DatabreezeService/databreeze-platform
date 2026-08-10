# DataBreeze Product Principles

**Status:** Product specification<br>
**Version:** 2.0

These principles resolve product and engineering trade-offs when a specification does not provide a direct answer. The canonical meanings of data classification, synchronization payload class, consequential/high-risk action, material change, quality dimension, dashboard snapshot, and freshness state are defined in [Terminology](terminology.md).

## 1. Trust before magic

DataBreeze explains material outputs, retains source evidence, exposes uncertainty, and favors reproducibility over impressive but opaque behavior.

- Deterministic processors calculate every displayed numeric value.
- AI output is labeled by role: suggestion, classification, intent interpretation, visualization proposal, explanation, or narrative.
- A user can inspect the source, dataset version, typed plan, metric/rule version, filters, and evidence behind a result.
- “No reliable answer” is preferable to a fabricated answer.

## 2. The user controls data location

Local, Hybrid, and Cloud are product capabilities rather than hidden deployment details.

- Data location is visible at intake, ETL, analysis, dashboard publication, sharing, and deletion.
- Local mode never uploads an original as a side effect of using the cloud control plane.
- Hybrid publication shows the exact fields, aggregates, bytes, destination, evidence availability, and policy before transfer.
- Changing modes is prospective and never moves existing data without the required confirmation.
- OCR, AI, storage, and processing providers are replaceable behind versioned adapters.

## 3. Originals are immutable; preparation is versioned

- Upload, folder intake, and mobile capture preserve an immutable original artifact version.
- Mapping, cleaning, normalization, rejection, correction, and publication create explicit versions with lineage.
- The ETL review shows what changed and what was excluded; no record is silently omitted.
- Undo means selecting or producing another version, not rewriting history.

## 4. Quality is measured precisely

- Completeness, validity, uniqueness, consistency, freshness, and extraction confidence are separate dimensions.
- A profile or AI score is never presented as factual correctness.
- An overall quality summary discloses formula, weights, coverage, sampling, and limitations.
- A failed required quality gate blocks dependent publication rather than quietly degrading the result.

## 5. Automation is bounded

DataBreeze automates known work through typed actions and explicit capabilities.

- Folder permissions are scoped to selected paths, purposes, file types, and workspaces.
- Source values and filenames are untrusted data, not agent instructions.
- Agent-proposed ETL, analysis, and canvas mutations are previewable and versioned.
- Publishing, permission expansion, data movement, destructive effects, and other consequential actions follow policy and approval.
- Every state-changing action has audit and recovery behavior.

## 6. Evidence is a first-class product object

Evidence travels through intake, extraction, transformation, validation, analysis, dashboard materialization, approval, and publication.

- Evidence identifies exact artifact and dataset versions plus a stable coordinate or aggregate definition.
- Derived values record transformation and calculation lineage.
- A published snapshot remains reproducible after a source receives a new version.
- Retention policy warns before removing evidence referenced by an active or published result.

## 7. One product, clear capability boundaries

The Data-to-Dashboard Agent composes shared foundations without reading another feature's persistence or redefining its authority.

- IAM owns identity and authorization.
- IAE owns artifacts, bytes, evidence, retention, and deletion.
- DSM owns governed datasets, schemas, mappings, rules, metrics, quality, and lineage.
- JRA owns jobs, review tasks, approvals, retry, cancellation, and terminal execution state.
- DSO owns device capabilities, data-mode admission, synchronization, and transfer.
- DDA owns only dashboard composition, canvas/page versions, materialization bindings, refresh projections, and the agent-facing product workflow.
- Post-V1 specialist extensions use public contracts and can be disabled without corrupting shared data.

## 8. Fresh on trusted change

Dashboard freshness is triggered by accepted data change rather than continuous polling or a vague claim of “live.”

- Ordinary page views use bounded authorized materializations.
- Dataset-version events select affected results through a versioned dependency contract.
- A debounce window may coalesce changes, but freshness and pending/blocked reasons remain visible.
- A partial refresh never replaces the last complete dashboard snapshot.
- Genuine streaming requires a separate specification after measured demand.

## 9. Calm, operational UX

- Onboarding begins with adding data and reaching a useful result.
- The next useful action is obvious.
- Status, freshness, uncertainty, cost, and rejected data are concise but not hidden.
- Dense information uses progressive detail, filters, and sensible defaults.
- Vietnamese business language comes before engineering vocabulary; English remains complete.
- Decorative effects never compete with evidence, warnings, review, or publication state.

## 10. Solo-simple, team-ready

- Personal organizations and default workspaces remove unnecessary setup.
- Roles, project isolation, approvals, audit history, billing, and retention exist in the same model when a team grows.
- Sharing a dashboard never silently grants raw dataset or evidence access.
- Advanced controls appear when needed without changing ownership semantics.

## 11. Performance and cost are usability

- Interactive actions have p95 budgets.
- Large work is asynchronous, resumable, bounded, and cancelable at safe boundaries.
- Only affected materializations recompute when safe; cache entries are tenant/permission/version scoped.
- Changes are debounced, concurrency is limited, idle work may suspend, and usage is visible.
- Clients render useful bounded results rather than waiting for an entire dataset.
- Offline users can distinguish local completion, synchronization, and cloud publication.

## 12. Prefer boring, replaceable infrastructure

- PostgreSQL owns durable business state and the transactional outbox.
- Object storage owns cloud bytes; Redis is non-authoritative coordination/cache infrastructure.
- Summary tables or materialized results are introduced from the product contract and measured workloads.
- Specialized streaming, warehouse, or search infrastructure is added only after measured limits.
- External APIs, OCR engines, AI providers, and object stores use adapters with contract tests.

## 13. Compatibility is designed

- External APIs and stored action/plan/definition schemas are versioned.
- Dashboard snapshots bind exact dataset, semantic, plan, widget, and renderer versions.
- Readers tolerate additive fields; incompatible changes require migration or review.
- Mobile and Desktop clients receive a supported-version window and safe forced-upgrade behavior.
- Historical results retain the versions needed for explanation.

## 14. Privacy and security are defaults

- Workspace authorization and full TenantScope are enforced server-side on every path, event, cache key, and object grant.
- Secrets and source-derived content are excluded from ordinary logs, analytics, notifications, and support diagnostics.
- Source data is isolated from agent instructions and provider prompts.
- Audit events are append-only and content-minimized.
- Secure deletion and retention are defined by artifact/result location, lineage, legal hold, and recovery policy.

## 15. Expand through files and templates before integrations

DataBreeze supports a new use case first through schemas, mappings, transformation templates, metric/dashboard templates, receipt profiles, typed processors, and standard file formats.

Direct database, cloud-drive, accounting, email, or marketplace connectors are optional accelerators. A connector cannot become the only way to use the product or bypass authorization, evidence, data-mode, cost, or retention controls.
