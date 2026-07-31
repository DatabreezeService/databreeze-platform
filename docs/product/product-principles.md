# DataBreeze Product Principles

**Status:** Product specification<br>
**Version:** 1.0

These principles resolve product and engineering trade-offs when a feature specification does not provide a direct answer.

The canonical meanings of sensitive data, synchronization payload class, consequential/high-risk action, and material change are defined in [Terminology](terminology.md). Features may apply stricter policy, but may not create incompatible meanings for those safety terms.

## 1. Trust Before Magic

DataBreeze explains material outputs, retains source evidence, exposes uncertainty, and favors reproducibility over impressive but opaque behavior.

- Consequential financial, migration, or data-quality findings require deterministic support.
- AI output is labeled by role: suggestion, classification, explanation, or narrative.
- A user can inspect the source, processor version, rule version, and reviewer behind a result.
- “No reliable answer” is preferable to a fabricated answer.

## 2. The User Controls Data Location

Local, Hybrid, and Cloud are product capabilities rather than hidden deployment details.

- Data location is visible at intake, processing, sharing, and deletion.
- Local mode never uploads an original as a side effect of using a cloud control plane.
- Changing modes explains which existing artifacts will move; it is never retroactive without confirmation.
- Optional providers are replaceable behind documented adapters.

## 3. Automation Must Be Bounded

DataBreeze automates known work through typed actions and explicit capabilities.

- Folder permissions are scoped to selected paths and purposes.
- Originals are read-only by default.
- Mutations happen on copies unless a reviewed recipe explicitly authorizes replacement.
- Destructive, externally visible, or financially consequential actions require policy-based approval.
- Every mutation has a preview, audit record, and recovery behavior.

## 4. Evidence Is a First-Class Product Object

Evidence is not a screenshot added after analysis. It travels through classification, extraction, normalization, findings, approvals, and reports.

- Evidence identifies artifact version and a stable coordinate.
- Derived values record their transformation lineage.
- A report remains reproducible even after a source receives a new version.
- Retention policy warns before deleting evidence referenced by an active or published result.

## 5. One Platform, Clear Module Boundaries

Modules share foundations but do not reach into one another’s internal tables or processors.

- Shared entities belong to the platform domain.
- Module-specific data is accessed through contracts or domain services.
- A module can be disabled without corrupting shared artifacts.
- New modules use the same artifact, job, evidence, approval, audit, entitlement, and extension conventions.

## 6. Calm, Operational UX

The interface is a working environment rather than an advertising surface.

- The next useful action is obvious.
- Status and uncertainty are concise but not hidden.
- Dense information uses progressive detail, filters, and sensible defaults.
- Vietnamese business language comes before engineering vocabulary.
- Decorative effects never compete with evidence, warnings, or approvals.

## 7. Solo-Simple, Team-Ready

Individual use must not require enterprise ceremony, while team growth must not require migration to another product model.

- Personal organizations and default workspaces are created automatically.
- Roles, project isolation, approvals, audit history, and billing exist in the same underlying model.
- Advanced controls appear when needed without changing ownership semantics.

## 8. Performance Is Part of Usability

Responsive review and clear progress are product requirements.

- Interactive actions have budgets and are measured at the 95th percentile.
- Large work is asynchronous, resumable, and cancelable at safe boundaries.
- Clients render useful partial or paginated results instead of waiting for an entire dataset.
- Offline users can distinguish local completion from cloud synchronization.

## 9. Prefer Boring, Replaceable Infrastructure

DataBreeze begins with a modular monolith, PostgreSQL, object storage, and a small number of explicit worker boundaries.

- PostgreSQL owns durable business state.
- Redis coordinates work but is not the only record of a critical job.
- Specialized infrastructure is added only after measured limits.
- External APIs, OCR engines, AI providers, email services, payment providers, and object stores use adapters with contract tests.

## 10. Compatibility Is Designed

- External APIs are versioned.
- Stored jobs, recipes, rule definitions, and processor inputs use versioned schemas.
- Readers tolerate additive fields; incompatible changes require migration.
- Mobile and desktop clients receive a supported-version window and a safe forced-upgrade policy.
- Historical results retain the versions needed for explanation.

## 11. Privacy and Security Are Defaults

- Workspace authorization is enforced server-side on every path.
- Secrets are never stored in source files, artifact metadata, analytics, or user-visible logs.
- Sensitive notification content is minimized.
- Audit events are append-only and redact secrets.
- Secure deletion and retention are defined by artifact location and legal constraints.

## 12. Expand Through Templates Before Integrations

DataBreeze should support a new industry or vendor first through schemas, mapping templates, recipes, and file formats.

Direct connectors are optional accelerators when stable, authorized access exists. A connector cannot become the only way to use a module.
