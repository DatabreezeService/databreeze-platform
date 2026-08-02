# Android Foundation Reconciliation

**Evidence date:** 2026-08-02

**Source commit:** `dcdc07cf392742ef1f571de6eac75c776cc9b0ed` (implementation `d42574d` plus the process-recreation test correction `dcdc07c`)

**Scope:** FND-002, the Android shell completion task in Plan 010.

## Delivered boundaries

- Room now stores the sync queue with a composite `(accountId, workspaceId, mutationId)` primary key, scoped queries, idempotent enqueue, completion receipts, clear-on-sign-out, and a checked-in schema snapshot.
- WorkManager receives only bounded account/workspace IDs, cursors, and revisions. Unique work is scope-hashed, network constrained, backoff-enabled, injected through `DataBreezeWorkerFactory`, and marks accepted mutations complete.
- The application composition root supplies the Room store, Android Keystore, WorkManager scheduler, and transport adapter. The default transport is explicitly unconfigured and cannot silently send data.
- Device aliases are bounded and validated. Sensitive local fields have an AES-GCM payload port backed by Android Keystore. Sign-out cancels scoped work, clears the scoped queue, and removes the device key.
- Compose navigation uses stable routes and derives draft status from durable local state. Recreating the activity restores the capture route and saved draft state.
- Manifest, cleartext policy, backup/data-extraction exclusions, generated Kotlin contracts/design tokens, API-level pins, and Vietnamese/English resource parity are repository-checked.

## Verification evidence

| Check | Result |
|---|---|
| `node --test tools/repo-cli/test/android-shell.test.mjs` | 4 passed |
| `apps/android/gradlew.bat :app:testDebugUnitTest --no-daemon` | passed |
| `apps/android/gradlew.bat :app:assembleDebug :app:compileDebugAndroidTestKotlin --no-daemon` | passed |
| `apps/android/gradlew.bat :app:connectedDebugAndroidTest --no-daemon` | passed on `Medium_Phone(AVD) - 17`; three instrumentation tests, including Room isolation and activity recreation |
| `git diff --check` | passed |

The first instrumentation attempt exposed an incorrect expectation after Navigation restored the capture destination on recreation. The test was corrected in `dcdc07c`; the rerun passed all three tests.

## Safety and rollback

WorkManager payloads reject unknown fields such as source bytes. Room and in-memory tests prove that sibling accounts and workspaces cannot observe or clear each other's queue. Backup rules exclude databases, preferences, files, and external storage. The generated Room schema is evidence for future migration review.

Reverting `d42574d` and `dcdc07c` removes the FND-002 runtime, schema, and evidence tests without touching server data or the canonical logo. After a rollback, run the Android unit/compile/instrumentation checks and `corepack pnpm repo:check` before accepting another foundation task.

FND-002 does not promote any product requirement to `verified`; it closes the Android foundation task boundary only.
