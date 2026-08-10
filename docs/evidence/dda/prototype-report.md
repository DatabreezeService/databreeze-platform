# DDA Mentor Demo Prototype Report

## Claim

24-hour mentor-demo prototype for Data-to-Dashboard V1, plus production scaffolding on `codex/dda-400-production`. **Not production ready.**

## Real vs fake

| Surface | Reality |
|---|---|
| Web dashboard chrome | Routed and bilingual; authoring partly fixture-backed |
| Web ETL/intake leaves | Present; root API composition still uses prototype foundation ports |
| Refresh/SSE | In-memory coordinator and in-process event bus |
| Desktop folders | Binding/IPC/projection + shell nav; DSO capability still deny-by-default; watcher adapter owned by main |
| Android receipts | Capture/review UI; durable encrypted file staging; upload transport unconfigured without API |
| Engine ETL/materialize | Callable processors with digest pins; full ActionRegistry ActionHandler enrollment pending |
| OCR | Deterministic fake without keys; OpenAI adapter fail-closed when keys/kill-switch configured; live eval blocked |

## Golden journeys covered

1. Messy sales → reviewed dashboard chrome (`apps/web/e2e/dda-golden-journey.spec.ts`)
2. Desktop reviewed projection sync (`apps/desktop/test/dda-golden-folder-journey.test.ts`)
3. Android receipt capture/review (`DdaGoldenReceiptJourneyTest.kt`, emulator optional)

## Streaming

`DDA-051` remains deferred. V1 freshness enums are `ON_CHANGE | MANUAL | SCHEDULED` only.

## Prohibited claims

Do not claim production tenant isolation, retention deletion completeness, signed worker hardening, recovery, accessibility certification, or measured 60-second production SLOs from mentor/fixture evidence alone.
