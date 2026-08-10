# Android Release Runbook

**Blocked on:** MANUAL-PREREQUISITES §6 (Play account, signing, Data Safety, privacy URLs)

## Agent-complete prep

- `FileBackedReceiptStagingStore` persists encrypted staging under app files.
- Upload transport remains unconfigured until owner provides API base + auth.
- Unit tests cover staging isolation; real-device CameraX/WorkManager proof needs §4 devices.

## Owner steps

1. Freeze application ID; enable Play App Signing; protect upload key.
2. Publish privacy-policy and account-deletion URLs.
3. Complete Data Safety / content rating / store listing.
4. Closed test on representative devices; approve staged rollout.
