# Android Application

Native Kotlin/Jetpack Compose capture and review companion using the generated Kotlin contracts and Android design tokens. It does not depend on Node at runtime or duplicate full Web administration.

## Local development

Use the repository-pinned JDK 21 and the checked-in Gradle wrapper:

```text
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
./gradlew :app:connectedDebugAndroidTest
```

Vietnamese is the default locale; `values-en` provides the complete English catalog. The shell deliberately keeps
Room, WorkManager, Android Keystore, and sync behind ports so feature modules cannot access credentials, raw paths, or
network clients directly. Backup rules exclude local queues, databases, and sensitive preferences.

The local queue is keyed by `(accountId, workspaceId, mutationId)` and every Room query requires the account/workspace
scope. Room schema v3 also persists typed DSO operations, capture bundles/items, review drafts and sync cursors;
optional operation payloads remain encrypted metadata and never enter WorkManager input. WorkManager receives only
bounded IDs, cursors, and revisions; it uses unique, network-constrained work with exponential backoff and an injected
worker factory. Typed operations are admitted through `/v1/devices/sync/operations` with operation-id idempotency;
conflict/rejected operations are quarantined instead of retried forever. Sign-out cancels scoped work, clears that
scope's local queue, and removes its device key. Instrumentation tests cover cross-account isolation and the v1→v3
Room migration, while the Compose smoke test recreates the activity to exercise durable draft recovery.

Connected instrumentation requires an attached emulator or device. A clean checkout can still compile the suite with
`./gradlew :app:compileDebugAndroidTestKotlin`; the release gate must record the device-backed run separately.
On Windows, set `JAVA_HOME` to Android Studio's bundled JDK 21 and create the ignored `local.properties` file with
the local Android SDK path before invoking Gradle.

The launcher mark is copied from the approved generated DataBreeze asset; it is not redrawn or recolored.

## UI architecture

The production shell follows the Web workspace language without duplicating Web administration:

- `ui/AppComponents.kt` owns the reusable brand mark, top bar, role-aware bottom navigation, cards,
  section headers, metric cards, action rows, status banners, and page spacing.
- `MainActivity.kt` owns route composition and server-provided scope/role state; it does not own
  plan prices, dataset IDs, workspace IDs, or permissions.
- Feature packages (`capture`, `receipts`, `datasets`, `dashboard`, `analysis`, `billing`, `evidence`,
  `tasks`, `approvals`, `notifications`, `diagnostics`, and `operations`) render their API state with
  the shared components and keep feature-specific ViewModel/API calls in their own package.
- The primary mobile destinations are Home, Capture, Dashboard, Data, and More. Administrative and
  review surfaces are exposed from More only after the current server role is loaded; the server remains
  authoritative for every request.

## Production AWS configuration

Android does not connect to RDS, Redis, S3, PayOS, OpenAI, or AWS IAM directly. The APK talks only to
the public HTTPS API origin; all provider credentials remain in the backend's AWS Secrets Manager/CI
runtime. Use one stable custom domain in front of the API (for example `https://api.example.com`) and
one stable Web origin (for example `https://app.example.com`). Do not use an ALB hostname, private
RDS endpoint, localhost, or an API key in the APK.

Configure the release from CI or `~/.gradle/gradle.properties`:

```text
DATABREEZE_ANDROID_API_BASE_URL=https://api.example.com
DATABREEZE_ANDROID_WEB_BASE_URL=https://app.example.com
DATABREEZE_ANDROID_ENFORCE_PRODUCTION_CONFIG=true
DATABREEZE_ANDROID_ENVIRONMENT=PRODUCTION
DATABREEZE_ANDROID_KEYSTORE_PATH=/secure/ci/databreeze-upload.jks
DATABREEZE_ANDROID_KEYSTORE_PASSWORD=***
DATABREEZE_ANDROID_KEY_ALIAS=databreeze-release
DATABREEZE_ANDROID_KEY_PASSWORD=***
```

Equivalent Gradle properties are `databreeze.apiBaseUrl`, `databreeze.webBaseUrl`,
`databreeze.enforceProductionConfig`, and `databreeze.environment`. Secrets must come from the CI secret store; never commit
`gradle.properties`, a keystore, or a token. Every `Release` task rejects non-HTTPS origins (the
explicit `DATABREEZE_ANDROID_ENFORCE_PRODUCTION_CONFIG=true` flag is still recommended in CI), and
the debug-only loopback exception is controlled by `DATABREEZE_ANDROID_ALLOW_INSECURE_LOOPBACK`.

Build the production composition only after the AWS custom domains and signing values are present:

```text
./gradlew :app:assembleRelease \
  -Pdatabreeze.apiBaseUrl=https://api.example.com \
  -Pdatabreeze.webBaseUrl=https://app.example.com \
  -Pdatabreeze.enforceProductionConfig=true \
  -Pdatabreeze.environment=PRODUCTION
```

