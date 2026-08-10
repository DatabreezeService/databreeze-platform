# DataBreeze DDA Production Readiness Implementation Plan (401)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Use `superpowers:test-driven-development` for behavior changes and `superpowers:verification-before-completion` before any release claim.

**Status:** Approved<br>
**Plan number:** 401 (legacy WEB production control remains 400)<br>
**Requirements:** `DDA-001` through `DDA-050` plus every invoked P0/P1 foundation and Web/Desktop/Android platform requirement<br>
**Depends on:** Green integration evidence from plans `081` through `087`<br>
**Decision authorities:** ADR-0004 and ADR-0005<br>
**External owner checklist:** [`MANUAL-PREREQUISITES.md`](MANUAL-PREREQUISITES.md)

**Goal:** Promote the complete Vietnamese-first Data-to-Dashboard Agent from integrated software to a secure, recoverable, observable, signed, cost-controlled, staged production release on AWS with live server-side OpenAI adapters.

**Architecture:** AWS `ap-southeast-1` hosts DataBreeze-controlled Web assets, API, workers, PostgreSQL, Redis, object storage, keys, secrets, logs, queues, and monitoring. OpenAI is the initial external receipt-extraction and optional AI provider behind server-side provider-neutral ports. PostgreSQL and IAE/DSM remain authoritative; OpenAI responses, Redis state, caches, telemetry, and client state are never authorities.

**Tech Stack:** OpenTofu/AWS, CloudFront/S3, ECS Fargate, RDS PostgreSQL, ElastiCache Redis, KMS, Secrets Manager, CloudWatch/CloudTrail, GitHub Actions OIDC, NestJS/Fastify/Prisma, Python workers, React/Vite, Electron, Kotlin/Compose, OpenAI Responses API, Playwright, Android Gradle tooling, and requirement-linked evidence manifests.

## Global constraints

- No production claim until exact P0/P1 evidence paths exist and all applicable commands pass freshly.
- Preserve IAM, IAE, DSM, JRA, DSO, NCO, BUA, and AUD authority; tenant scope, evidence, data mode, retention, approval, usage, and audit cannot be weakened.
- Vietnamese is the default complete locale and English is a complete secondary locale.
- No customer data enters preview, CI, fixtures, source control, screenshots, or ordinary telemetry.
- No client or processing worker receives database credentials. No Web/Desktop/Android client receives an OpenAI credential.
- Originals, accepted DatasetVersions, processor versions, materializations, and published snapshots remain immutable and recoverable according to policy.
- A fake adapter, skipped real-device check, unpinned or unevaluated model, untested restore, unresolved high/critical finding, or missing signing identity blocks the applicable release.
- An agent may prepare setup instructions and secret definitions, but it may not fabricate an external account, credential, legal declaration, publisher identity, risk acceptance, or production approval. Applicable unchecked items in `MANUAL-PREREQUISITES.md` block G5.
- `DDA-051` genuine streaming remains deferred and is not a production gate.

---

### Task 1: Freeze the production release manifest and evidence matrix

**Files:**

- Create: `docs/evidence/dda/production-gate-matrix.md`
- Create: `docs/evidence/dda/release-manifest.json`
- Modify: `docs/evidence/dda/release-readiness.md`
- Modify: `docs/plans/requirement-traceability.json`
- Modify: `docs/plans/data-to-dashboard-orchestration.json`

- [ ] Record exact Web, API, worker, engine, Desktop, Android, contract, database migration, OpenAI adapter/prompt/schema/model, and infrastructure versions.
- [ ] Map every DDA P0/P1 and invoked foundation/platform release requirement to existing code, tests, operational evidence, an owner, and a rollback action.
- [ ] Mark missing evidence `blocked` or `partial`; never create a verification record for a planned path or historical test count.
- [ ] Run `corepack pnpm requirements:check`, `corepack pnpm orchestration:check`, and `corepack pnpm contracts:check` before and after every evidence reconciliation.

### Task 2: Create isolated staging and production AWS environments

**Files:**

