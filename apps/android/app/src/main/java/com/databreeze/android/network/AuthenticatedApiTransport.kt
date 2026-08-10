package com.databreeze.android.network

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.nio.charset.StandardCharsets

/** Content-safe authenticated HTTP transport for control-plane JSON only. */
fun interface AccessTokenProvider {
    suspend fun bearerToken(): String?
}

data class AuthenticatedHttpRequest(
    val method: String,
    val path: String,
    val jsonBody: String? = null,
    val idempotencyKey: String? = null,
    val binaryBody: ByteArray? = null,
    val contentType: String = "application/json",
)

sealed interface AuthenticatedHttpResult {
    data class Success(val statusCode: Int, val body: String) : AuthenticatedHttpResult
    data class TerminalAuthFailure(val statusCode: Int) : AuthenticatedHttpResult
    data class RetryableFailure(val statusCode: Int) : AuthenticatedHttpResult
    data class NetworkFailure(val code: String) : AuthenticatedHttpResult
}

interface AuthenticatedApiTransport {
    suspend fun execute(request: AuthenticatedHttpRequest): AuthenticatedHttpResult
}

class HttpUrlConnectionAuthenticatedApiTransport(
    private val baseUrl: String,
    private val tokenProvider: AccessTokenProvider,
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 30_000,
) : AuthenticatedApiTransport {
    override suspend fun execute(request: AuthenticatedHttpRequest): AuthenticatedHttpResult {
        val token = tokenProvider.bearerToken()
            ?: return AuthenticatedHttpResult.TerminalAuthFailure(401)
        return try {
            val uri = URI.create(baseUrl.trimEnd('/') + "/" + request.path.trimStart('/'))
            val connection = (uri.toURL().openConnection() as HttpURLConnection).apply {
                requestMethod = request.method
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                doInput = true
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Accept", "application/json")
                request.idempotencyKey?.let { setRequestProperty("Idempotency-Key", it) }
                val payload = request.binaryBody ?: request.jsonBody?.toByteArray(StandardCharsets.UTF_8)
                if (payload != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", request.contentType)
                    setRequestProperty("Content-Length", payload.size.toString())
                    outputStream.use { it.write(payload) }
                }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }.orEmpty()
            when (status) {
                401, 403 -> AuthenticatedHttpResult.TerminalAuthFailure(status)
                in 200..299 -> AuthenticatedHttpResult.Success(status, body)
                408, 429 -> AuthenticatedHttpResult.RetryableFailure(status)
                in 500..599 -> AuthenticatedHttpResult.RetryableFailure(status)
                else -> AuthenticatedHttpResult.TerminalAuthFailure(status)
            }
        } catch (_: IOException) {
            AuthenticatedHttpResult.NetworkFailure("network_unavailable")
        }
    }
}
