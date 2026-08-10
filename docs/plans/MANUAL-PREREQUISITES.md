# DataBreeze Production Owner Manual Prerequisites

**Status:** Required external-authority checklist<br>
**Release effect:** Any applicable unchecked item blocks G5 production approval<br>
**Related plans:** `080-data-to-dashboard-program.md`, `400-production-readiness.md`, `CURSOR-HANDOFF.md`

Cursor or another coding agent can implement code, infrastructure definitions, tests, migrations, runbooks, and evidence collection. It cannot truthfully create or approve accounts, legal declarations, payment relationships, publisher identities, private signing keys, customer-data policy, or organizational risk acceptance on the product owner's behalf.

Never paste a production secret, API key, signing key, customer receipt, or customer dataset into chat, source control, fixtures, screenshots, issue trackers, or ordinary logs. Enter secrets only through the approved provider console or protected secret workflow described by the implementation.

Use this state vocabulary for each applicable item: `not-ready`, `in-progress`, `ready`, or `not-applicable`. A `ready` item needs a content-safe evidence reference; do not record the secret itself.

## 1. Product ownership and stable identifiers

- [ ] Name the production release owner and the people authorized to approve security, privacy, spending, rollback, and final release.
- [ ] Confirm the legal/publisher display name, support contact, security contact, privacy contact, and incident-communication owner.
- [ ] Choose the production domain and confirm who controls its registrar and DNS.
- [ ] Freeze the Android application ID/package name before the first production-signed build.
- [ ] Freeze the Windows publisher identity used by the installer and update channel.
- [ ] Approve the staging and production environment/account names, initial tenant cohort, and release audience.

## 2. AWS account and hosting authority

- [ ] Provide staging and production AWS accounts or approve an equivalent isolation design; secure root access and billing with organization-approved MFA and recovery contacts.
- [ ] Approve `ap-southeast-1` as the initial region and confirm that the planned data location and subprocessors match the product's privacy commitments.
- [ ] Provide a billing method, AWS Budgets thresholds, cost-alert recipients, service-quota escalation owner, and maximum acceptable monthly spend.
- [ ] Authorize the bootstrap role and GitHub Actions OIDC/protected-environment trust. Do not provide long-lived AWS access keys to Cursor.
- [ ] Provide DNS access for domain validation and approve the production certificate, email-sender domain, and any required notification/push registrations.
- [ ] Enter production secret values through AWS Secrets Manager or the approved protected workflow after Cursor creates the secret definitions and least-privilege access policies.
- [ ] Approve production retention periods, backup/PITR retention, RPO, RTO, legal-hold behavior, log retention, and deletion/recovery windows.

## 3. OpenAI project, data controls, and model approval

- [ ] Create or authorize a dedicated OpenAI production project with an organization-owned billing method, service account, spend limits, rate limits, and named owner.
- [ ] Review and approve the actual OpenAI retention, regional processing/storage, and any eligible Zero Data Retention or Modified Abuse Monitoring configuration; ensure product disclosures match the approved project.
- [ ] Create the production service credential and place it directly in AWS Secrets Manager. Never give the key to Web, Desktop, Android, source control, fixtures, or chat.
- [ ] Approve which workspace data classes may leave DataBreeze for OpenAI, for which purposes, and whether original receipt images, crops, metadata, samples, result rows, or evidence are permitted.
- [ ] Supply or approve a versioned, non-customer Vietnamese/English receipt ground-truth corpus with verified expected fields and evidence coordinates.
- [ ] Approve extraction thresholds for required fields, reconciliation, coordinates, refusal/schema failures, latency, and cost.
- [ ] Approve the exact production model snapshot only after the repository evaluation passes. Model, prompt, schema, preprocessing, or coordinate-mapping changes require reevaluation.

## 4. Test data, devices, and acceptance users

- [ ] Supply approved synthetic or explicitly licensed messy CSV/XLSX fixtures and expected governed results for the target business use cases.
- [ ] Confirm the initial KPI vocabulary, currency/timezone behavior, example dashboard expectations, and what constitutes an acceptable non-answer or clarification.
- [ ] Provide representative supported Windows machines, Android devices, browsers, network conditions, and accessibility testing access.
- [ ] Name the invited staging and production pilot users and obtain permission for their data to be processed under the approved policies.
- [ ] Keep all customer data out of source control and shared evaluation fixtures; use a protected production-like test process when real data is legally required.

## 5. Windows distribution