- Create: `infrastructure/aws/environments/staging/main.tf`
- Create: `infrastructure/aws/environments/staging/variables.tf`
- Create: `infrastructure/aws/environments/staging/outputs.tf`
- Create: `infrastructure/aws/environments/staging/versions.tf`
- Create: `infrastructure/aws/environments/staging/terraform.tfvars.example`
- Create: `infrastructure/aws/environments/staging/tests/staging-plan.tofutest.hcl`
- Create: `infrastructure/aws/environments/production/main.tf`
- Create: `infrastructure/aws/environments/production/variables.tf`
- Create: `infrastructure/aws/environments/production/outputs.tf`
- Create: `infrastructure/aws/environments/production/versions.tf`
- Create: `infrastructure/aws/environments/production/terraform.tfvars.example`
- Create: `infrastructure/aws/environments/production/tests/production-plan.tofutest.hcl`
- Modify: `infrastructure/aws/modules/network/`
- Modify: `infrastructure/aws/modules/security/`
- Modify: `infrastructure/aws/modules/data/`
- Modify: `infrastructure/aws/modules/compute/`
- Modify: `infrastructure/aws/modules/web/`
- Modify: `infrastructure/aws/README.md`

- [ ] Add red OpenTofu tests for public database/Redis/object access, single-instance production API, missing encryption, missing PITR, missing bucket versioning/lifecycle, missing private CloudFront OAC, overly broad IAM, and absent log retention.
- [ ] Configure private subnets/security groups, at least two stateless API tasks, separately scalable typed worker pools, health checks, autoscaling, deployment circuit breaker/rollback, Multi-AZ production RDS with PITR, encrypted Redis, KMS-encrypted private S3, CloudFront OAC, WAF/rate protection, and immutable release artifacts.
- [ ] Use distinct AWS accounts or equivalently isolated environments, resource tags, cost allocation, service quotas, and least-privilege workload roles.
- [ ] Run `tofu fmt -check`, `tofu validate`, all `.tofutest.hcl` tests, and reviewed staging/production plans with no unexpected replacement or public exposure.

### Task 3: Productionize the OpenAI receipt and optional AI adapters

**Files:**

