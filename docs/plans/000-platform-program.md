# DataBreeze Platform Implementation Program

**Status:** Approved, Version 2<br>
**Implementation branches:** `codex/dda-*` isolated worktrees into the designated integration branch<br>
**Primary specifications:** `docs/product/`, `docs/architecture/`, `docs/specs/`, and accepted ADRs

## Goal

Implement DataBreeze as one Vietnamese-first data-to-dashboard agent across Web, Windows Desktop, and Android. The product turns user-controlled CSV/XLSX files, approved folders, and reviewed receipt captures into governed DatasetVersions, typed deterministic analyses, editable interactive dashboards, and immutable permission-scoped snapshots with evidence and efficient on-change refresh.

The repository contains 682 normative requirements. The 51 DDA requirements define V1 product scope. Existing foundation requirements remain binding wherever DDA composes them. Specialist-module requirements remain valid for those modules' later releases but are not parallel V1 commitments.

## Locked decisions

- One monorepo with independently releasable Web, Desktop, Android, API, worker, and engine deployables.
- React/TypeScript for Web and Desktop shared UI packages, native Kotlin/Compose for Android, NestJS/Fastify for the control plane, and Python for deterministic processing.
- PostgreSQL is authoritative; S3-compatible storage owns cloud bytes through IAE; Redis is non-authoritative.
- IAM, IAE, DSM, JRA, DSO, NCO, BUA, and AUD remain their declared authorities. DDA composes public contracts and never reads feature persistence directly.
- Local, Hybrid, and Cloud remain visible and enforceable. Hybrid is the default; cloud cannot browse Desktop folders or receive Local-only bytes.
- The V1 product is DDA, delivered sequentially as Cloud dashboard foundation, Hybrid Desktop folder intake, and cloud-connected Android receipt capture.
- Dashboard views use permission-scoped materialized results and complete immutable snapshots. `ON_CHANGE` is the default; `MANUAL` and `SCHEDULED` are supported; streaming is deferred.
- AI proposes typed plans/presentation only. Deterministic processors calculate authoritative values; no arbitrary generated code or silent publication.
- AWS Singapore remains the first hosted target through portable containers and OpenTofu. OpenAI is the initial server-side OCR/AI provider under ADR-0005; domain contracts remain provider-neutral.
- The DataBreeze name, canonical logo, Vietnamese-default locale, and complete English fallback remain unchanged.
- Delivery is task- and evidence-gated. No schedule, parallelism level, or successful fixture journey waives a production requirement.

## Delivery program

| Phase | Plan | Release gate |
|---|---|---|
| Foundation evidence | `010`-`060` | Existing identity, artifacts/datasets/evidence, jobs/approvals, devices/sync, and collaboration authorities are green for the invoked slice. |
| V1 program | `080-data-to-dashboard-program.md` | Direction, provider boundary, ownership, dependencies, dispatch packets, complete task graph, and production gates are approved. |
| Contract gate | `081-dda-contracts-and-authorities.md` | Domain/wire/persistence vocabulary, authority boundaries, policies, and cross-language fixtures are frozen and green. |
| Parallel product lanes | `082`-`086` | Cloud ETL, analyst/canvas, materialization/refresh, Desktop folders, and Android receipts pass their independent handoff gates. |
| Integration | `087-dda-integration-readiness.md` | Ordered integration, Local/Cloud parity, the golden cross-platform journey, honest traceability, and release gaps are reproducible. |
| Production | `400-production-readiness.md` | Security, tenant isolation, signing, restoration, scaling, accessibility, performance, support, and progressive release gates pass. |
| Post-V1 | `070`, `100`-`320`, `500` | Specialist capabilities begin only through a later approved change and child plan. |

The machine-readable DDA DAG is `docs/plans/data-to-dashboard-orchestration.json`. The legacy `execution-orchestration.json` remains a historical validator for the original 611-requirement partition and must not be used to dispatch DDA work.

## Branch, ownership, and review policy

- Start `081` first. Its green commit is the immutable base for plans `082`-`086`.
- Run each product lane in a separate `codex/dda-<lane>` worktree/branch. One agent owns one child plan.
- Shared schemas/generated outputs, domain exports, API root composition, Prisma migration ordering, Web shell composition, Desktop IPC/preload, Android runtime composition, and traceability status follow the exclusive locks in plan `080`.
- Workers return atomic commits and evidence; they do not self-certify requirements. The integration owner merges one lane at a time and reruns receiving-branch gates.
- Keep commits coherent and reversible. Preserve unrelated work and never commit customer data, runtime artifacts, secrets, credentials, local databases, generated reports, Office lock files, or local folder paths.
- Production promotion continues through reviewed integration and plan `400`; a working demo is insufficient release evidence.

## Cross-cutting definition of done

- Requirement-to-plan-to-task-to-test traceability is complete and honest.
- Generated TypeScript, Kotlin, and Python contracts and golden fixtures agree.
- Tenant scope, authorization, data mode, evidence, approval, audit, usage, retention, and recovery cannot be bypassed.
- Originals and accepted versions remain immutable; rejects/exclusions are counted and discoverable.
- Vietnamese and English user-facing copy are complete for the delivered slice.
- Relevant unit, integration, contract, tenant-isolation, concurrency, end-to-end, security, accessibility, offline/recovery, parity, and performance tests pass.
- Migrations, observability, operations, rollback, evidence, and prototype/production limitations are documented.
- No critical/high security finding remains unresolved for production, and `DDA-051` remains deferred until a streaming specification is accepted.
