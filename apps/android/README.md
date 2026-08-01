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

The launcher mark is copied from the approved generated DataBreeze asset; it is not redrawn or recolored.
