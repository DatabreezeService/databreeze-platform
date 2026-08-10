package com.databreeze.android.network

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
}
