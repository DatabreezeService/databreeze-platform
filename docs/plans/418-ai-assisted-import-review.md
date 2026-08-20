# Plan 418 — AI-assisted import review suggestions

Status: Approved for implementation by product owner instruction in the active task.

## Outcome

Expose the existing governed mapping-assistance capability inside the durable upload/review flow. A user may explicitly request bounded suggestions after upload; the server derives the tenant, schema/profile context, headers, type profiles, and samples from the persisted import record. Suggestions are advisory only, visible beside the before/after review, and never mutate or approve data automatically.

## Requirements

- DDA-005/006/008/010/011/036/043-045: provider use is policy-gated, sample consent is explicit, payloads are bounded, hostile source content is rejected, suggestions are allowlisted and non-authoritative, and usage/audit outcomes remain content-safe.
- WEB-021: the review state remains reloadable and approval/correction stays on the revisioned server command path.
- Vietnamese remains the default locale and the UI must distinguish unavailable/denied/empty suggestion states from successful suggestions.

## Scope and acceptance

1. Add a server-owned mapping-suggestions command under the data-import resource. The request accepts only an explicit sample-consent boolean; all tenant and source authority is derived from the authenticated import record.
2. Build the bounded mapping request from persisted source fields/types/sample rows and reject imports that are not in reviewable states.
3. Compose the existing `MappingAssistanceServiceV1` with a fail-closed default and an optional OpenAI adapter; no API key or provider secret is stored in source or returned to the browser.
4. Parse the response at the Web boundary. Render suggestions in the review workspace with source/target, rationale, uncertainty, and an explicit advisory label. A suggestion may be copied into the correction composer but cannot be silently applied.
5. Add requirement-linked API/Web tests for consent, scope/authority rejection, unavailable/denied states, bounded payloads, strict response parsing, reload-safe rendering, and no automatic mutation.

## Non-goals

This slice does not certify dashboard metrics, publish ETL proposals, or replace deterministic preparation. Those remain governed follow-up workflows.
