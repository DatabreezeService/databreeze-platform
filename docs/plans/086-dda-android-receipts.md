# DDA Android Receipt Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; use `superpowers:test-driven-development` for each task.

**Status:** Approved<br>
**Requirements:** DDA-040, DDA-041, DDA-042<br>
**Depends on:** Plan 081 G1 contract commit and existing Android/DSO/IAE/DSM contracts<br>
**Parallel with:** Plans 082-085, subject to plan 080 file locks

**Goal:** Capture a receipt through explicit Android user action, upload it durably to a Hybrid/Cloud destination, review versioned OCR candidates, and accept a validated governed record that can refresh an expense dashboard.

**Architecture:** Native CameraX/document capture writes encrypted account/workspace-scoped staging. Unique WorkManager work uploads resumably through IAE. A provider-neutral server adapter returns OCR candidates/evidence coordinates. Deterministic validation reconciles totals and duplicates; user correction creates a new candidate version. DSM acceptance happens only after review and validation.

**Tech Stack:** Kotlin/Compose, CameraX, Room, WorkManager, AndroidX Security, generated contracts, NestJS receipt application paths, provider-neutral OCR port, Kotlin unit/instrumented tests and API tests.

## Global Constraints

- This lane exclusively owns Android Gradle/manifest/runtime composition and `apps/android/app/src/.../receipts/`, plus `services/api/src/features/dda/receipt/` and its tests.
- Do not edit contract schemas/generated files, root API composition, Web, Desktop, or traceability.
- Capture is active/user-initiated and requires an authorized Hybrid/Cloud destination. No background camera, gallery crawl, Strict-Local cloud OCR claim, or general document understanding.
- Originals are immutable IAE artifacts. Staging is encrypted and isolated by account/workspace; logout/revocation/retention behavior is explicit.
- OCR confidence is not factual correctness. Low-confidence/conflicting/duplicate candidates require review.

### Task 1: Capture and upload receipts securely

**Primary requirement:** DDA-040

**Files:**

- Modify: `apps/android/gradle/libs.versions.toml`
- Modify: `apps/android/app/build.gradle.kts`
- Modify: `apps/android/app/src/main/AndroidManifest.xml`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptCaptureScreen.kt`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptCaptureViewModel.kt`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptStagingStore.kt`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptUploadWorker.kt`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptUploadScheduler.kt`
- Modify: `apps/android/app/src/main/java/com/databreeze/android/AndroidRuntime.kt`
- Modify: `apps/android/app/src/main/java/com/databreeze/android/MainActivity.kt`
- Create: `apps/android/app/src/test/java/com/databreeze/android/receipts/ReceiptUploadSchedulerTest.kt`
- Create: `apps/android/app/src/test/java/com/databreeze/android/receipts/ReceiptStagingIsolationTest.kt`
- Create: `apps/android/app/src/androidTest/java/com/databreeze/android/receipts/ReceiptCaptureFlowTest.kt`

**TDD sequence:**

1. Add red tests for missing camera permission, no destination, Strict-Local destination, revoked/wrong-scope workspace, duplicate scheduling, process death, offline retry, partial upload, logout/account switch, and cross-workspace staging lookup.
2. Add CameraX dependencies and implement active capture with preview/retake/confirm. Preserve the original; edits affect candidate metadata only.
3. Encrypt scoped staging metadata/bytes, schedule `ExistingWorkPolicy.KEEP` unique work by artifact/session ID, and use IAE resumable upload/finalize contracts with idempotency.
4. Complete Vietnamese/English strings and privacy/accessibility semantics.
5. Run `cd apps/android; ./gradlew testDebugUnitTest lintDebug`; run the instrumented flow when an emulator is available. Commit `feat(android): capture and upload receipts`.

### Task 2: Extract and review versioned OCR candidates

**Primary requirement:** DDA-041

**Files:**

- Create: `services/api/src/features/dda/receipt/application/receipt-ocr.port.ts`
- Create: `services/api/src/features/dda/receipt/application/receipt-extraction.service.ts`
- Create: `services/api/src/features/dda/receipt/api/receipt-extraction.controller.ts`
- Create: `services/api/src/features/dda/receipt/api/receipt-extraction.dto.ts`
- Create: `services/api/test/features/dda/receipt-extraction.service.test.ts`
- Create: `services/api/test/features/dda/receipt-extraction.controller.test.ts`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptReviewScreen.kt`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptReviewViewModel.kt`
- Create: `apps/android/app/src/test/java/com/databreeze/android/receipts/ReceiptReviewViewModelTest.kt`

**Versioned profile:** merchant; transaction date/time; currency; subtotal; tax; total; optional payment method/reference; optional line-item candidates; per-field/token confidence; adapter/model version; source artifact/evidence coordinates.

**TDD sequence:**

1. Add red API tests for wrong-scope artifact, non-receipt profile, provider timeout/retry, malformed coordinates, missing adapter/model version, prompt-like OCR text, and duplicate callback.
2. Add red Android tests for low-confidence highlighting, evidence crop access, locale-aware editing without source-value translation, correction versioning, and immutable prior extraction.
3. Implement provider-neutral OCR port and a deterministic fake adapter for tests/demo. A production AWS adapter requires its own accepted provider ADR and secrets/configuration review.
4. Implement versioned review/correction and content-safe audit. Run focused API/Android tests.
5. Commit `feat(dda): review receipt ocr candidates`.

### Task 3: Validate and accept governed receipt data

**Primary requirement:** DDA-042

**Files:**

- Create: `services/api/src/features/dda/receipt/application/receipt-validation.service.ts`
- Create: `services/api/src/features/dda/receipt/application/receipt-acceptance.service.ts`
- Create: `services/api/test/features/dda/receipt-validation.service.test.ts`
- Create: `services/api/test/features/dda/receipt-acceptance.service.test.ts`
- Create: `apps/android/app/src/main/java/com/databreeze/android/receipts/ReceiptValidationState.kt`
- Create: `apps/android/app/src/test/java/com/databreeze/android/receipts/ReceiptValidationStateTest.kt`

**TDD sequence:**

1. Test subtotal/tax/total reconciliation with declared rounding/tolerance, supported currency, required fields, date/time validity, negative/zero policy, and optional line-item reconciliation.
2. Test probable duplicate matching with exact artifact hash and bounded merchant/date/total/reference signals; duplicates remain review candidates, not silent deletions.
3. Test low confidence, conflicting OCR candidates, user corrections, expected-revision conflict, replay, DSM failure, and no DatasetVersion before acceptance.
4. Implement deterministic validation and idempotent IAE/DSM/JRA/AUD port composition. Acceptance appends a governed record/version and emits the trusted DSM event through its owner.
5. Run focused API/Android tests. Commit `feat(dda): accept validated receipt records`.

### Task 4: Produce the lane handoff

Run Android unit/lint/build checks, available emulator tests, and focused/full API tests. Return commit hashes, manifest/dependency changes, staging and retry evidence, OCR adapter mode, validation/duplicate cases, missing emulator evidence, known limitations, and contract requests. Do not self-edit traceability status.
