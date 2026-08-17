package com.databreeze.android

import android.app.Application
import androidx.work.Configuration
import com.databreeze.android.network.AndroidProtectedAuthenticatedApiSessionStore
import com.databreeze.android.network.AuthenticatedApiConfig
import com.databreeze.android.network.AuthenticatedApiRuntime
import com.databreeze.android.network.AccessTokenProvider
import com.databreeze.android.network.AndroidSessionManager
import com.databreeze.android.network.AuthenticatedIamApiClient
import com.databreeze.android.demo.DemoWorkspaceRepository
import com.databreeze.android.storage.AccountWorkspaceScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Composition root. WorkManager receives only the typed, scope-bound worker factory. */
class DataBreezeApplication : Application(), Configuration.Provider {
    val protectedApiSessionStore by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AndroidProtectedAuthenticatedApiSessionStore.create(this)
    }

    /** Native session rotation is independent from the Compose navigation tree. */
    val sessionManager by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AndroidSessionManager(
            store = protectedApiSessionStore,
            apiBaseUrl = BuildConfig.DATABREEZE_API_BASE_URL,
            allowInsecureDebugLoopback =
                BuildConfig.DEBUG && BuildConfig.DATABREEZE_ALLOW_INSECURE_LOOPBACK,
        )
    }

    val iamApiClient by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AuthenticatedIamApiClient(
            apiBaseUrl = BuildConfig.DATABREEZE_API_BASE_URL,
            allowInsecureDebugLoopback =
                BuildConfig.DEBUG && BuildConfig.DATABREEZE_ALLOW_INSECURE_LOOPBACK,
            tokenProvider = AccessTokenProvider { sessionManager.bearerToken() },
        )
    }

    /** Null is an intentional signed-out/unconfigured state; no demo tenant is substituted. */
    val authenticatedApiRuntime: AuthenticatedApiRuntime?
        get() = AuthenticatedApiConfig.fromProtectedRuntime(
            apiBaseUrl = BuildConfig.DATABREEZE_API_BASE_URL,
            allowInsecureDebugLoopback =
                BuildConfig.DEBUG && BuildConfig.DATABREEZE_ALLOW_INSECURE_LOOPBACK,
            sessionProvider = sessionManager,
            accessTokenProvider = AccessTokenProvider { sessionManager.bearerToken() },
        )

    private val runtimeStateHolder by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        MutableStateFlow(AndroidRuntime.create(this, authenticatedApiRuntime?.api))
    }

    /**
     * Do not evaluate the lazy runtime while Android is still constructing the
     * Application object.  The previous eager property initializer reached the
     * Keystore-backed session store before attachBaseContext(), where
     * Context.applicationContext is null and the process crashed on launch.
     */
    val runtimeState: StateFlow<AndroidRuntime>
        get() = runtimeStateHolder.asStateFlow()
    val runtime: AndroidRuntime get() = runtimeStateHolder.value

    /** Rebuilds API adapters after login, refresh, workspace switch, or sign-out. */
    fun refreshRuntime() {
        runtimeStateHolder.value = AndroidRuntime.create(this, authenticatedApiRuntime?.api)
    }

    /** Stores only the server-issued device identity; grants remain server-controlled. */
    fun persistDeviceEnrollment(deviceId: String, workspaceGrantId: String? = null): Boolean {
        val current = protectedApiSessionStore.currentSession() ?: return false
        if (deviceId.isBlank()) return false
        val grant = workspaceGrantId?.takeIf { it.isNotBlank() } ?: current.receiptWorkspaceGrantId
        val saved = protectedApiSessionStore.replace(
            current.copy(deviceId = deviceId, receiptWorkspaceGrantId = grant),
        )
        if (saved) refreshRuntime()
        return saved
    }

    suspend fun signOut() {
        val session = sessionManager.currentSession()
        sessionManager.signOut()
        if (session != null) {
            runtime.signOut(
                scope = AccountWorkspaceScope(session.accountId, session.workspaceId),
                keyAlias = "receipt-staging",
            )
        }
        refreshRuntime()
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
