# OpenAI Receipt Evaluation

**Status:** offline verified; live synthetic plumbing verified; **extraction quality failed** on pinned cheap baseline (plan 403 Task 5)

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
| `liveEvaluation` | `owner-run-recorded` |
| `liveSyntheticVerified` | true (plumbing / request path only — see below) |
| `extractionQualityVerified` | **false** |
| `protectedCorpusVerified` | false |
| `productionSnapshotApproved` | false |
| `productionSecretConfigured` | false |
| `promotionEligible` | **false** |
| `productionReady` | **false** |

Offline scoring reports per-field exact/normalized match, required-field coverage, arithmetic reconciliation, coordinate validity/overlap, refusal count, and schema-failure count. It does **not** emit a percentage-correct aggregate.

## Live synthetic owner run (plan 403 Task 5)

Owner executed the capped live command from a private terminal. Cursor consumed only the sanitized aggregate at `reports/openai-receipt-live-aggregate.json` (gitignored local report; not committed). No API key, raw provider response, image, prompt, or extracted source values were shared with the agent.

| Field | Value |
|---|---|
| Mode / corpus | `live` / `synthetic` |
| Request count | 3 (cap honored) |
| Model | `gpt-4o-mini-2024-07-18` |
| Image detail | `high` |
| Project label | `development-evaluation` (non-secret) |
| `offlineVerified` | true |
| `liveSyntheticVerified` | true |
| `schemaFailure` (all cases) | false |
| `refusal` (all cases) | false |
| `percentageCorrect` | `not-evaluated` |
| `promotionEligible` | **false** |
| `productionReady` | **false** |

### Per-case quality (all three cases identical outcome class)

| Case | Required fields | Arithmetic | Coordinate validity | Coordinate overlap | Schema | Refusal |
|---|---|---|---|---|---|---|
| `synthetic-vi` | **0/6** | fail | pass | fail | false | false |
| `synthetic-en` | **0/6** | fail | pass | fail | false | false |
| `synthetic-hostile` | **0/6** | fail | pass | fail | false | false |

Token usage (content-safe): ~9577 input tokens each; output 392 / 442 / 603. Returned model matched the pinned snapshot on every case.

### Honest interpretation vs plan 403 pass criteria

**What passed (plumbing / contract path):**

- Live gates fired (explicit `--live`, acknowledgement, synthetic corpus, model/detail env, request cap).
- Three Responses API calls completed without auth/quota/refusal/schema failures.
- Strict structured-output path produced parseable, schema-valid candidates (`schemaFailure: false`).
- Aggregate correctly keeps `productionReady: false` and `promotionEligible: false`.
- Runner flag `liveSyntheticVerified: true` means the **live request/response plumbing** completed for the synthetic corpus — not that extraction quality met product thresholds.

**What failed (extraction quality — do not weaken gates):**

- Required-field coverage **0/6** on every case (merchant, date, currency, subtotal, tax, total).
- Arithmetic reconciliation **fail** on every case.
- Coordinate overlap **fail** on every case (coordinate validity alone is insufficient).
- Plan 403 explicitly treats threshold miss as a real failed/blocked quality result and forbids silent model upgrades; record failing metrics first, then propose a separately capped stronger-model comparison if the owner approves.

### Implications for plan 402 Task 8 and G5

- **Task 8 (OpenAI adapter contract + offline harness):** Offline corpus, adapter/contract tests, and live opt-in runner already exist from plan 403 Tasks 1–5. When plan 402 reaches Task 8, **reuse this evidence** — do not reimplement the harness. Task 8 cannot be marked quality-complete for live extraction while `extractionQualityVerified` remains false; offline + contract coverage may still be recorded as code-complete for the harness itself.
- **G5 / productionReady:** Remain **blocked**. Development live smoke does not satisfy production OpenAI project/secret, exact snapshot approval, protected corpus, staging rehearsal, or owner release gates (MANUAL-PREREQUISITES §3 + plan 402 Task 12).
- **Do not** set `productionReady` or `promotionEligible` true from this run.
- **Next OpenAI quality work (owner-gated):** improve fixtures/prompt/preprocessing and/or run a separately capped comparison against a stronger evaluated image-capable model — only after the failing cheap-baseline metrics are recorded (this page). Do not re-run live spend without a deliberate change under evaluation.

## Required before live/production promotion

1. Extraction quality thresholds met on an evaluated model/prompt/schema/preprocessing snapshot (cheap baseline currently fails).
2. Owner-approved thresholds against ReceiptCaptureProfile.
3. Exact production snapshot approval, AWS Secrets Manager configuration, and remaining plan-402 Task 12 gates.

G5 and `productionReady` remain blocked until those gates pass with evidence.
