package com.databreeze.android.network

import com.databreeze.android.storage.AccountWorkspaceScope

/**
 * Optional authenticated API composition inputs.
 *
 * Absent configuration keeps upload/extraction fail-closed. Callers must supply a real session
 * token provider; no credentials are embedded in the client.
 */
data class AuthenticatedApiConfig(
    val baseUrl: String,
    val organizationId: String,
    val workspaceId: String,
    val tokenProvider: AccessTokenProvider,
    val deviceId: String = "",
    val workspaceGrantId: String = "",
) {
    init {
        require(baseUrl.isNotBlank()) { "baseUrl required" }
        require(organizationId.isNotBlank()) { "organizationId required" }
        require(workspaceId.isNotBlank()) { "workspaceId required" }
        if (deviceId.isNotBlank()) require(deviceId.length <= 128 && !deviceId.contains('/')) { "deviceId invalid" }
        if (workspaceGrantId.isNotBlank()) require(workspaceGrantId.length <= 128 && !workspaceGrantId.contains('/')) { "workspaceGrantId invalid" }
    }

    companion object {
        /**
         * AND-003: bind a protected native session to one exact API origin and tenant scope.
         * Tokens are resolved for every request and fail closed after account/workspace switch.
         */
        fun fromProtectedRuntime(
            apiBaseUrl: String,
            allowInsecureDebugLoopback: Boolean,
            sessionProvider: ProtectedAuthenticatedApiSessionProvider,
            accessTokenProvider: AccessTokenProvider? = null,
        ): AuthenticatedApiRuntime? {
            val baseUrl = validatedOrigin(apiBaseUrl, allowInsecureDebugLoopback) ?: return null
            val session = sessionProvider.currentSession() ?: return null
            val expectedAccountId = session.accountId
            val expectedOrganizationId = session.organizationId
            val expectedWorkspaceId = session.workspaceId
            val scopeBoundTokenProvider = AccessTokenProvider {
                val current = sessionProvider.currentSession()
                if (
                    current?.accountId == expectedAccountId &&
                    current.organizationId == expectedOrganizationId &&
                    current.workspaceId == expectedWorkspaceId
                ) {
                    (accessTokenProvider ?: AccessTokenProvider { current.accessToken }).bearerToken()
                } else {
                    null
                }
            }
            return AuthenticatedApiRuntime(
                api = AuthenticatedApiConfig(
                    baseUrl = baseUrl,
                    organizationId = expectedOrganizationId,
                    workspaceId = expectedWorkspaceId,
                    tokenProvider = scopeBoundTokenProvider,
                    deviceId = session.deviceId,
                    workspaceGrantId = session.receiptWorkspaceGrantId,
                ),
                scope = AccountWorkspaceScope(expectedAccountId, expectedWorkspaceId),
                receiptWorkspaceGrantId = session.receiptWorkspaceGrantId,
                deviceId = session.deviceId,
            )
        }

        private fun validatedOrigin(raw: String, allowInsecureDebugLoopback: Boolean): String? {
            return normalizeApiOrigin(raw, allowInsecureDebugLoopback)
        }
    }
}

data class AuthenticatedApiRuntime(
    val api: AuthenticatedApiConfig,
    val scope: AccountWorkspaceScope,
    val receiptWorkspaceGrantId: String,
    /** Device identity is server-issued; blank means enrollment is still required. */
    val deviceId: String = "",
)

fun interface ProtectedAuthenticatedApiSessionProvider {
    fun currentSession(): ProtectedAuthenticatedApiSession?
}

data class ProtectedAuthenticatedApiSession(
    val accountId: String,
    val organizationId: String,
    val workspaceId: String,
    /** Issued by DSO/device enrollment; absent sessions remain read-only until a grant exists. */
    val receiptWorkspaceGrantId: String = "",
    val deviceId: String = "",
    val accessToken: String,
    /** Native sessions rotate refresh credentials; these values never enter Compose state. */
    val sessionId: String = "",
    val refreshToken: String? = null,
    val accessExpiresAt: String? = null,
    val securityEpoch: Long = 0L,
    val mfaRequired: Boolean = false,
    val mfaReenrollmentRequired: Boolean = false,
) {
    init {
        requireIdentifier(accountId, "accountId")
        requireIdentifier(organizationId, "organizationId")
        requireIdentifier(workspaceId, "workspaceId")
        if (receiptWorkspaceGrantId.isNotBlank()) {
            requireIdentifier(receiptWorkspaceGrantId, "receiptWorkspaceGrantId")
        }
        if (deviceId.isNotBlank()) requireIdentifier(deviceId, "deviceId")
        require(accessToken.isNotBlank() && accessToken.length <= 4096) { "accessToken invalid" }
        if (sessionId.isNotBlank()) requireIdentifier(sessionId, "sessionId")
        if (refreshToken != null) require(refreshToken.isNotBlank() && refreshToken.length <= 4096) {
            "refreshToken invalid"
        }
        require(securityEpoch >= 0L) { "securityEpoch invalid" }
    }

    override fun toString(): String =
        "ProtectedAuthenticatedApiSession(accountId=$accountId, organizationId=$organizationId, workspaceId=$workspaceId, receiptWorkspaceGrantId=$receiptWorkspaceGrantId, sessionId=$sessionId, accessToken=[REDACTED], refreshToken=[REDACTED])"

    companion object {
        private fun requireIdentifier(value: String, name: String) {
            require(
                value.isNotBlank() &&
                    value.length <= 128 &&
                    !value.contains('/') &&
                    !value.contains('\\') &&
                    !value.contains("..")
            ) { "$name invalid" }
        }
    }
}
