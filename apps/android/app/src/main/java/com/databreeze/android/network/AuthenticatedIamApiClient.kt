package com.databreeze.android.network

import com.databreeze.contracts.v4.IamAuthSession
import com.databreeze.contracts.v4.TenantSession
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Result boundary for public/native IAM calls. Error bodies are never surfaced or persisted. */
sealed interface IamApiResult<out TValue> {
    data class Success<TValue>(val value: TValue) : IamApiResult<TValue>
    data class Rejected(val code: String) : IamApiResult<Nothing>
    data object Retryable : IamApiResult<Nothing>
}

data class LiveBootstrapSnapshot(
    val userId: String,
    val displayName: String,
    val locale: String,
    val mfaState: String,
    val organizationId: String,
    val organizationName: String,
    val workspaceId: String,
    val workspaceName: String,
    val projectId: String,
    val projectName: String,
    val authorizationEpoch: Long,
)

private data class PublicHttpResponse(val statusCode: Int, val body: String)

/**
 * Native IAM adapter for the API's v4 sign-in/refresh contracts.
 *
 * The Android client sends credentials only to the configured HTTPS API origin. AWS IAM
 * credentials, PayOS keys, AI keys, and database credentials are never packaged here.
 */
class AuthenticatedIamApiClient(
    apiBaseUrl: String,
    allowInsecureDebugLoopback: Boolean,
    private val tokenProvider: AccessTokenProvider? = null,
) {
    private val baseUrl = normalizeApiOrigin(apiBaseUrl, allowInsecureDebugLoopback)
    private val mapper =
        jacksonObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

    suspend fun signIn(email: String, password: String): IamApiResult<ProtectedAuthenticatedApiSession> {
        val normalizedEmail = email.trim().lowercase()
        if (!EMAIL_PATTERN.matches(normalizedEmail)) return IamApiResult.Rejected("email_invalid")
        if (password.length !in 12..128) return IamApiResult.Rejected("password_invalid")
        val body =
            mapper.writeValueAsString(
                linkedMapOf(
                    "schemaVersion" to 4,
                    "email" to normalizedEmail,
                    "password" to password,
                    "clientPlatform" to "android",
                ),
            )
        return when (val response = executePublic("POST", "/v1/auth/sign-in", body)) {
            is PublicCall.Success -> parseSession(response.response.body)
            is PublicCall.Rejected -> IamApiResult.Rejected(response.code)
            PublicCall.Retryable -> IamApiResult.Retryable
        }
    }

    suspend fun refresh(session: ProtectedAuthenticatedApiSession): IamApiResult<ProtectedAuthenticatedApiSession> {
        val refreshToken = session.refreshToken
            ?: return IamApiResult.Rejected("refresh_token_missing")
        val body = mapper.writeValueAsString(
            linkedMapOf(
                "clientPlatform" to "android",
                "refreshToken" to refreshToken,
            ),
        )
        return when (val response = executePublic("POST", "/v1/auth/refresh", body)) {
            is PublicCall.Success -> parseSession(response.response.body, previous = session)
            is PublicCall.Rejected -> IamApiResult.Rejected(response.code)
            PublicCall.Retryable -> IamApiResult.Retryable
        }
    }

    suspend fun bootstrap(session: ProtectedAuthenticatedApiSession): IamApiResult<LiveBootstrapSnapshot> {
        if (baseUrl == null) return IamApiResult.Rejected("api_not_configured")
        val transport = authenticatedTransport(session)
        return when (val response = transport.execute(AuthenticatedHttpRequest("GET", "/v1/me/bootstrap"))) {
            is AuthenticatedHttpResult.Success -> parseBootstrap(response.body)
            is AuthenticatedHttpResult.TerminalAuthFailure -> IamApiResult.Rejected("session_invalid")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> IamApiResult.Retryable
        }
    }

    suspend fun signOut(session: ProtectedAuthenticatedApiSession): IamApiResult<Unit> {
        if (session.sessionId.isBlank() || baseUrl == null) return IamApiResult.Success(Unit)
        val body = mapper.writeValueAsString(
            linkedMapOf(
                "clientPlatform" to "android",
                "sessionId" to session.sessionId,
            ),
        )
        return when (
            val response = authenticatedTransport(session).execute(
                AuthenticatedHttpRequest("POST", "/v1/auth/sign-out", jsonBody = body),
            )
        ) {
            is AuthenticatedHttpResult.Success -> IamApiResult.Success(Unit)
            is AuthenticatedHttpResult.TerminalAuthFailure -> IamApiResult.Rejected("session_invalid")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> IamApiResult.Retryable
        }
    }

    /** Reads the server-authoritative role for display and navigation hints only. */
    suspend fun currentRole(session: ProtectedAuthenticatedApiSession): IamApiResult<String> {
        if (baseUrl == null) return IamApiResult.Rejected("api_not_configured")
        return when (val response = authenticatedTransport(session).execute(AuthenticatedHttpRequest("GET", "/v1/memberships"))) {
            is AuthenticatedHttpResult.Success -> runCatching {
                val root = mapper.readTree(response.body)
                if (root.get("accepted")?.booleanValue() != true) return@runCatching IamApiResult.Rejected("membership_rejected")
                val rows = root.get("value")?.let { if (it.isArray) it else it.get("memberships") }
                    ?: return@runCatching IamApiResult.Rejected("membership_invalid")
                val role = rows.firstOrNull { row ->
                    row.get("principalId")?.textValue() == session.accountId &&
                        row.get("roleId")?.textValue()?.isNotBlank() == true
                }?.get("roleId")?.textValue()
                    ?: return@runCatching IamApiResult.Rejected("membership_not_found")
                IamApiResult.Success(role)
            }.getOrElse { IamApiResult.Rejected("membership_invalid") }
            is AuthenticatedHttpResult.TerminalAuthFailure -> IamApiResult.Rejected("session_invalid")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> IamApiResult.Retryable
        }
    }

    private fun authenticatedTransport(session: ProtectedAuthenticatedApiSession) =
        HttpUrlConnectionAuthenticatedApiTransport(
            baseUrl = checkNotNull(baseUrl),
            tokenProvider = tokenProvider ?: AccessTokenProvider { session.accessToken },
        )

    private fun parseSession(
        body: String,
        previous: ProtectedAuthenticatedApiSession? = null,
    ): IamApiResult<ProtectedAuthenticatedApiSession> = runCatching {
        val value = mapper.readValue(body, IamAuthSession::class.java)
        if (value !is TenantSession) {
            return IamApiResult.Rejected("auth_response_invalid")
        }
        if (value.schemaVersion != 4L || value.refreshToken.isNullOrBlank()) {
            return IamApiResult.Rejected("auth_response_invalid")
        }
        if (
            !isUuid(value.sessionId) || !isUuid(value.userId) ||
                !isUuid(value.organizationId) || !isUuid(value.workspaceId) ||
                value.accessToken.isBlank() || value.accessToken.length > 4096 ||
                value.refreshToken.length > 4096 || value.accessExpiresAt.isBlank() ||
                value.securityEpoch < 1L
        ) {
            return IamApiResult.Rejected("auth_response_invalid")
        }
        IamApiResult.Success(
            ProtectedAuthenticatedApiSession(
                accountId = value.userId,
                organizationId = value.organizationId,
                workspaceId = value.workspaceId,
                receiptWorkspaceGrantId = previous?.receiptWorkspaceGrantId.orEmpty(),
                deviceId = previous?.deviceId.orEmpty(),
                accessToken = value.accessToken,
                sessionId = value.sessionId,
                refreshToken = value.refreshToken,
                accessExpiresAt = value.accessExpiresAt,
                securityEpoch = value.securityEpoch,
                mfaRequired = value.mfaRequired,
                mfaReenrollmentRequired = value.mfaReenrollmentRequired,
            ),
        )
    }.getOrElse { IamApiResult.Rejected("auth_response_invalid") }

    private fun parseBootstrap(body: String): IamApiResult<LiveBootstrapSnapshot> = runCatching {
        val root = mapper.readTree(body)
        if (root.longValue("schemaVersion") != 4L || root.text("outcome") != "ACCEPTED") {
            return IamApiResult.Rejected("bootstrap_rejected")
        }
        val value = root.get("value") ?: return IamApiResult.Rejected("bootstrap_invalid")
        val user = value.get("user") ?: return IamApiResult.Rejected("bootstrap_invalid")
        val organization = value.get("organizations")?.takeIf { it.isArray }?.firstOrNull()
            ?: return IamApiResult.Rejected("bootstrap_invalid")
        val workspace = organization.get("workspaces")?.takeIf { it.isArray }?.firstOrNull()
            ?: return IamApiResult.Rejected("bootstrap_invalid")
        val project = workspace.get("projects")?.takeIf { it.isArray }?.firstOrNull()
            ?: return IamApiResult.Rejected("bootstrap_invalid")
        val session = value.get("session") ?: return IamApiResult.Rejected("bootstrap_invalid")
        val result = LiveBootstrapSnapshot(
            userId = user.text("id") ?: return IamApiResult.Rejected("bootstrap_invalid"),
            displayName = user.text("displayName") ?: return IamApiResult.Rejected("bootstrap_invalid"),
            locale = user.text("locale") ?: "vi-VN",
            mfaState = user.text("mfaState") ?: "NOT_CONFIGURED",
            organizationId = organization.text("id") ?: return IamApiResult.Rejected("bootstrap_invalid"),
            organizationName = organization.text("name") ?: return IamApiResult.Rejected("bootstrap_invalid"),
            workspaceId = workspace.text("id") ?: return IamApiResult.Rejected("bootstrap_invalid"),
            workspaceName = workspace.text("name") ?: return IamApiResult.Rejected("bootstrap_invalid"),
            projectId = project.text("id") ?: return IamApiResult.Rejected("bootstrap_invalid"),
            projectName = project.text("name") ?: return IamApiResult.Rejected("bootstrap_invalid"),
            authorizationEpoch = session.longValue("authorizationEpoch")
                ?: return IamApiResult.Rejected("bootstrap_invalid"),
        )
        IamApiResult.Success(result)
    }.getOrElse { IamApiResult.Rejected("bootstrap_invalid") }

    private sealed interface PublicCall {
        data class Success(val response: PublicHttpResponse) : PublicCall
        data class Rejected(val code: String) : PublicCall
        data object Retryable : PublicCall
    }

    private suspend fun executePublic(method: String, path: String, body: String?): PublicCall =
        withContext(Dispatchers.IO) {
            if (baseUrl == null) return@withContext PublicCall.Rejected("api_not_configured")
            try {
                val uri = URI.create(baseUrl.trimEnd('/') + "/" + path.trimStart('/'))
                val connection = (uri.toURL().openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 10_000
                    readTimeout = 30_000
                    doInput = true
                    setRequestProperty("Accept", "application/json")
                    if (body != null) {
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json")
                        val bytes = body.toByteArray(StandardCharsets.UTF_8)
                        setRequestProperty("Content-Length", bytes.size.toString())
                        outputStream.use { it.write(bytes) }
                    }
                }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                val responseBody = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }.orEmpty()
                when {
                    status in 200..299 -> PublicCall.Success(PublicHttpResponse(status, responseBody))
                    status == 408 || status == 429 || status >= 500 -> PublicCall.Retryable
                    status == 401 || status == 403 -> PublicCall.Rejected("credentials_rejected")
                    else -> PublicCall.Rejected("request_rejected")
                }
            } catch (_: IOException) {
                PublicCall.Retryable
            } catch (_: IllegalArgumentException) {
                PublicCall.Rejected("request_invalid")
            }
        }

    private companion object {
        val EMAIL_PATTERN = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

        fun isUuid(value: String): Boolean = UUID_PATTERN.matches(value)

        fun JsonNode.text(key: String): String? =
            get(key)?.takeIf { it.isTextual }?.textValue()?.takeIf { it.isNotBlank() }

        fun JsonNode.longValue(key: String): Long? =
            get(key)?.takeIf { it.canConvertToLong() }?.longValue()
    }
}

/** Only permits HTTPS origins in release; cleartext is restricted to explicit debug loopback. */
fun normalizeApiOrigin(raw: String, allowInsecureDebugLoopback: Boolean): String? {
    if (raw.isBlank() || raw.length > 2048) return null
    val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return null
    if (
        uri.host.isNullOrBlank() || uri.rawUserInfo != null ||
            (uri.rawPath != null && uri.rawPath != "" && uri.rawPath != "/") ||
            uri.rawQuery != null || uri.rawFragment != null
    ) return null
    val secure = uri.scheme.equals("https", ignoreCase = true)
    val loopback = allowInsecureDebugLoopback && uri.scheme.equals("http", ignoreCase = true) &&
        uri.host.lowercase() in setOf("10.0.2.2", "127.0.0.1", "localhost", "::1")
    if (!secure && !loopback) return null
    val authority = if (uri.port == -1) uri.host else "${uri.host}:${uri.port}"
    return "${uri.scheme.lowercase()}://$authority"
}