PowerShell equivalent:

```powershell
.\gradlew.bat :app:assembleRelease `
  '-Pdatabreeze.apiBaseUrl=https://api.example.com' `
  '-Pdatabreeze.webBaseUrl=https://app.example.com' `
  '-Pdatabreeze.enforceProductionConfig=true' `
  '-Pdatabreeze.environment=PRODUCTION' `
  --no-daemon
```

Replace the example domains with the real AWS custom domains before producing the submission APK.

The release app has no demo fallback. It starts at the native sign-in screen, calls `/v1/auth/sign-in`
with `clientPlatform=android`, rotates the native refresh session through `/v1/auth/refresh`, loads
`/v1/me/bootstrap`, and revokes `/v1/auth/sign-out`. Access/refresh tokens are Keystore-backed; the
APK never contains AWS, PayOS, AI, database, or storage credentials. Capture additionally requires a
real DSO device/workspace grant; without enrollment the app fails closed instead of inventing one.

For verified App Links, publish `/.well-known/assetlinks.json` on the configured Web origin with the
release package name and signing SHA-256 certificate. The manifest host is generated from
`DATABREEZE_ANDROID_WEB_BASE_URL`; no domain is hard-coded in Kotlin.

## Production-shaped Android slice (AWS hand-off)

The native app includes production boundaries without embedding provider secrets:

- ACTION_SEND/ACTION_SEND_MULTIPLE image intake into encrypted app-private staging and unique WorkManager jobs.
- Camera original bytes are staged exactly once; no silent downscale/re-encode is performed before hashing.
- Multi-page capture creates independently governed upload jobs; each page remains server-authoritative.
- Ed25519 Android Keystore enrollment client for the device challenge/enroll endpoints.
- DSO cursor pull and typed operation admission are selected only when a server-issued device id and grant exist;
  otherwise the transport fails closed. Legacy digest-only queue records are rejected rather than fabricated into a
  typed operation.
- Wi-Fi/charging transfer policy is persisted in WorkManager input, and sign-out closes the scoped Room database.
- Strict-Local encrypted package exporter/importer (AES-GCM with Android Keystore and OS document picker), authenticated PayOS return polling,
  server role display, audit tracking, in-app notifications, approval/task/report clients, App Link route-token
  resolution, capture quality hints, encrypted voice artifact staging, online approval decisions with MFA assertion,
  and redacted diagnostics. Verified cleanup removes only staged originals with a recorded server artifact reference.

AWS hand-off values are deployment inputs, not APK constants: API/Web HTTPS origins, release keystore, verified App
Links assetlinks.json, IAM/device proof verifier, DSO cursor signer, IAE database/object storage adapter, receipt
profile UUID, OCR/command adapters, notification gateway, and backend mobile task/report/push contracts. Until those
are composed, the app reports a bounded error and never creates local authority, payment entitlement, OCR result, or
fake device grant.

## Demo APK and mock API

The `demo` build is a self-contained, network-free APK for local presentation and UI acceptance. Its
`MockDataBreezeApi` boundary models the authenticated session, workspace, dashboard, datasets, capture/review,
analysis, notifications, PayOS checkout, members, and audit queries/mutations. Fixtures are kept in the repository
adapter rather than in Compose screens, so an HTTP adapter can replace it without changing navigation.

The non-demo composition includes `AuthenticatedBillingApiClient`, which calls the generated v4 billing endpoints
(`/v1/billing/payos/plans`, `/checkout-sessions`, and `/sessions/:orderCode`) through the protected session
transport. It sends only an immutable plan id and validates server-owned amounts/statuses; no PayOS or AI credential
is packaged in any build.

Build and install it with JDK 21 and an Android SDK configured through `ANDROID_HOME`:

```text
./gradlew :app:testDemoUnitTest
./gradlew :app:assembleDemo
adb install -r app/build/outputs/apk/demo/app-demo.apk
adb shell monkey -p com.databreeze.android.demo 1
```

For a real debug session against an API running on the host machine, use the emulator loopback
address and explicitly enable the debug-only exception. The debug network resource permits cleartext
only for loopback hosts; release still blocks cleartext and requires HTTPS:

```powershell
.\gradlew.bat :app:assembleDebug `
  '-Pdatabreeze.apiBaseUrl=http://10.0.2.2:3000' `
  '-Pdatabreeze.allowInsecureDebugLoopback=true' `
  --no-daemon
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r .\app\build\outputs\apk\debug\app-debug.apk
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell monkey -p com.databreeze.android 1
```

For a USB-connected physical device, keep the API on host port `3000`, run
`adb reverse tcp:3000 tcp:3000`, and build with
`-Pdatabreeze.apiBaseUrl=http://127.0.0.1:3000`; the debug network policy allows
this loopback route. The `10.0.2.2` address is only for an Android Emulator.

