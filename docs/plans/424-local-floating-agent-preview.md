# Plan 424 — Local floating-agent approved-data preview

**Status:** Implemented locally; provider-gated production behavior remains unchanged.

## Outcome

Keep the dashboard/data floating agent useful on a local installation when the
server AI provider is intentionally disabled. When the active authorized
conversation is bound to an approved import, the popup may show the existing
server-owned bounded dashboard preview as a deterministic local insight.

## Authority and safety boundary

- Reuse the existing `dataImportApi.list` and `dashboardPreview` routes. The
  browser must not read source files, infer tenant scope, or fabricate rows.
- Only imports returned by the authenticated server and matching the
  conversation's authorized dataset bindings may be used.
- The response must be labelled as a local approved-data preview, never as an
  AI completion or certified dashboard snapshot.
- The preview is presentation-only. It is not persisted as an assistant
  message, does not mutate a conversation, and disappears on reload.
- Provider errors, forbidden scopes, missing imports, or invalid responses stay
  visible as honest unavailable states; no success fallback is shown when no
  approved preview exists.

## Scope

1. Reuse the approved-preview analysis helper in the floating agent panel.
2. On a provider-unavailable turn, resolve only the active conversation's
   authorized dataset bindings to approved imports and request bounded previews.
3. Render the local answer in the existing premium chat shell while preserving
   the user's server-recorded message and keeping the draft retryable on error.
4. Add Web tests for matching imports, multiple datasets, no-preview behavior,
   provider errors, and reload-safe presentation.

## Verification

- Focused floating-agent tests and Web typecheck.
- Existing Analysis/local-preview tests remain green.
- `git diff --check` and the local lifecycle static suite remain green.

## Non-goals

- No OpenAI key handling or provider enablement.
- No new API route, persistence model, dashboard mutation, or certified result.

## Implementation checkpoint

- `FloatingAgentPanel` now keeps the server-authorized conversation summaries,
  resolves only matching `READY` imports, and requests the existing bounded
  dashboard preview after an `AGENT_TURN_UNAVAILABLE` response.
- The response is rendered as a local approved-data preview and is appended
  only to the in-memory presentation; a reload rehydrates the server
  conversation without the local assistant message.
- Focused Web coverage: 11/11 floating-agent tests; Web typecheck and
  formatting/diff checks pass.
