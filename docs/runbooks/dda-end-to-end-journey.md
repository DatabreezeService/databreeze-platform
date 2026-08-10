# DDA End-to-End Journey (Local / Code-First)

**Authority:** plan `402` Task 9, plan `401` G5  
**Status:** Local code paths exist; live AWS/OpenAI/device acceptance remains blocked on MANUAL-PREREQUISITES.

## Purpose

Rehearse the production-shaped Data-to-Dashboard journey against local authenticated services and synthetic fixtures without owner secrets.

## Preconditions

- Clean checkout of `codex/dda-400-production` (or descendant)
- PostgreSQL + Redis available for local API/worker (no customer data)
- No live OpenAI key, AWS account, Play signing, or Windows signing identity required for this runbook

## Journey steps (agent-local)

1. **Contracts** — `corepack pnpm contracts:check` (includes v1 + v2 receipt-upload fixtures)
2. **API / engine** — focused DDA domain + engine tests; durable runtime migration present
3. **Web** — live draft GET client fail-closed without auth; Playwright golden journey under `apps/web/e2e/`
4. **Desktop** — governed folder intake + typed sidecar jobs (unsigned package only)
5. **Android** — JVM unit/lint/assemble; authenticated upload/extraction clients with contracts v2 envelopes
6. **Offline OpenAI eval** — `tools/fixture-validation` offline corpus only (`liveEvaluation` remains credential-gated)
7. **Infra validate** — `corepack pnpm infra:validate` (OpenTofu container; never apply)

## Explicitly out of scope here

- Staging/production apply, live provider OCR quality promotion, signed artifacts, Play/store listing, legal approval, G5

## Failure handling

Any missing credential or external account must fail closed and record `blocked` with the MANUAL-PREREQUISITES section ID. Do not fabricate success.
