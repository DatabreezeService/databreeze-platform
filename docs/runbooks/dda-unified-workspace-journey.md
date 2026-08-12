# Unified workspace golden journey

Synthetic fixture path: `tools/fixture-validation/fixtures/dda/unified-workspace/`.

The golden fixture includes Vietnamese CSV/XLSX, receipt/invoice/table images, a mismatch file, a folder-update CSV, two dataset versions, Viewer restriction, one conversation, and one starter dashboard. Provider calls must remain `0`.

## Commands

```powershell
corepack pnpm --filter @databreeze/api exec tsc --project tsconfig.test.json
corepack pnpm --filter @databreeze/api exec node --test build/test/test/features/dda/unified-workspace-journey.e2e.test.js
corepack pnpm --filter @databreeze/desktop exec vitest run test/unified-workspace-journey.test.ts
corepack pnpm --filter @databreeze/web exec playwright test e2e/unified-workspace-journey.spec.ts e2e/unified-workspace.spec.ts e2e/unified-workspace.visual.spec.ts
```

## Limits

- Provider calls must remain `0` for this fixture.
- Live OpenAI, device signing, backup/restore, emulator-connected Android, and deployment gates are owner-only and are not covered here.
- Task 19 / G5 / `productionReady` stay blocked until real owner evidence exists.
