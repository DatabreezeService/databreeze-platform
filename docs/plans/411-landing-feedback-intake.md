# Landing Feedback Intake Implementation Plan

**Status:** Approved for implementation
**Approved by:** Product owner in the active implementation conversation on 2026-08-17
**Requirements:** WEB-026, WEB-027; IAM-026 (reuse); WEB-025 (reuse)

## Outcome

Connect the public landing-page feedback form to real persistence and make the platform owner console's Feedbacks tab server-authoritative. A visitor submits the existing form; the API validates the closed v4 command contract, applies IP admission throttling, and stores a content-minimized record. An actively assigned platform operator reads the bounded latest feedbacks through the protected console endpoint. The Overview tab remains unchanged.

## Architecture and security

- A new `lfb` feature owns landing feedback persistence in its own `lfb` database schema (documented in the platform `SchemaRegistry`). Records are public marketing data with no tenant columns, no artifacts, and no raw IP storage — only an HMAC admission digest.
- `POST /v1/landing/feedbacks` is public and anonymous, following the IAM registration controller pattern. It validates the request with the generated `lfb-landing-feedback-command` contract, admits through an injectable IP admission port (in-memory locally, Redis-backed in production composition), and returns the closed `lfb-landing-feedback-accepted` receipt.
- `GET /v1/platform-admin/feedbacks` reuses the existing per-request session resolution and `PlatformOperatorAuthorityPortV1` check. Tenant Owner/Admin receives `403`. The platform-admin composition consumes the lfb-owned bounded list port; it never reads lfb persistence directly.
- The admin read contract `platform-admin-feedbacks` is closed and bounded to the latest 200 submissions. It exposes contact metadata the visitor chose to submit and nothing else: no IP digests, no counters derived from client claims.
- Local seed data is synthetic, deterministic, idempotent, and clearly labeled. Production creates no feedback rows from repository seed defaults.

## Tasks

### Task 1: Add the generated landing feedback contracts

**Primary requirements:** WEB-026; WEB-027

**Files:**

- Add: `packages/contracts/schemas/v4/lfb-landing-feedback-command.schema.json`
- Add: `packages/contracts/schemas/v4/lfb-landing-feedback-accepted.schema.json`
- Add: `packages/contracts/schemas/v4/platform-admin-feedbacks.schema.json`
- Modify: `packages/contracts/manifest.json`, `packages/contracts/package.json`
- Add: `packages/test-fixtures/contracts/v4/payloads/lfb-landing-feedback-command/`, `packages/test-fixtures/contracts/v4/payloads/lfb-landing-feedback-accepted/`, `packages/test-fixtures/contracts/v4/payloads/platform-admin-feedbacks/`
- Modify: `packages/test-fixtures/contracts/v4/manifest.json`, `packages/contracts/test/schemas.test.mjs`, generated outputs under `packages/contracts/generated/`

Add the v4 `lfb-landing-feedback-command`, `lfb-landing-feedback-accepted`, and `platform-admin-feedbacks` generated contracts with valid/invalid fixtures.

### Task 2: Add lfb persistence and bounded adapters

**Primary requirements:** WEB-026

**Files:**

- Add: `services/api/prisma/schema/lfb.prisma`
- Add: `services/api/prisma/migrations/20260817010000_lfb_landing_feedbacks/`
- Modify: `services/api/prisma/schema/platform.prisma`, `services/api/test/prisma-foundation.test.mjs`
- Add: `services/api/src/features/lfb/adapter/prisma-landing-feedback.adapter.ts`, `services/api/src/features/lfb/adapter/in-memory-landing-feedback.adapter.ts`

Add lfb Prisma persistence, an additive migration creating the `lfb` schema, and the bounded in-memory adapter used by tests.

### Task 3: Compose the public throttled intake endpoint

**Primary requirements:** WEB-026

**Files:**

