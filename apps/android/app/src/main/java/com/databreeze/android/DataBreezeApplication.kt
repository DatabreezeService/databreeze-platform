package com.databreeze.android

import android.app.Application
import androidx.work.Configuration
import com.databreeze.android.network.AndroidProtectedAuthenticatedApiSessionStore
import com.databreeze.android.network.AuthenticatedApiConfig
import com.databreeze.android.network.AuthenticatedApiRuntime
import com.databreeze.android.demo.DemoWorkspaceRepository

/** Composition root. WorkManager receives only the typed, scope-bound worker factory. */
class DataBreezeApplication : Application(), Configuration.Provider {
    val protectedApiSessionStore by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AndroidProtectedAuthenticatedApiSessionStore.create(this)
    }

    /** Null is an intentional signed-out/unconfigured state; no demo tenant is substituted. */
    val authenticatedApiRuntime: AuthenticatedApiRuntime? by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AuthenticatedApiConfig.fromProtectedRuntime(
            apiBaseUrl = BuildConfig.DATABREEZE_API_BASE_URL,
            allowInsecureDebugLoopback =
                BuildConfig.DEBUG && BuildConfig.DATABREEZE_ALLOW_INSECURE_LOOPBACK,
            sessionProvider = protectedApiSessionStore,
        )
    }

    val runtime: AndroidRuntime by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AndroidRuntime.create(this, authenticatedApiRuntime?.api)
    }

    /** The installable demo flavor is isolated from production authentication and network state. */
    val demoWorkspaceRepository: DemoWorkspaceRepository? by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        if (BuildConfig.DATABREEZE_DEMO_MODE) DemoWorkspaceRepository() else null
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(runtime.workerFactory)
            .build()
}