The API must actually listen on host port `3000`; the local Docker compose file keeps the API
container internal, so either run the API on the host or expose a temporary development-only port.
When running `lintDebug`, use a syntactically valid HTTPS hostname for `databreeze.webBaseUrl`
(for example `https://example.com`); Android Lint intentionally rejects `localhost` as an App Link
host. The debug runtime may still use the local Web origin for ordinary API testing, but verified
App Links require a real domain and `assetlinks.json`.

For the live receipt path, configure the API (never the APK) with a published receipt profile UUID:
`DATABREEZE_RECEIPT_PROFILE_VERSION_ID=<server-owned-profile-version-id>`. The API must also have its
normal IAE database/object-store, workspace policy, receipt command repository and OCR adapter composed.
If any of those authorities are unavailable, Android shows a bounded error and does not fabricate an
artifact, OCR candidate, entitlement, or dataset version.

### Local Docker + APK integration test

The repository local stack keeps the API private behind the Web gateway by default. To expose only the
development API to an emulator, use the non-production override `infrastructure/local/compose.android.yml`:

```powershell
corepack pnpm local:services start
docker compose --project-name databreeze-local --env-file infrastructure/local/.env `
  -f infrastructure/local/compose.yml -f infrastructure/local/compose.android.yml `
  --profile app up -d --build
Invoke-RestMethod http://127.0.0.1:3000/health/live
Invoke-RestMethod http://127.0.0.1:3000/health/ready
```

This starts PostgreSQL, Redis, MinIO, Mailpit, migrations, API, and Web. The API is published only on
`127.0.0.1:3000`; it is not exposed to the LAN. Registration mail is visible at `http://127.0.0.1:8025`.
Do not put database, PayOS, AI, or AWS credentials in the APK or in Gradle properties.

Build the debug APK for an Android Emulator (the emulator reaches the host through `10.0.2.2`):

```powershell
$env:JAVA_HOME='C:\Users\<user>\.jdks\ms-21.0.10'
.\gradlew.bat :app:assembleDebug `
  '-Pdatabreeze.apiBaseUrl=http://10.0.2.2:3000' `
  '-Pdatabreeze.webBaseUrl=https://localhost:8443' `
  '-Pdatabreeze.allowInsecureDebugLoopback=true' --no-daemon
adb install -r .\app\build\outputs\apk\debug\app-debug.apk
adb shell pm clear com.databreeze.android
adb shell monkey -p com.databreeze.android 1
```

For a USB device, run `adb reverse tcp:3000 tcp:3000` and build with
`-Pdatabreeze.apiBaseUrl=http://127.0.0.1:3000`. The debug-only cleartext exception is deliberately
limited to loopback; release builds require HTTPS. Create an account through the app/Web and copy the
OTP from Mailpit, then sign in on Android. `/v1/me/bootstrap`, datasets, mobile tasks, billing catalog,
and other authenticated clients will use the local durable database. An empty dataset/task list is a
valid fresh-database state; receipt capture remains fail-closed until a local device enrollment/grant
and a server receipt profile are configured.

The local API can be stopped without deleting data:

```powershell
docker compose --project-name databreeze-local --env-file infrastructure/local/.env `
  -f infrastructure/local/compose.yml -f infrastructure/local/compose.android.yml --profile app stop
```

The production receipt journey is: camera → encrypted local staging → WorkManager intake retry →
server artifact version → server profile lookup → governed OCR → candidate review/correction →
server validation and acceptance. The dashboard and analysis screens likewise require IDs returned
by server catalog/bootstrap responses; there are no IDs embedded in the APK.

Inside the APK, the role button in the top bar opens all six canonical roles. The mock permission matrix is:

| Role | Capture/review | Analysis | Tracking | Members | Audit | Billing |
| --- | --- | --- | --- | --- | --- | --- |
| Owner | Full | Full | Read | Manage | Read | Manage/PayOS mock |
| Admin | Review/read | Read | Read | Manage | Read | Denied |
| Analyst | Create/manage | Read/run | Read | Read | Denied | Denied |
| Operator | Capture/run | Read | Read | Read | Denied | Denied |
| Approver | Review/approve | Read | Read | Read | Denied | Denied |
| Viewer | Read only | Read | Read | Read | Denied | Denied |

Selecting a PayOS plan uses the server-owned demo catalog amount, records a checkout/audit event, updates the
subscription projection, and redirects to Dashboard. This is deliberately mock-only; no PayOS or AI key is packaged
in the APK. The installable submission artifact is `app/build/outputs/apk/demo/app-demo.apk`; `assembleRelease`
also verifies the production composition but remains unsigned until the institution's release keystore is supplied.
The backend migration `20260815010000_mobile_control_plane` adds durable route-token, push-registration and report
records; configure FCM delivery credentials in the API deployment, never in the APK.
