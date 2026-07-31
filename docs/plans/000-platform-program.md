# DataBreeze Platform Implementation Program

**Status:** Approved  
**Implementation branch:** `dev` through short-lived `feat/*` and `fix/*` branches  
**Primary specifications:** `docs/product/`, `docs/architecture/`, `docs/specs/`, and accepted ADRs

## Goal

Implement DataBreeze as one Vietnamese-first, local-first business data platform across Web, Windows Desktop, and Android. The platform turns user-controlled files, documents, captures, and governed datasets into traceable jobs, evidence, reviews, approvals, reports, and safe actions without depending on restricted marketplace APIs.

The program covers all 611 normative requirements. P0 requirements are release gates, P1 requirements complete the generally available capability, and P2 requirements are preserved as extension seams but are not scheduled for the first release.

## Locked decisions

- One clean monorepo with independently releasable deployables.
- TypeScript for Web, Desktop, shared packages, and the NestJS/Fastify control plane.
- Native Kotlin/Compose for Android and Python for the shared processing engine.
- PostgreSQL is authoritative; S3-compatible storage holds cloud bytes; Redis is non-authoritative.
- Local, Hybrid, and Cloud data modes remain visible and enforceable throughout every workflow.
- First usable release is a private dogfood alpha built on the full multi-tenant architecture.
- The first cross-platform workflow is Folder Autopilot plus Spreadsheet Auditor.
- Core value does not require Shopee, TikTok Shop, accounting, advertising, or ERP partnerships.
- AWS Singapore is the first hosted target through portable containers and OpenTofu.
- The existing DataBreeze name and canonical logo files are retained without redrawing.

## Delivery program

| Phase | Child plan | Release gate |
|---|---|---|
| 0 | `010-engineering-foundation.md` | Toolchains, contracts, brand, deployable shells, local dependencies, and CI build reproducibly. |
| 1A | `020-identity-audit-entitlements.md` | IAM, AUD, and provider-independent BUA foundations pass tenant and security gates. |
| 1B | `030-artifacts-datasets-evidence.md` | IAE and DSM provide immutable artifacts, evidence, datasets, schemas, rules, and mappings. |
| 1C | `040-jobs-processing-approvals.md` | JRA, admission coordination, cloud workers, and the local engine execute signed typed jobs. |
| 1D | `050-devices-sync-offline.md` | Desktop and Android enroll, sync, recover, conflict, and revoke safely. |
| 1E | `060-collaboration-integrations.md` | NCO and INT provide governed collaboration, notifications, API keys, and webhooks. |
| 2 | `070-dogfood-folder-spreadsheet.md` | One spreadsheet-folder workflow crosses all three applications and preserves the original. |
| 3 | `1xx-wave-1-*.md` | Folder Autopilot, Spreadsheet Auditor, Quote Intelligence, and Operations Capture. |
| 4 | `2xx-wave-2-*.md` | Invoice Leak Detector, Client Report Factory, and Private Data Analyst. |
| 5 | `3xx-wave-3-*.md` | Migration Ready, Data Quality Guard, and Embedded Importer. |
| 6 | `400-production-readiness.md` | Signing, restoration, scaling, security, support, and progressive releases pass. |

Child plans are written and approved before their product slice begins. Each names exact requirement IDs, paths, contract changes, migrations, tests, telemetry, failure behavior, rollback, and intentionally deferred requirements.

## Branch, commit, and review policy

- `main` contains stable releases. `dev` is the integration branch.
- New capabilities use `feat/<name>`; corrections use `fix/<name>`; operational and documentation work use conventional prefixes when more accurate.
- Commit one coherent tested unit at a time. Do not combine unrelated applications or domains merely to reduce commit count.
- Pull requests target `dev`, normally contain 30–50 commits, and must not exceed 70 commits.
- Invoke CodeRabbit once per pull request after the branch is ready for review. Validate every comment against the specifications and tests; fix valid findings and document why invalid findings are not applied.
- Promote `dev` to `main` only through a separate release pull request after the relevant production gates pass.

## Cross-cutting definition of done

- Requirement-to-task-to-test traceability is complete.
- Generated TypeScript, Kotlin, and Python contracts agree.
- Tenant scope, authorization, data mode, evidence, approval, audit, and retention rules cannot be bypassed.
- Vietnamese and English user-facing copy are complete for the delivered slice.
- Relevant unit, integration, contract, end-to-end, security, accessibility, recovery, and performance tests pass.
- Migrations, observability, operations, rollback, and release evidence are present.
- No critical or high security finding remains unresolved for a production release.

