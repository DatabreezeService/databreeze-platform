# Android production-readiness handoff

## Status

Partial, code-ready without a connected Android device or configured server intake client.

- CameraX now requests `CAMERA` permission, binds preview and `ImageCapture` to the composable lifecycle, converts the capture to an in-memory JPEG, and sends it to the existing encrypted scoped staging flow on explicit confirmation.
- Upload rehydrates only the scoped encrypted original, validates its recorded SHA-256 digest and length, and calls a typed `ReceiptUploadApiClient` command with an opaque deterministic idempotency key. WorkManager remains unique `KEEP` work with network constraints and exponential retry.
- Runtime composition uses a fail-closed upload client until the generated authenticated intake contract/client is supplied. It cannot fall back to an unauthenticated post or fabricated OCR data.
- The review route no longer constructs a fake OCR candidate. It displays a localized explicit server-OCR-unavailable state, with no candidate fields to accept.
- Durable file-envelope persistence now uses the JVM-compatible standard library codec; ciphertext and scoped metadata remain durable and encrypted as before.

Applicable requirements: DDA-040, DDA-041.

## Commit

- `45a9e04 feat(android): wire secure receipt capture transport`

## Verification

Passed:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
.\gradlew.bat testDebugUnitTest lintDebug
```

Focused TDD checks passed:

```powershell
.\gradlew.bat testDebugUnitTest --tests "com.databreeze.android.receipts.StagedReceiptUploadTransportTest"
.\gradlew.bat testDebugUnitTest --tests "com.databreeze.android.receipts.ReceiptReviewViewModelTest"
.\gradlew.bat testDebugUnitTest --tests "com.databreeze.android.receipts.FileBackedReceiptStagingStoreTest"
```

The new transport and fail-closed review tests were first run red for their missing production interfaces/state, then green after implementation. The full suite initially exposed an existing `JSONObject` JVM-stub failure in `FileBackedReceiptStagingStoreTest`; replacing that Android-only envelope codec with `java.util.Properties` made the focused and full JVM runs pass.

Not run:

```powershell
.\gradlew.bat connectedDebugAndroidTest
```

`adb devices` returned no attached devices/emulators. No CameraX permission, lifecycle, capture conversion, WorkManager process-death/reboot, or end-to-end authenticated upload behavior was device-verified.

## Remaining gaps

- Supply generated authenticated IAE receipt-upload API bindings and a production `ReceiptUploadApiClient`; do not add credentials to Android.
- Exercise CameraX and permission-denial/retake paths on representative real devices and/or an emulator.
- Exercise WorkManager after process death, reboot, network loss, logout/revocation, and account/workspace switch.
- Verify the server’s live OpenAI OCR path separately with configured server-side AWS/OpenAI credentials and the required provider evaluation. Android intentionally stays fail-closed without it.
