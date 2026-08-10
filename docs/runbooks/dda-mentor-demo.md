# Data-to-Dashboard Mentor Demo Runbook

## Claim boundary

This runbook reproduces the **mentor-demo prototype**. It is not a production, security, scale, recovery, parity-complete, or compliance claim. Plan `400-production-readiness.md` remains required.

## Prerequisites

- Clean checkout of `codex/dda-087-integration` (or merged equivalent)
- `corepack pnpm install --frozen-lockfile`
- Python available on `PATH` (engine parity)
- Optional: Android emulator/device for instrumented receipt journey
- Optional: Playwright browsers for web e2e

## One-command reset / verify

```bash
node tools/demo/dda/reset-demo-state.mjs
node tools/demo/dda/verify-demo-state.mjs
```

Expected verify output includes `productionReady: false`, messy-sales `rowCount: 4`, `rejectedCount: 1`.

## Golden journeys

### 1) Messy sales CSV → reviewed dashboard

1. Open Web `/vi-VN/dashboards` (Vietnamese default) and `/en/dashboards`.
2. Confirm freshness + evidence/authorization caveats remain visible.
3. Confirm no streaming/real-time labels.
4. Focused e2e: `apps/web/e2e/dda-golden-journey.spec.ts`

Known fixture-backed components and CSP Playwright unsafe-eval limits may block some chart paths (083).

### 2) Desktop approved folder refresh

1. Run `apps/desktop/test/dda-golden-folder-journey.test.ts`.
2. Expect reviewed hybrid projection sync with idempotent upload keys and no local path leakage.

Known limits: DSO stub, no long-running FS watcher, folder UI not in shell nav (085).

### 3) Android receipt → expense-ready acceptance

1. Prefer emulator: instrumented `DdaGoldenReceiptJourneyTest`.
2. Without emulator: rely on unit tests under `apps/android/app/src/test/.../receipts` plus API receipt services with fake OCR.

Known limits: shutter prototype, in-memory staging, fake OCR (086).

## Offline / AI-disabled caveats

Disable AI adapter and take a source device offline: deterministic ETL, manual typed analysis, and last-good snapshot freshness labels must remain usable. Do not invent streaming freshness.

## Prohibited production claims

Do not tell mentors the prototype proves production isolation, retention, signed workers, recovery, or full Local/Cloud operational parity.
