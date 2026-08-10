# OpenAI Receipt Evaluation

**Status:** blocked — MANUAL-PREREQUISITES §3 (project, credential, ground-truth corpus, model approval)

## Prepared

- Adapter: `OpenAiReceiptOcrAdapter` (fail-closed)
- Secret name: `databreeze/{env}/openai/receipt-ocr`
- Forced: `store: false`, tools disabled, kill switch env
- Domain purpose: `RECEIPT_EXTRACTION`

## Required before verified

1. Owner-approved Vietnamese/English ground-truth corpus (non-customer).
2. Pinned model snapshot evaluation with per-field metrics, reconciliation, coordinates, refusal/schema rates, latency, tokens, cost.
3. Thresholds approved against ReceiptCaptureProfile.

Until then, live mapping throws `OPENAI_EVALUATION_REQUIRED` rather than inventing fields.
