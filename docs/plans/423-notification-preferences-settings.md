# Plan 423 — Notification preferences settings

Status: approved for implementation as part of the product-owner request to make the user settings surface complete.

## Goal

Give an authenticated workspace member a real, persisted notification-preferences screen. The screen must support per-category/channel enablement, minimum urgency, immediate versus digest delivery, quiet hours, and locale-safe timezone selection. Mandatory security, billing-access, and data-loss notices remain server-enforced and cannot be disabled by the client.

## Requirements

- NCO-006 — apply preferences per organization/workspace, category, urgency, channel, quiet hours, and digest schedule.
- NCO-018 — workspace administrators may configure workspace delivery policy without reading private notification content.
- NCO-021 — use generated closed contracts; published v3 notification schemas remain immutable.
- NCO-024 — bind mutations to the authenticated recipient, exact scope, revision, and idempotency key.
- WEB-001/WEB-002 — Vietnamese default, complete English copy, accessible and responsive settings UI.

## Compatibility decision

The published v3 package already has a compatibility baseline and contains notification list/state schemas but no preference schema. Do not mutate v3. Add an unpublished v4 preference read/update contract and expose the additive `/v4/notification-preferences` transport until a coordinated notification-major release can move the complete NCO surface together.

## Scope

1. Add closed v4 preference snapshot/command/accepted contracts, generated models, and parity fixtures.
2. Add a revisioned, scoped IAM/DDA preference port with Prisma and in-memory adapters. Mandatory categories are enforced server-side.
3. Add authenticated GET/PUT controller routes with idempotency and optimistic revision handling.
4. Add a premium blue, keyboard-accessible notification-preferences section to workspace settings with loading, conflict, unavailable, and save-success states.
5. Add requirement-linked unit/controller/Prisma/Web tests and update migration inventory/OpenAPI.

## Non-goals

- Provider delivery, push/email credentials, Slack/Discord, or digest scheduling workers.
- Suppressing mandatory security, billing-access, or data-loss notices.
- Changing published v1–v3 contracts or existing notification list/state behavior.