- [ ] Obtain or authorize an organization-controlled Windows code-signing identity/service and protect its private credential outside developer machines and source control.
- [ ] Approve installer publisher text, application identity, release/update channels, supported Windows versions, and rollback policy.
- [ ] Provide access to any chosen Windows distribution portal and complete its organization verification and legal agreements.
- [ ] Approve the signed installer/update artifacts after clean-machine install, update, rollback, and uninstall evidence passes.

## 6. Android and Google Play distribution

- [ ] Provide an organization-controlled Google Play developer account and complete its identity, payment, and legal verification.
- [ ] Enable Play App Signing, protect the upload key in the approved signing service/CI secret store, and authorize release managers.
- [ ] Publish the privacy-policy and account-deletion URLs required by the chosen production behavior.
- [ ] Complete and approve the Data Safety declaration, content rating, target audience, permissions disclosures, store listing, screenshots, support contact, and review responses.
- [ ] Provide closed-test users and representative real devices; approve each staged rollout increase or halt.
- [ ] Create and authorize an FCM project/credential only if production push notifications are enabled; keep the server credential out of clients and source control.

## 7. Legal, privacy, security, and commercial decisions

- [ ] Approve the privacy policy, terms, retention/deletion/export behavior, subprocessors including AWS and OpenAI, and any required consent or data-processing agreement.
- [ ] Decide which data classifications and countries/tenant types the first release accepts; block unsupported regulated or residency-sensitive use until separately approved.
- [ ] Name the owner for privacy requests, security reports, legal holds, breach notification, and risk acceptance.
- [ ] Review the final security findings and approve only documented exceptions with an owner and expiry; unresolved critical/high issues remain release blockers.
- [ ] Decide whether V1 is private/noncommercial, entitlement-only, or paid. If paid, separately approve pricing, taxes, refunds, invoicing, and payment-provider terms before enabling billing.

## 8. Operations, support, budgets, and release approval

- [ ] Name on-call and support owners, escalation paths, paging destinations, incident communication channels, and provider support contacts.
- [ ] Approve AWS/OpenAI workspace and global budgets, concurrency limits, rate limits, storage quotas, cache retention, and denial/remediation copy.
- [ ] Participate in the restore, rollback, OpenAI-outage, source-device-offline, privacy-request, and incident-response rehearsals; accept the measured RPO/RTO or block release.
- [ ] Approve the production dashboard/alert links, runbooks, support diagnostics, status communication, and maintenance ownership.
- [ ] Review the final release manifest, SBOM/provenance, migrations, signed artifacts, provider evaluation, accessibility/security/performance evidence, staged audience, and rollback target.
- [ ] Give explicit final production approval only after G5 evidence passes; retain the authority to halt or roll back the staged release.

## What Cursor should do when an item is missing

1. Continue any dependency-safe work that does not require the missing authority or secret.
2. Produce the exact content-safe setup instructions, expected secret/configuration name, validation command, and evidence destination.
3. Mark the affected task `blocked` with the checklist item and never insert a fake credential, fabricated approval, placeholder production evidence, or silently weakened fallback.
4. After the owner completes the action, validate the resulting configuration without exposing the secret and attach fresh evidence to the applicable plan-400 gate.

## Agent status snapshot (`codex/dda-400-production`)

All checklist items above remain `not-ready` unless the product owner updates them. Agent-prepared artifacts:

| Item | Expected secret / config | Validation | Evidence destination |
|---|---|---|---|
| §2 Secrets Manager OpenAI | `databreeze/{env}/openai/receipt-ocr` | `aws secretsmanager describe-secret --secret-id ... --query ARN` | `docs/operations/openai-provider-runbook.md` |
| §2 Staging/production compose | OpenTofu envs under `infrastructure/aws/environments/{staging,production}` | `pnpm infra:check` (plan-only; no apply) | `docs/evidence/dda/production-gate-matrix.md` |
| §3 OpenAI API key | Inject as `OPENAI_API_KEY` to API/worker only | `openai-egress-policy.test.ts` fail-closed | `docs/evidence/dda/openai-receipt-evaluation.md` (pending) |
| §3 Model pin | `DATABREEZE_OPENAI_RECEIPT_MODEL` | Eval harness after corpus approval | same |
| §5 Desktop signing | CI secret for Windows signing identity | Signed installer hash verification | `docs/evidence/dda/desktop-release-report.md` |
| §6 Android signing | Play upload key in protected store | Bundletool / Play closed test | `docs/evidence/dda/android-release-report.md` |
