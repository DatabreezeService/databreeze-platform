# Folder Autopilot Web and Android slice — 2026-08-04

This record covers the content-free Web and Android review boundary for the Folder Autopilot
feature. It is a client slice, not a claim that all FA P0/P1 requirements are complete.

## Delivered

- Web exposes a lazy-loaded `autopilot` route and navigation registration with Vietnamese and
  English copy.
- Web dashboard parsing rejects unknown fields and source-bearing values; mutation requests carry
  only opaque identifiers, revisions, policy values, decision, and immutable plan hashes.
- Web presents profile authoring, assignment pause, preview approval/rejection, exception, outcome,
  and undo projections without rendering local paths, source bytes, formulas, or local handles.
- Android presents a compact assignment, approval, outcome, exception, and undo companion surface.
- Android state transitions fail closed on stale assignments, non-pending approvals, plan-hash
  mismatch, and repeated undo requests.
- Android offline intent queue stores only bounded operation names, opaque IDs, revisions, and
  SHA-256 payload hashes in the existing Room/InMemory queue; WorkManager scheduling remains
  replaceable through `SyncScheduler`.

## Commits

- `459c095` — Web safe API boundary tests
- `436507f` — Web content-free API client
- `a0cad73` — Web authoring/review surface tests
- `95af11b` — Web workspace surfaces and lazy route
- `0529f70` — Android state-model tests
- `ed5a44f` — Android state model
- `c3fe924` — Android review companion and instrumentation coverage
- `23cf2c5` — Android offline queue tests
- `162f502` — Android offline action queue
- `1047fa8` — Android UI persists actions before local transitions
- `7aa7a3c` — bounded deterministic offline mutation identifiers
- `e46f8a8` — Web profile list and detail projection
- `175b0a4` — strict boundary lint hardening
- `465ceae` — Vietnamese/English profile status parity

## Checks

- `corepack pnpm --filter @databreeze/web typecheck`
- `corepack pnpm --filter @databreeze/web exec vitest run test/folder-autopilot-api.test.ts test/folder-autopilot-page.test.tsx`
- `apps/android/gradlew.bat :app:compileDebugKotlin --no-daemon --offline --console=plain`
- `apps/android/gradlew.bat :app:testDebugUnitTest --tests com.databreeze.android.folderautopilot.FolderAutopilotOfflineQueueTest --tests com.databreeze.android.folderautopilot.FolderAutopilotModelsTest --no-daemon --offline --console=plain`
- `apps/android/gradlew.bat :app:compileDebugAndroidTestKotlin --no-daemon --offline --console=plain`

Instrumentation execution requires an attached Android emulator/device; compilation passed in this
worktree. The complete Folder Autopilot module remains gated by its backend, Desktop watcher,
engine, evidence, approval, recovery, and traceability plans.
