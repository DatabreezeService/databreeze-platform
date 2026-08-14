# OpenAI Assistance Evaluation (plan 403 Tasks 6–10)

**Status:** offline contract/safety verified; live assistance smoke **not** run in this wave  
**productionReady:** false  
**promotionEligible:** false

## Scope

Governed OpenAI assistance paths beyond receipt OCR:

| Capability | Purpose | Offline evidence |
|---|---|---|
| Mapping suggestions | `MAPPING_SUGGESTION` | `openai-mapping-assistance.test.ts` + `mapping-cases.json` |
| Typed analyst proposals | `PLAN_PROPOSAL` | `openai-analysis.adapter.test.ts` + `analysis-cases.json` |
| Narratives | `NARRATIVE` | `openai-narrative.adapter.test.ts` + `narrative-cases.json` |
| Dashboard/canvas proposals | `PLAN_PROPOSAL` | `openai-dashboard-proposal.adapter.test.ts` + `dashboard-cases.json` |
| Integrated safety | all | `openai-provider-outage.e2e.test.ts`, `openai-content-boundary.e2e.test.ts` |

## Guarantees covered offline

- Strict schemas; `store: false`; empty tools; kill switches per capability
- Tenant egress purpose/payload checks and BUA reservation hooks
- Hostile filenames/headers/cells/questions treated as data only (cannot tools/publish/canvas/tenant escalate)
- Provider denial/outage leaves `DETERMINISTIC_ETL`, `MANUAL_TYPED_ANALYSIS`, and `SAVED_SNAPSHOT_VIEW`
- Suggestions/proposals remain non-authoritative; dashboard proposals are preview-only (`publishes: false`)
- Ordinary tests never call the live OpenAI network

## Gates

| Gate | State |
|---|---|
| `offlineVerified` | true (API + fixture assistance cases) |
| `liveSyntheticVerified` | false for assistance paths (owner opt-in later; receipt live pending repaired corpus re-run) |
| `protectedCorpusVerified` | false |
| `productionSnapshotApproved` | false |
| `productionSecretConfigured` | false |
| `productionReady` | **false** |

## Budget reconciliation

`tools/performance/dda-openai-budget.mjs` reports token fields and `costEstimate: unknown` unless an explicit fresh pricing version is supplied. It never logs prompts, images, or extracted values.

G5 remains blocked on MANUAL-PREREQUISITES / plan 402 Task 12.