- Modify: `services/api/src/features/dda/receipt/adapter/openai-receipt-ocr.adapter.ts`
- Modify: `services/api/src/features/dda/receipt/adapter/openai-receipt-ocr.config.ts`
- Modify: `services/api/test/features/dda/openai-receipt-ocr.adapter.test.ts`
- Modify: `services/api/test/features/dda/openai-receipt-ocr.contract.test.ts`
- Create: `services/api/test/features/dda/openai-egress-policy.test.ts`
- Create: `tools/fixture-validation/src/run-openai-receipt-eval.mjs`
- Modify: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/`
- Modify: `docs/evidence/dda/openai-receipt-evaluation.md`
- Create: `docs/operations/openai-provider-runbook.md`

- [ ] Provision a dedicated OpenAI production project manually; configure billing/spend limits, rate limits, service credentials, retention/data-residency posture, and AWS Secrets Manager rotation without committing the key.
- [ ] Test server-only credential use, explicit egress/admission denial, `store: false`, disabled tools/web access, strict structured output, pinned-model configuration, timeout, refusal, rate limit, retry/backoff, malformed schema, prompt injection, coordinate bounds/remapping, audit, token/cost metering, and provider kill switch.
- [ ] Evaluate the pinned model snapshot on the approved Vietnamese/English ground-truth receipt corpus. Record per-field extraction results, reconciliation and duplicate outcomes, coordinate validity, refusal/schema failure rate, latency, token use, and estimated cost against the versioned ReceiptCaptureProfile thresholds.
- [ ] Prove provider failure leaves immutable originals, manual correction, deterministic validation, typed manual analysis, existing dashboards, and the last complete snapshot usable.
- [ ] Re-run the provider evaluation before changing the model snapshot, prompt version, structured schema, preprocessing, or coordinate mapping.

### Task 4: Prove tenant isolation, authorization, and API protection

**Files:**

- Create: `services/api/test/features/dda/dda-tenant-isolation.e2e.test.ts`
- Create: `services/api/test/features/dda/dda-authorization-matrix.e2e.test.ts`
- Create: `services/api/test/features/dda/dda-rate-limit.e2e.test.ts`
- Modify: `services/api/src/platform/http/`
- Modify: `apps/web/security-headers.ts`
- Create: `docs/evidence/dda/security-and-tenant-report.md`

- [ ] Cover organization/workspace/project/resource scope, row/field/evidence projection, share resolution, filters, drill-down, downloads, SSE reconnect, cache keys, OpenAI egress, Desktop device grants, Android account switch, and revoked sessions/devices.
- [ ] Verify secure cookies/session rotation, CSRF, CORS allowlist, CSP, validation, RFC 7807 responses, upload/content limits, WAF/rate controls, and non-enumerating errors.
- [ ] Run secret, dependency, SAST, SBOM, provenance, prompt-injection, malicious spreadsheet/image, and standard security scans; close every critical/high finding or record an approved release-blocking exception.

### Task 5: Prove retention, deletion, legal hold, export, and provider privacy

**Files:**

- Create: `services/api/test/features/dda/dda-retention-deletion.e2e.test.ts`
- Create: `services/api/test/features/dda/dda-evidence-export.e2e.test.ts`
- Modify: `docs/operations/backup-and-restoration.md`
- Create: `docs/operations/dda-retention-deletion.md`
- Create: `docs/evidence/dda/privacy-retention-report.md`

- [ ] Test immutable-original retention, derived/reject/materialization/snapshot expiry, legal hold, deletion tombstones, recovery windows, permission-filtered export, audit preservation, and provider-request correlation cleanup.
- [ ] Confirm actual OpenAI default or approved enhanced retention controls, image-input handling, selected regional storage/processing posture, and privacy disclosures match production configuration.
- [ ] Prove ordinary telemetry excludes source values, receipt images/text, filenames, local paths, prompts containing customer content, evidence snippets, secrets, and provider responses.

### Task 6: Prove database, object, queue, and disaster recovery

**Files:**

- Modify: `docs/operations/backup-and-restoration.md`
- Modify: `docs/operations/deployment-and-rollback.md`
- Create: `docs/runbooks/dda-disaster-recovery.md`
- Create: `docs/evidence/dda/restore-drill-report.md`
- Create: `tools/recovery/verify-dda-restore.mjs`

- [ ] Restore a recent production-shaped RDS snapshot/PITR point into isolated staging and verify tenant counts, migrations, outbox, jobs, versions, audit bindings, and dashboard snapshots.
- [ ] Recover versioned object content and prove hashes/lineage/evidence remain valid; verify delete markers, lifecycle, legal hold, and KMS recovery behavior.
- [ ] Prove Redis loss does not lose authoritative work, duplicate refresh/provider callbacks remain idempotent, stuck leases recover, and queues apply bounded retries/dead-letter handling.
- [ ] Record measured RPO/RTO, exact restore commands, owners, access controls, failure results, and corrective actions.

### Task 7: Add production observability, alarms, and incident operations

**Files:**

- Modify: `infrastructure/observability/README.md`
- Modify: `services/api/src/platform/telemetry.ts`
- Modify: `services/engine/src/databreeze_engine/telemetry.py`
- Create: `docs/runbooks/dda-incident-response.md`
- Create: `docs/runbooks/dda-openai-outage.md`
- Create: `docs/evidence/dda/observability-alarm-report.md`

- [ ] Correlate intake, ETL, dataset, analysis, dashboard, materialization, snapshot, folder/device, receipt, OpenAI, usage, and audit identifiers using content-safe fields only.
- [ ] Create dashboards and actionable alarms for API/worker health, queue age, failed/stuck jobs, refresh freshness, snapshot failures, cache isolation errors, RDS/Redis/S3 health, OpenAI latency/rate-limit/refusal/schema errors/tokens/cost, Android sync failures, and Desktop source unavailability.
- [ ] Test paging routes, alarm ownership, runbook links, provider kill switch, feature flags, audit access, support diagnostics, and incident communication.

### Task 8: Prove performance, capacity, concurrency, and cost controls

**Files:**

- Modify: `tools/performance/dda-refresh-reference.mjs`
- Create: `tools/performance/dda-load.mjs`
- Create: `tools/performance/dda-openai-budget.mjs`
- Create: `docs/evidence/dda/performance-cost-report.md`

- [ ] Run declared cloud/local file, dashboard, cached interaction, analyst, refresh, receipt upload, concurrency, and backpressure reference profiles from the DDA specification.
- [ ] Prove the 60-second p95 on-change target for the reference change set, atomic last-good behavior under failures, no idle polling, and no per-view raw-dataset scan.
- [ ] Verify workspace/global admission, fair queueing, cancellation, retry limits, OpenAI image/text token budgets, concurrency, cache retention/eviction, storage limits, and safe denial without data loss.
- [ ] Configure AWS and OpenAI spend alerts manually and reconcile provider usage with BUA metering.

### Task 9: Complete Web quality, accessibility, localization, and browser release checks

**Files:**

- Modify: `apps/web/test/`
- Modify: `apps/web/e2e/`
- Modify: `apps/web/security-headers.ts`
- Modify: `apps/web/scripts/check-bundle-budget.mjs`
- Create: `docs/evidence/dda/web-accessibility-localization-report.md`

- [ ] Test supported browsers and responsive breakpoints for upload, ETL review, analyst, canvas, publication, sharing, refresh, failures, empty/loading states, and account deletion/export.
- [ ] Complete keyboard, focus, screen-reader, contrast, reduced-motion, chart alternative/table, error association, evidence/warning visibility, and WCAG 2.2 AA review.
- [ ] Verify Vietnamese default and complete English copy, date/number/currency/timezone formatting, untranslated source values, CSP/security headers, bundle budgets, and immutable asset rollback.

### Task 10: Sign and verify the Windows Desktop release

**Files:**

- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/main/window-policy.ts`
- Modify: `apps/desktop/src/main/navigation-policy.ts`
- Modify: `apps/desktop/src/main/ipc-registry.ts`
- Modify: `apps/desktop/test/`
- Create: `docs/runbooks/dda-desktop-release.md`
- Create: `docs/evidence/dda/desktop-release-report.md`

