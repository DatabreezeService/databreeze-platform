# Unified workspace golden journey

Synthetic fixture path: `tools/fixture-validation/fixtures/dda/unified-workspace/`.

## Commands

```powershell
corepack pnpm --filter @databreeze/api exec tsc --project tsconfig.test.json
corepack pnpm --filter @databreeze/api exec node --test build/test/test/features/dda/unified-workspace-journey.e2e.test.js
corepack pnpm --filter @databreeze/desktop exec vitest run test/unified-workspace-journey.test.ts
```

## Limits

- Provider calls must remain `0` for this fixture.
- Live OpenAI, device signing, backup/restore, and deployment gates are owner-only and are not covered here.
