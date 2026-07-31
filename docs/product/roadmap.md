# DataBreeze Product Roadmap

**Status:** Product specification<br>
**Version:** 1.0

This roadmap sequences risk reduction and shared platform value. It is not a date commitment. Each slice requires its own implementation plan and release evidence.

## 1. Delivery Rules

- Specify the complete platform, implement it in vertical slices.
- A slice must produce a user-observable result across the necessary platforms.
- No module bypasses shared identity, artifacts, jobs, evidence, permissions, approvals, or audit conventions.
- A later wave may begin discovery while an earlier wave is implemented, but production dependencies are released in order.
- Direct marketplace connectors are never release blockers.

## 2. Stage 0: Repository and Engineering Foundation

Outcome: a clean monorepo can build, test, and release each deployable independently.

Includes:

- Root toolchain and dependency policy
- Web, Desktop, Android, API, and Engine skeleton boundaries
- Local PostgreSQL, Redis, object storage, and development services
- Contract generation for TypeScript, Kotlin, and Python
- CI path filtering, security scanning, artifact signing, and release channels
- Environments, secrets, telemetry, migrations, backups, and feature flags

Exit gate:

- Reproducible development setup on a clean machine
- Contract compatibility test across all languages
- Empty deployables build and pass security checks

## 3. Stage 1: Shared Product Foundation

Outcome: a user can create a workspace, register devices, intake an artifact, execute a typed job, inspect evidence, review an exception, and synchronize safely.

Includes:

- Identity, organizations, workspaces, roles, projects, and policies
- Inbox, artifacts, versions, object storage, and evidence
- Governed datasets, schemas, semantics, metrics, rules, mappings, validation, and lineage
- Jobs, recipes, typed actions, reviews, approvals, and audit history
- Device registration, data modes, offline queue, and resumable synchronization
- Versioned public API conventions, service-account access, idempotency, pagination, and webhook/connector protocol foundations; concrete vendor connectors remain optional later work
- Notifications, basic collaboration, provider-independent Free/Development/Admin-granted entitlements, usage, and administration; commercial billing integration is not a Stage 1 dependency
- Web management shell, Desktop local agent shell, and Android capture/review shell

Exit gate:

- End-to-end Local, Hybrid, and Cloud reference workflows
- Tenant isolation and device-revocation security tests
- Offline interruption and idempotent-resume tests

## 4. Wave 1: Validate All Three Surfaces

### Folder Autopilot

Validates Desktop folder capabilities, typed recipes, local execution, approval, audit, and undo.

### Spreadsheet Auditor

Validates the Python engine, evidence coordinates, deterministic findings, large local files, and repair previews.

### Quote Intelligence

Validates multi-document extraction, normalization, weighted decisions, Android scan/review, and Web collaboration.

### Operations Capture

Validates native Android capture, Room, WorkManager, offline queues, Web form design, and Desktop reconciliation.

Wave exit gate:

- Each platform provides unique value rather than duplicating screens.
- Golden fixtures produce equivalent local and cloud results.
- Representative workloads meet performance budgets.

## 5. Wave 2: Governed Analysis and Publication

### Invoice Leak Detector

Builds on document extraction, deterministic reconciliation, findings, and approval.

### Client Report Factory

Builds on governed datasets, templates, evidence, versioning, and publication.

### Private Data Analyst

Builds on semantic definitions, query safety, evidence, local processing, and provider-neutral AI adapters.

Wave exit gate:

- Consequential findings reproduce from stored inputs and versions.
- Published reports remain stable and auditable.
- AI provider failure does not break deterministic workflows.

## 6. Wave 3: Reusable Data Infrastructure

### Migration Ready

Adds high-volume profiling, mapping, deduplication, dry runs, and reconciliation packages.

### Data Quality Guard

Adds scheduled rules, drift monitoring, incident ownership, and repair proposals.

### Embedded Importer

Productizes schemas, mappings, row validation, review UX, webhooks, SDKs, and a local gateway for external customers.

Wave exit gate:

- Public API compatibility and tenant-isolation suite
- Capacity tests for contracted Embedded Importer limits
- Operational support and abuse controls

## 7. Expansion After Product Evidence

Potential later expansions:

- iOS capture companion if market evidence justifies it
- Authorized accounting, storage, email, or database connectors
- Industry template packs
- Customer-managed encryption keys
- Enterprise SSO, SCIM, and regional storage
- Dedicated worker pools or analytical storage when measured workload requires them
- A governed extension marketplace after signing and sandboxing are mature

## 8. Explicitly Deferred

- Kubernetes before container and managed-service limits are measured
- Microservices before the modular monolith creates an operational bottleneck
- Kafka or a dedicated event platform before Postgres outbox and Redis Streams are insufficient
- A general-purpose remote PC agent
- Automatic target-system writes for migrations
- Payment execution from invoice findings
- Broad connector catalog without stable authorization and customer demand
