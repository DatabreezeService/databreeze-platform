# Platform Owner Console Implementation Plan

**Status:** Approved for implementation
**Approved by:** Product owner in the active implementation conversation on 2026-08-16
**Requirements:** IAM-002, IAM-003, IAM-012, IAM-017, IAM-026; BUA-005, BUA-011, BUA-024; AUD-001, AUD-002, AUD-014; WEB-002, WEB-003, WEB-013, WEB-014, WEB-015, WEB-021, WEB-025

## Outcome

Deliver a separate, read-only DataBreeze internal console where an explicitly assigned platform owner can inspect authoritative product adoption and commercial health: users, organizations, workspaces, active sessions, subscriptions by plan/state, settled revenue, payment outcomes, and bounded recent customer/subscription activity. The existing workspace dashboard and tenant `Owner`/`Admin` roles remain unchanged.

## Visual direction

- **Visual thesis:** a calm, table-first operations surface using the existing DataBreeze blue as the only strong accent, dense enough for daily monitoring but quieter than the customer dashboard.
- **Content plan:** scope/freshness header, a compact KPI line, subscription and revenue trends, status/plan distributions, then bounded recent customer and payment tables.
- **Interaction thesis:** URL-safe period/status filters, immediate row focus and table sorting, and restrained loading/section transitions that respect reduced motion.

## Architecture and security

- IAM owns the new persisted `PlatformOperator` assignment and current-role lookup. `PLATFORM_OWNER` and `PLATFORM_SUPPORT` are not tenant memberships.
- A new platform-administration composition consumes IAM-owned identity aggregates and BUA-owned commercial aggregates through public ports. No feature reads another feature's persistence.
- Every API request first resolves the current short-lived session, then checks the current platform assignment by actor ID. Client claims never authorize platform access.
- This slice is read-only. Account mutation, impersonation, plan overrides, refunds, subscription changes, and provider administration are deferred and require recent MFA plus dedicated audited commands.
- Responses are closed, generated contracts. They expose bounded identity/contact metadata necessary for support but no artifacts, dataset/source values, payment credentials, tax data, webhook payloads, or provider secrets.
- Local seed data is synthetic, deterministic, idempotent, and clearly labeled. Production platform assignments are never created from repository seed defaults.

## Tasks

### Task 1: Add the platform-admin-overview generated contract and fixtures

**Primary requirements:** IAM-026; BUA-024; WEB-025

Add the v4 `platform-admin-overview` generated contract and valid/invalid fixtures.

### Task 2: Add IAM platform-operator persistence and aggregates

**Primary requirements:** IAM-026

Add IAM platform-operator persistence, an additive migration, current-role authority, and identity aggregate adapter.

### Task 3: Add the BUA commercial aggregate adapter

**Primary requirements:** BUA-024

Add the BUA commercial aggregate adapter over subscription, invoice, and payment projections.

### Task 4: Compose the protected overview endpoint

**Primary requirements:** IAM-026; BUA-024; WEB-025

Compose the protected `GET /v1/platform-admin/overview` endpoint with stable 401/403/503 behavior and requirement-linked tests.

### Task 5: Extend the local seed for the platform owner journey

**Primary requirements:** IAM-026

Extend the local seed with `platform-owner@databreeze.local`, an active `PLATFORM_OWNER` assignment, and deterministic synthetic organizations, users, subscriptions, invoices, and payments.

### Task 6: Add the localized platform-admin Web console

**Primary requirements:** WEB-025; WEB-002; WEB-003

Add the localized `/platform-admin` Web route, runtime contract validation, separate internal navigation, responsive tables/charts, loading/empty/error/forbidden states, and accessibility tests.

### Task 7: Verify the slice end to end

**Primary requirements:** WEB-025; IAM-026; BUA-024

Verify Prisma schema/migration, generated contracts, API tests/OpenAPI, Web unit/build checks, requirement index, and a browser sign-in journey using the platform-owner seed account.

## Acceptance

- A normal workspace Owner/Admin receives `403` and no aggregate body from the platform endpoint.
- An active seeded platform owner signs in normally, opens the separate console, and sees values computed from the database rather than the customer dashboard demo fixture.
- Suspending the platform assignment removes access without modifying organization/workspace memberships.
- The overview is bounded and content-minimized; no response contains source paths, artifact/dataset content, credentials, provider secrets, webhook payloads, or client-supplied counters.
- Vietnamese is the default complete locale; English is complete; keyboard, focus, table semantics, non-color status, reduced motion, and narrow layouts are tested.

## Deferred

- Cross-tenant source-content access or impersonation.
- Customer/account mutation, support overrides, refunds, plan grants, suspension, deletion, or ownership transfer.
- Live streaming analytics, arbitrary report builders, data warehouse adoption, and third-party analytics as authority.
