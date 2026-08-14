import org.gradle.api.tasks.Sync

fun String.asBuildConfigString(): String =
    "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

fun protectedSetting(gradleName: String, environmentName: String) =
    providers.gradleProperty(gradleName)
        .orElse(providers.environmentVariable(environmentName))
        .map(String::trim)

val apiBaseUrl =
    protectedSetting("databreeze.apiBaseUrl", "DATABREEZE_ANDROID_API_BASE_URL")
        .orElse("")
val allowInsecureDebugLoopback =
    protectedSetting(
        "databreeze.allowInsecureDebugLoopback",
        "DATABREEZE_ANDROID_ALLOW_INSECURE_LOOPBACK",
    ).orElse("false")

val releaseStoreFile =
    protectedSetting("databreeze.release.storeFile", "DATABREEZE_ANDROID_KEYSTORE_PATH")
val releaseStorePassword =
    protectedSetting("databreeze.release.storePassword", "DATABREEZE_ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias =
    protectedSetting("databreeze.release.keyAlias", "DATABREEZE_ANDROID_KEY_ALIAS")
val releaseKeyPassword =
    protectedSetting("databreeze.release.keyPassword", "DATABREEZE_ANDROID_KEY_PASSWORD")
val releaseSigningValues =
    listOf(releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword)
val completeReleaseSigning = releaseSigningValues.all { it.isPresent && it.get().isNotEmpty() }

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    id("org.jetbrains.kotlin.kapt")
}

android {
    namespace = "com.databreeze.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.databreeze.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        buildConfigField("String", "DATABREEZE_API_BASE_URL", apiBaseUrl.get().asBuildConfigString())
        buildConfigField(
            "boolean",
            "DATABREEZE_ALLOW_INSECURE_LOOPBACK",
            (allowInsecureDebugLoopback.get().toBooleanStrictOrNull() ?: false).toString(),
        )
    }

    signingConfigs {
        if (completeReleaseSigning) {
            create("protectedRelease") {
                storeFile = file(releaseStoreFile.get())
                storePassword = releaseStorePassword.get()
                keyAlias = releaseKeyAlias.get()
                keyPassword = releaseKeyPassword.get()
            }
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.findByName("protectedRelease")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            // Runtime schema validation is a server/fixture concern; Android consumes the
            // generated value models and validates API responses at its own boundary.
            res.srcDir("../../../packages/design-tokens/tokens/generated/android")
        }
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlinOptions {
        jvmTarget = "21"
    }
    testOptions {
        animationsDisabled = true
    }
    lint {
        disable += "PropertyEscape"
        warningsAsErrors = false
    }
}

val validateReleaseSigningConfiguration by tasks.registering {
    group = "verification"
    description = "Fails release builds on partial signing configuration; no values are printed."
    doLast {
        val presentCount = releaseSigningValues.count { it.isPresent && it.get().isNotEmpty() }
        if (presentCount in 1..3) {
            throw GradleException("ANDROID_RELEASE_SIGNING_CONFIGURATION_INCOMPLETE")
        }
        if (presentCount == 4 && !file(releaseStoreFile.get()).isFile) {
            throw GradleException("ANDROID_RELEASE_KEYSTORE_UNAVAILABLE")
        }
        logger.lifecycle(if (presentCount == 4) "Android release signing: CONFIGURED" else "Android release signing: UNSIGNED")
    }
}

tasks.configureEach {
    if (name.matches(Regex("^(assemble|bundle|package|sign).*Release.*"))) {
        dependsOn(validateReleaseSigningConfiguration)
    }
}

val generatedContractsDir = layout.buildDirectory.dir("generated/contracts")
val stageGeneratedContracts by tasks.registering(Sync::class) {
    from("../../../packages/contracts/generated/kotlin/src/main/kotlin") {
        include("com/databreeze/contracts/v1/Models.kt")
        include("com/databreeze/contracts/v2/Models.kt")
    }
    into(generatedContractsDir)
}

android.sourceSets.getByName("main").java.srcDir(generatedContractsDir)
tasks.named("preBuild") { dependsOn(stageGeneratedContracts) }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.security.crypto)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.bundles.contractRuntime)
    kapt(libs.androidx.room.compiler)

    implementation(platform("androidx.compose:compose-bom:${libs.versions.composeBom.get()}"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation(libs.junit)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.room.testing)
    androidTestImplementation(platform("androidx.compose:compose-bom:${libs.versions.composeBom.get()}"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(libs.androidx.room.testing)
}

kapt {
    arguments {
        arg("room.schemaLocation", "$projectDir/schemas")
        arg("room.incremental", "true")
    }
}
