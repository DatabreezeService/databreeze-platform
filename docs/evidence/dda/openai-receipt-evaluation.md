# OpenAI Receipt Evaluation

**Status:** offline verified; live evaluation blocked pending owner run (MANUAL-PREREQUISITES §3)

## Prepared

- Adapter: `OpenAiReceiptOcrAdapter` (`openai-receipt-ocr-2`)
- Shared client: `OpenAiResponsesClient`
- Secret name: `databreeze/{env}/openai/receipt-ocr`
- Forced: `store: false`, tools disabled, kill switch env
- Domain purpose: `RECEIPT_EXTRACTION`
- Pinned development/evaluation model: `gpt-4o-mini-2024-07-18`
- Image detail baseline: `high`
- Prompt version: `receipt-vi-en-v1`
- Schema version: `dda-receipt-candidate.v1`
- Preprocessing version: `receipt-image-passthrough-v1`

## Offline synthetic corpus (plan 403 Task 4)

- Corpus path: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/`
- Cases: `synthetic-vi`, `synthetic-en`, `synthetic-hostile`
- Attestation: project-generated, `noCustomerData: true`
- Runner: `corepack pnpm --filter @databreeze/fixture-validation openai:receipt:offline`
- Mode: recorded provider-shaped responses only; network primitives blocked

### Offline results

| Gate | State |
|---|---|
| `offlineVerified` | true |
| `liveEvaluation` | `blocked-owner-run` |
| `liveSyntheticVerified` | false |
| `protectedCorpusVerified` | false |
| `productionSnapshotApproved` | false |
| `productionSecretConfigured` | false |
| `productionReady` | **false** |

Offline scoring reports per-field exact/normalized match, required-field coverage, arithmetic reconciliation, coordinate validity/overlap, refusal count, and schema-failure count. It does **not** emit a percentage-correct aggregate.

## Required before live/production verified

1. Owner runs the capped live synthetic command from plan 403 (private terminal; never paste the key into chat).
2. Owner-approved thresholds against ReceiptCaptureProfile.
3. Exact production snapshot approval, AWS Secrets Manager configuration, and remaining plan-402 Task 12 gates.

Until the owner live run succeeds, evidence keeps `liveEvaluation: blocked-owner-run` and G5/`productionReady` remain blocked.
