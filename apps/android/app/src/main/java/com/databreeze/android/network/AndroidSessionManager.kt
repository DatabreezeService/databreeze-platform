package com.databreeze.android.network

import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface AndroidSessionState {
    data object SignedOut : AndroidSessionState
    data class SignedIn(val session: ProtectedAuthenticatedApiSession) : AndroidSessionState
}

/**
 * Owns native session rotation and the encrypted session store.
 *
 * The access token is only exposed to the authenticated transport for a single request. Refresh
 * credentials remain inside EncryptedSharedPreferences/Android Keystore and are never placed in
 * Compose state, logs, WorkManager input, or BuildConfig.
 */
class AndroidSessionManager(
    private val store: ProtectedAuthenticatedApiSessionStore,
    apiBaseUrl: String,
    allowInsecureDebugLoopback: Boolean,
) : ProtectedAuthenticatedApiSessionProvider {
    private val api = AuthenticatedIamApiClient(apiBaseUrl, allowInsecureDebugLoopback)
    private val mutex = Mutex()
    private val _state = MutableStateFlow<AndroidSessionState>(
        store.currentSession()?.let { AndroidSessionState.SignedIn(it) } ?: AndroidSessionState.SignedOut,
    )
    val state: StateFlow<AndroidSessionState> = _state.asStateFlow()

    override fun currentSession(): ProtectedAuthenticatedApiSession? = store.currentSession()

    suspend fun signIn(email: String, password: String): IamApiResult<ProtectedAuthenticatedApiSession> =
        mutex.withLock {
            when (val result = api.signIn(email, password)) {
                is IamApiResult.Success -> {
                    if (!store.replace(result.value)) return@withLock IamApiResult.Rejected("session_store_unavailable")
                    _state.value = AndroidSessionState.SignedIn(result.value)
                    result
                }
                is IamApiResult.Rejected -> result
                IamApiResult.Retryable -> IamApiResult.Retryable
            }
        }

    /** Returns a current access token and rotates it before expiry when possible. */
    suspend fun bearerToken(): String? = mutex.withLock {
        var session = store.currentSession() ?: return@withLock null
        if (shouldRefresh(session)) {
            when (val result = api.refresh(session)) {
                is IamApiResult.Success -> {
                    if (!store.replace(result.value)) return@withLock null
                    session = result.value
                    _state.value = AndroidSessionState.SignedIn(session)
                }
                is IamApiResult.Rejected -> {
                    if (result.code == "session_invalid" || result.code == "credentials_rejected") {
                        store.clear()
                        _state.value = AndroidSessionState.SignedOut
                        return@withLock null
                    }
                    // A transient outage does not destroy a valid encrypted session.
                }
                IamApiResult.Retryable -> Unit
            }
        }
        session.accessToken
    }

    suspend fun signOut(): IamApiResult<Unit> = mutex.withLock {
        val session = store.currentSession()
        val result = if (session == null) {
            IamApiResult.Success(Unit)
        } else {
            api.signOut(session)
        }
        // Local revocation is fail-closed even when the provider is unavailable.
        store.clear()
        _state.value = AndroidSessionState.SignedOut
        result
    }

    private fun shouldRefresh(session: ProtectedAuthenticatedApiSession): Boolean {
        val expiresAt = session.accessExpiresAt ?: return false
        val expiry = runCatching { Instant.parse(expiresAt) }.getOrNull() ?: return true
        return expiry.isBefore(Instant.now().plusSeconds(60))
    }
}
