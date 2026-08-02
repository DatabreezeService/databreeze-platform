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
scope. WorkManager receives only bounded IDs, cursors, and revisions; it uses unique, network-constrained work with
exponential backoff and an injected worker factory. Accepted mutations are marked complete idempotently. Sign-out
cancels scoped work, clears that scope's local queue, and removes its device key. A Room instrumentation test covers
cross-account isolation, while the Compose smoke test recreates the activity to exercise durable draft recovery.

Connected instrumentation requires an attached emulator or device. A clean checkout can still compile the suite with
`./gradlew :app:compileDebugAndroidTestKotlin`; the release gate must record the device-backed run separately.

The launcher mark is copied from the approved generated DataBreeze asset; it is not redrawn or recolored.
