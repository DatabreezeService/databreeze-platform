package com.databreeze.android.network

import com.databreeze.android.storage.AccountWorkspaceScope
import java.net.URI

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
) {
    init {
        require(baseUrl.isNotBlank()) { "baseUrl required" }
        require(organizationId.isNotBlank()) { "organizationId required" }
        require(workspaceId.isNotBlank()) { "workspaceId required" }
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
        ): AuthenticatedApiRuntime? {
            val baseUrl = validatedOrigin(apiBaseUrl, allowInsecureDebugLoopback) ?: return null
            val session = sessionProvider.currentSession() ?: return null
            val expectedAccountId = session.accountId
            val expectedOrganizationId = session.organizationId
            val expectedWorkspaceId = session.workspaceId
            val tokenProvider = AccessTokenProvider {
                val current = sessionProvider.currentSession()
                if (
                    current?.accountId == expectedAccountId &&
                    current.organizationId == expectedOrganizationId &&
                    current.workspaceId == expectedWorkspaceId
                ) {
                    current.accessToken
                } else {
                    null
                }
            }
            return AuthenticatedApiRuntime(
                api = AuthenticatedApiConfig(
                    baseUrl = baseUrl,
                    organizationId = expectedOrganizationId,
                    workspaceId = expectedWorkspaceId,
                    tokenProvider = tokenProvider,
                ),
                scope = AccountWorkspaceScope(expectedAccountId, expectedWorkspaceId),
                receiptWorkspaceGrantId = session.receiptWorkspaceGrantId,
            )
        }

        private fun validatedOrigin(raw: String, allowInsecureDebugLoopback: Boolean): String? {
            if (raw.isBlank() || raw.length > 2048) return null
            val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return null
            if (
                uri.host.isNullOrBlank() ||
                uri.rawUserInfo != null ||
                (uri.rawPath != null && uri.rawPath != "" && uri.rawPath != "/") ||
                uri.rawQuery != null ||
                uri.rawFragment != null
            ) {
                return null
            }
            val secure = uri.scheme.equals("https", ignoreCase = true)
            val debugLoopback =
                allowInsecureDebugLoopback &&
                    uri.scheme.equals("http", ignoreCase = true) &&
                    uri.host.lowercase() in setOf("10.0.2.2", "127.0.0.1", "localhost", "::1")
            if (!secure && !debugLoopback) return null
            val authority = if (uri.port == -1) uri.host else "${uri.host}:${uri.port}"
            return "${uri.scheme.lowercase()}://$authority"
        }
    }
}

data class AuthenticatedApiRuntime(
    val api: AuthenticatedApiConfig,
    val scope: AccountWorkspaceScope,
    val receiptWorkspaceGrantId: String,
)

fun interface ProtectedAuthenticatedApiSessionProvider {
    fun currentSession(): ProtectedAuthenticatedApiSession?
}

data class ProtectedAuthenticatedApiSession(
    val accountId: String,
    val organizationId: String,
    val workspaceId: String,
    val receiptWorkspaceGrantId: String,
    val accessToken: String,
) {
    init {
        requireIdentifier(accountId, "accountId")
        requireIdentifier(organizationId, "organizationId")
        requireIdentifier(workspaceId, "workspaceId")
        requireIdentifier(receiptWorkspaceGrantId, "receiptWorkspaceGrantId")
        require(accessToken.isNotBlank() && accessToken.length <= 4096) { "accessToken invalid" }
    }

    override fun toString(): String =
        "ProtectedAuthenticatedApiSession(accountId=$accountId, organizationId=$organizationId, workspaceId=$workspaceId, receiptWorkspaceGrantId=$receiptWorkspaceGrantId, accessToken=[REDACTED])"

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
