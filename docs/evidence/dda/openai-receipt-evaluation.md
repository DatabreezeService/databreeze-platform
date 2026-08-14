# OpenAI Receipt Evaluation

**Status:** offline verified on **repaired readable synthetic corpus**; prior live run retained as **plumbing evidence only** (plan 403 Task 4 corpus repair)

## Prepared

- Adapter: `OpenAiReceiptOcrAdapter` (`openai-receipt-ocr-2`)
- Shared client: `OpenAiResponsesClient`
- Secret name: `databreeze/{env}/openai/api-key`
- Forced: `store: false`, tools disabled, kill switch env
- Domain purpose: `RECEIPT_EXTRACTION`
- Pinned development/evaluation model: `gpt-4o-mini-2024-07-18`
- Image detail baseline: `high`
- Prompt version: `receipt-vi-en-v1`
- Schema version: `dda-receipt-candidate.v1`
- Preprocessing version: `receipt-image-passthrough-v1`

## Offline synthetic corpus (plan 403 Task 4 — repaired)

- Corpus path: `tools/fixture-validation/fixtures/dda/receipt-expense/openai-eval/`
- Cases: `synthetic-vi`, `synthetic-en`, `synthetic-hostile`
- Image quality: project-generated **readable, non-uniform** receipts at **600×900** with legible merchant/date/currency/totals (not solid-color squares)
- Generator: `tools/fixture-validation/scripts/generate-openai-eval-receipts.py`
- Attestation: project-generated, `noCustomerData: true`
- Admission: rejects tiny, undersized, blank, uniform-fill, and low-information images
- Runner: `corepack pnpm --filter @databreeze/fixture-validation openai:receipt:offline`
- Mode: recorded provider-shaped responses only; network primitives blocked

### Offline results

| Gate | State |
|---|---|
| `offlineVerified` | true |
| `liveEvaluation` | `blocked-owner-run` (pending re-run on repaired corpus) |
| `liveSyntheticVerified` | **plumbing-only** (see invalidated prior live run) |
| `extractionQualityVerified` | **false** (no valid live quality evidence yet) |
| `protectedCorpusVerified` | false |
| `productionSnapshotApproved` | false |
| `productionSecretConfigured` | false |
| `promotionEligible` | **false** |
| `productionReady` | **false** |

Offline scoring reports per-field exact/normalized match, required-field coverage, arithmetic reconciliation, coordinate validity/overlap, refusal count, and schema-failure count. It does **not** emit a percentage-correct aggregate.

## Prior live synthetic owner run — invalidated for model quality

Owner previously executed a capped live command against the **pre-repair** corpus (64×96 solid-color squares with **no receipt text**). That aggregate remains useful only as **plumbing evidence**:

| Field | Value |
|---|---|
| Mode / corpus | `live` / `synthetic` (pre-repair solid squares) |
| Request count | 3 (cap honored) |
| Model | `gpt-4o-mini-2024-07-18` |
| Image detail | `high` |
| Plumbing (`--live` gates, schema-valid candidates, no auth/quota failure) | passed |
| Model-quality conclusion | **invalid** — corpus contained no readable receipt text |
| `extractionQualityVerified` | **false** (do not interpret 0/6 as cheap-baseline OCR failure) |
| `promotionEligible` | **false** |
| `productionReady` | **false** |

### Honest interpretation

**Valid plumbing conclusions from the prior live run:**

- Live gates fired; Responses API path completed; strict structured output parsed.
- Aggregate correctly kept `productionReady: false` and `promotionEligible: false`.

**Invalid quality conclusions (superseded by Task 4 corpus repair):**

- Required-field 0/6, arithmetic fail, and coordinate-overlap fail on solid-color squares are **not** evidence that `gpt-4o-mini-2024-07-18` fails receipt extraction.
- Next owner-driven live run (max 1 request first) must use the repaired readable fixtures before any model-quality claim.

## Required before live/production promotion

1. Owner re-runs capped live evaluation on the repaired readable corpus (start with max 1 request).
2. Extraction quality thresholds met on an evaluated model/prompt/schema/preprocessing snapshot.
3. Exact production snapshot approval, AWS Secrets Manager configuration, and remaining plan-402 Task 12 gates.

G5 and `productionReady` remain blocked until those gates pass with evidence.