- [ ] Configure the approved publisher identity and protected signing credential; generate signed installer/update artifacts and verify their hashes/provenance.
- [ ] Run Electron security, IPC sender/schema, sandbox/context-isolation, CSP/navigation, path escape, approved-folder, sidecar signature, offline/revocation, install/update/uninstall, and clean-Windows-machine checks.
- [ ] Prove failed update rollback preserves governed local state and no production package contains secrets, local databases, customer paths, fixtures, or debug endpoints.

### Task 11: Sign, disclose, and verify the Android release

**Files:**

- Modify: `apps/android/app/build.gradle.kts`
- Modify: `apps/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/android/app/src/main/res/xml/network_security_config.xml`
- Modify: `apps/android/app/src/main/res/xml/backup_rules.xml`
- Modify: `apps/android/app/src/main/res/xml/data_extraction_rules.xml`
- Modify: `apps/android/app/src/androidTest/`
- Create: `docs/runbooks/dda-android-release.md`
- Create: `docs/evidence/dda/android-release-report.md`

- [ ] Configure the permanent package ID, Play App Signing/upload key, release minification, certificate/network policy, backup/data extraction, versioning, and protected CI signing secrets.
- [ ] Test CameraX permissions, encrypted staging, WorkManager process-death/reboot/network retry, idempotent upload, account/workspace isolation, OCR review/correction, duplicate handling, deletion/logout/revocation, accessibility/localization, and dashboard refresh on representative real devices.
- [ ] Manually complete privacy policy, Data Safety, account-deletion URL/in-app path, store listing, screenshots, content rating, support contact, closed testing, review responses, and staged rollout.

