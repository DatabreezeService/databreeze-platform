import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm") version "2.2.20"
    application
}

group = "com.databreeze.fixturevalidation"
version = "1.0.0"

dependencies {
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.21.0")
    implementation("com.networknt:json-schema-validator:2.0.4")
    runtimeOnly("org.slf4j:slf4j-nop:2.0.17")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        allWarningsAsErrors.set(true)
        jvmTarget.set(JvmTarget.JVM_21)
    }
    sourceSets.named("main") {
        kotlin.srcDir("../../../packages/contracts/generated/kotlin/src/main/kotlin")
    }
}

application {
    mainClass.set("com.databreeze.fixturevalidation.ContractFixtureRunnerKt")
}

dependencyLocking {
    lockAllConfigurations()
}
