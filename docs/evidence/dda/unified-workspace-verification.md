# Unified workspace verification

- Branch: `codex/dda-400-production`
- Evidence commit baseline: recorded at commit time for plan 406 Task 14/18 leftovers
- Synthetic fixture: `tools/fixture-validation/fixtures/dda/unified-workspace/manifest.json`
- Fixture artifacts present: CSV, XLSX, receipt/invoice/table PNG, mismatch CSV, folder-update CSV
- Provider calls in golden fixture: `0`
- Local/cloud parity flag in fixture: `true` (synthetic equivalence only; not a live dual-environment proof)

## Agent-owned commands

| Command | Result |
|---|---|
| `corepack pnpm --filter @databreeze/web exec vitest run test/floating-agent.test.tsx test/unified-navigation.test.tsx test/auth-pages.test.tsx` | Pass |
| `corepack pnpm --filter @databreeze/desktop exec vitest run test/unified-workspace-journey.test.ts` | Pass |
| `corepack pnpm --filter @databreeze/api exec tsc --project tsconfig.test.json` + journey node:test | Pass |
| Playwright `e2e/unified-workspace*.spec.ts` plus shell/security/interaction UDW alignment | Pass (`33` passed, `15` skipped across chromium + mobile-chromium) |
| `adb devices` / `connectedDebugAndroidTest` | Not run (`adb` unavailable) |
| Live OpenAI evaluation | **not run** |
| Backup/restore, signing, staging/production deploy | **owner-gated / blocked** |

## Honest limits

- Task 19 / G5 / `productionReady` remain **blocked**. No fabricated owner evidence.
- Task 17 SSE reconciliation client was not added (no quick win without larger SSE infrastructure).
- This document records deepened synthetic journey + Web E2E/layout gates only. It does not mark production readiness.