### Task 12: Harden CI/CD, migrations, supply chain, and rollback

**Files:**

- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/security.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/README.md`
- Modify: `docs/operations/deployment-and-rollback.md`
- Modify: `docs/operations/secret-rotation.md`
- Modify: `docs/operations/release-channels.md`
- Create: `docs/evidence/dda/release-pipeline-report.md`

- [ ] Use GitHub OIDC and protected environments with required reviewers; prohibit long-lived AWS keys and OpenAI secrets in workflow files/logs/artifacts.
- [ ] Gate release on formatting, lint, types, contracts, requirements, orchestration, unit/integration/e2e/security/accessibility/load/provider evals, SBOM/provenance, migration rehearsal, and signed artifacts.
- [ ] Rehearse expand/migrate/verify/contract database changes against restored staging, ECS rollback, Web immutable artifact rollback, processor disable/requeue, Desktop update rollback, and Android staged halt.
- [ ] Verify every kill switch and rollback preserves immutable originals, outbox/audit rows, last complete snapshots, and recoverable jobs.

### Task 13: Run end-to-end acceptance, support rehearsal, and staged release

**Files:**

- Modify: `docs/runbooks/dda-end-to-end-journey.md`
- Create: `docs/runbooks/dda-support.md`
- Create: `docs/runbooks/dda-launch-checklist.md`
- Create: `docs/evidence/dda/production-acceptance-report.md`

- [ ] Run the complete Vietnamese-default and English-switch journey from clean clients: messy CSV/XLSX to reviewed ETL/dataset/dashboard; Desktop folder update to affected atomic refresh; Android receipt through live OpenAI extraction/review/acceptance to expense refresh.
- [ ] Exercise OpenAI outage, source-device offline/revoked, stale data, schema drift, rejected rows, duplicate receipt, failed refresh, rollback, deletion/export, and support diagnostics.
- [ ] Train the support owner on content-safe diagnostics, escalation, incident roles, customer communication, privacy requests, provider incidents, billing/cost anomalies, and rollback authority.
- [ ] Deploy disabled-by-default to production, run synthetic smoke checks, enable invited tenants progressively, watch alarms/cost/freshness/error budgets, and stop or roll back on a failed gate.

### Task 14: Approve the production release

**Files:**

- Modify: `docs/evidence/dda/production-gate-matrix.md`
- Modify: `docs/evidence/dda/release-manifest.json`
- Modify: `docs/evidence/dda/release-readiness.md`
- Modify: `docs/plans/requirement-traceability.json`
- Modify: `docs/plans/data-to-dashboard-orchestration.json`

- [ ] Confirm every required P0/P1 record is verified with exact existing evidence and fresh passing commands; keep `DDA-051` deferred.
- [ ] Confirm no open critical/high security issue, failed restore, missing signing identity, skipped required device/browser/provider check, unresolved migration/rollback problem, or missing legal/privacy/store declaration.
- [ ] Record the release owner, versions, environment, OpenAI project/model/prompt/schema configuration, migration state, rollback target, alert links, support/on-call contacts, staged audience, and final approval.
- [ ] Confirm every applicable item in `MANUAL-PREREQUISITES.md` is `ready` with content-safe evidence, or explicitly `not-applicable` with product-owner approval.
- [ ] Mark G5 complete only after the production rollout and its rollback path are both verified.

## Definition of done

- The complete Web, Desktop, and Android product journey works against production-shaped AWS services and the live evaluated OpenAI adapter.
- Every displayed material number remains deterministic and evidence-backed; OpenAI output remains candidate/proposal data.
- Tenant, permission, cache, data-mode, retention, audit, deletion/export, offline, provider-failure, recovery, accessibility, performance, cost, signing, and rollback evidence passes.
- Staging and production are reproducible from reviewed infrastructure and release configuration.
- Signed artifacts, release manifest, SBOM/provenance, migrations, runbooks, alarms, restore report, provider evaluation, staged rollout, and support ownership exist.
- The integration owner and product owner approve the exact evidence; no schedule or successful demo substitutes for these gates.