- Add: `services/api/src/features/lfb/application/landing-feedback-intake.port.ts`, `services/api/src/features/lfb/application/landing-feedback.service.ts`
- Add: `services/api/src/features/lfb/api/landing-feedback.controller.ts`, `services/api/src/features/lfb/api/landing-feedback.dto.ts`
- Add: `services/api/src/features/lfb/adapter/in-memory-landing-feedback-admission.adapter.ts`, `services/api/src/features/lfb/adapter/sha256-landing-feedback-admission-digest.adapter.ts`
- Add: `services/api/src/features/lfb/lfb.module.ts`
- Modify: `services/api/src/app.module.ts`, `services/api/src/bootstrap.ts`, `services/api/src/platform/production-database.composition.ts`, `services/api/src/platform/http/problem-details.filter.ts`, `packages/i18n/src/catalogs-v1.ts`
- Modify: `services/api/test/openapi.test.ts`
- Add: `services/api/test/features/lfb/landing-feedback.controller.test.ts`

Compose `POST /v1/landing/feedbacks` with stable 400/429 problem-details behavior and requirement-linked tests.

### Task 4: Extend platform administration with the protected feedbacks read

**Primary requirements:** WEB-027; IAM-026

**Files:**

- Modify: `services/api/src/features/platform-admin/api/platform-admin.controller.ts`, `services/api/src/features/platform-admin/application/platform-admin.service.ts`, `services/api/src/features/platform-admin/platform-admin.module.ts`
- Modify: `services/api/test/features/platform-admin/platform-admin.controller.test.ts`, `services/api/test/features/platform-admin/platform-admin.service.test.ts`

Extend platform administration with the protected bounded `GET /v1/platform-admin/feedbacks` read.

### Task 5: Replace the prototype fake submit with real anonymous submission

**Primary requirements:** WEB-026

**Files:**

- Add: `apps/web/src/features/landing/landing-feedback-api.ts`
- Modify: `apps/web/src/features/landing/landing-page.tsx`
- Modify: `prototypes/databreeze-landing/script.js`, `prototypes/databreeze-landing/index.html`

Replace the landing prototype's discarded fake submit with a real anonymous API submission, keeping the existing validation UX and bilingual status copy.

### Task 6: Make the console Feedbacks tab server-authoritative

**Primary requirements:** WEB-027

**Files:**

- Modify: `apps/web/src/features/platform-admin/platform-admin-api.ts`, `apps/web/src/features/platform-admin/platform-admin-page.tsx`
- Remove: `apps/web/src/features/platform-admin/landing-feedbacks-data.ts`
- Modify: `apps/web/test/platform-admin-feedbacks.test.tsx`
- Add: `apps/web/test/landing-feedback-form.test.tsx`

Replace the console Feedbacks tab mock dataset with the fetched contract-validated payload, preserving filters, accessibility, and bilingual copy.

### Task 7: Seed local feedback rows and verify the slice end to end

**Primary requirements:** WEB-026; WEB-027

**Files:**

- Modify: `services/api/scripts/seed-local.mjs`
- Modify: `services/api/openapi/v1.json`, `docs/plans/requirement-traceability.json`, `tools/repo-cli/test/plan-traceability.test.mjs`

Extend the local seed with the 12 deterministic synthetic feedback rows and verify Prisma, contracts, OpenAPI, web checks, and the local browser journey.

## Acceptance

- A valid landing form submission returns `201` with a closed receipt and is persisted exactly once per request; invalid, over-long, or extra-field bodies return `400` without partial storage.
- Repeated submissions from one source beyond the admission limit receive `429` and are not stored.
- A tenant Owner/Admin receives `403` from the feedbacks read; an active platform operator receives the bounded closed payload; a suspended assignment fails closed.
- The Feedbacks tab renders only server data with loading/forbidden/error states; the hardcoded dataset is deleted.
- Vietnamese is the default complete locale; English is complete; existing keyboard, focus, feed semantics, non-color status, and reduced-motion behavior are preserved.

## Deferred

- Moderation/triage states, replies, email notifications, CSV export, retention automation, honeypot/captcha, and server-side pagination beyond the bounded 200-item window.
