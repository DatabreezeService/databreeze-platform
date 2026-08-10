# DDA Release Evidence (Code-First)

**Branch:** `codex/dda-400-production`  
**HEAD at this note:** see git tip when committing  
**`delivery.productionReady`:** `false`  
**G5:** blocked

## Agent-verifiable evidence captured

| Area | Command / artifact | Result |
|---|---|---|
| Contracts v2 receipt-upload | `corepack pnpm contracts:check` (v2 fixture parity 2 cases) | Published immutable v2; v1 unchanged |
| Android upload/extraction | `:app:testDebugUnitTest` (focused receipt tests), `:app:lintDebug`, `:app:assembleDebug` | Pass |
| Android emulator journey | `:app:connectedDebugAndroidTest` | **Blocked** — no emulator/device attached (AVD `Medium_Phone` exists; adb device list empty) |
| Offline OpenAI eval | plan 402 Task 8 / `openai-receipt-evaluation.md` | Offline green; live quality 0/6; not promotable |
| Restore verifier | `node tools/recovery/verify-dda-restore.mjs` | Exit 2 blocked without owner `--database-url` |
| OpenTofu apply | — | Never run |
| OpenTofu validate | `corepack pnpm infra:validate` | **Blocked here** — Docker CLI present but daemon `dockerDesktopLinuxEngine` not running |

## Emulator command (when a device is attached)

```text
cd apps/android
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"   # if unset
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd Medium_Phone
& "$env:ANDROID_HOME\platform-tools\adb.exe" wait-for-device
.\gradlew.bat :app:connectedDebugAndroidTest
```

## Owner-gated evidence still missing

AWS OIDC/staging apply, live OpenAI promotion corpus, Windows/Play signing, legal/privacy owners, production load, G5 approval. See `owner-activation-packet.md`.
