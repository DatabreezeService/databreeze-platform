# Plan 421 — Local approved-data analysis preview

**Status:** Approved for implementation as part of the owner-approved local product goal.

**Requirements:** DDA-053, DDA-055, DDA-056, WEB-024

## Goal

Keep the authenticated Analysis surface useful on a local installation when the
server-side AI provider is intentionally disabled. If a selected dataset has an
approved import, the Web client may request the existing server-owned bounded
dashboard preview and present a deterministic, clearly labelled local insight.

## Safety boundary

- The preview remains server-scoped and is fetched through the existing
  `dataImportApi.dashboardPreview` route.
- The fallback never fabricates values, calls a provider from the browser, or
  mutates a dashboard.
- The response copy must identify itself as a local approved-data preview, not
  as an AI answer or certified materialized snapshot.
- The server conversation still receives the user message; the local assistant
  message is a client-side presentation cache keyed by the authorized
  conversation and is discarded when the conversation context changes.

## Verification

- Web tests cover fallback on provider unavailability, approved-preview
  aggregation, no-preview behavior, and reload-safe rendering.
- Web typecheck, focused tests, production build, and diff hygiene pass.
