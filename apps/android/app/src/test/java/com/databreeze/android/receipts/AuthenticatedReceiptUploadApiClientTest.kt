package com.databreeze.android.receipts

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import com.databreeze.android.storage.AccountWorkspaceScope
import java.security.MessageDigest
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** DDA-040: authenticated resumable upload against a fake local HTTP transport. */
class AuthenticatedReceiptUploadApiClientTest {
    private val scope = AccountWorkspaceScope("account-1", "workspace-1")
    private val bytes = "synthetic-receipt".toByteArray()
    private val digest =
        "sha256:" +
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    @Test
    fun upload_streams_verified_bytes_through_opaque_transfer_grant() = runBlocking {
        val transport = FakeTransport()
        val client =
            AuthenticatedReceiptUploadApiClient(
                transport = transport,
                organizationId = "00000000-0000-4000-8000-000000000001",
                nowIso = { "2026-08-11T00:00:00.000Z" },
            )

        val result =
            client.upload(
                ReceiptArtifactUploadCommand(
                    scope = scope,
                    artifactSessionId = "00000000-0000-4000-8000-0000000000b1",
                    contentDigest = digest,
                    workspaceGrantId = "00000000-0000-4000-8000-0000000000b2",
                    originalBytes = bytes,
                    totalBytes = bytes.size.toLong(),
                    idempotencyKey = "receipt-upload-01SYNTHETICKEY0001",
                ),
            )

        assertEquals(ReceiptUploadApiResult.Accepted, result)
        assertTrue(transport.paths.contains("/v1/artifact-upload-sessions"))
        assertTrue(transport.paths.any { it.contains("/parts/transfer") })
        assertTrue(transport.paths.any { it.contains("/artifact-upload-transfers/") })
        assertTrue(transport.paths.any { it.endsWith("/complete") })
        assertFalse(transport.loggedBodies.any { it.contains("synthetic-receipt") })
        assertFalse(transport.loggedBodies.any { it.contains("C:\\\\") })
    }

    @Test
    fun auth_failure_is_terminal_without_retry_classification() = runBlocking {
        val transport =
            FakeTransport(
                createResult = AuthenticatedHttpResult.TerminalAuthFailure(401),
            )
        val client =
            AuthenticatedReceiptUploadApiClient(
                transport = transport,
                organizationId = "00000000-0000-4000-8000-000000000001",
                nowIso = { "2026-08-11T00:00:00.000Z" },
            )

        val result =
            client.upload(
                ReceiptArtifactUploadCommand(
                    scope = scope,
                    artifactSessionId = "00000000-0000-4000-8000-0000000000b1",
                    contentDigest = digest,
                    workspaceGrantId = "00000000-0000-4000-8000-0000000000b2",
                    originalBytes = bytes,
                    totalBytes = bytes.size.toLong(),
                    idempotencyKey = "receipt-upload-01SYNTHETICKEY0002",
                ),
            )

        assertEquals(ReceiptUploadApiResult.Rejected("receipt_upload_auth_denied"), result)
        assertEquals(1, transport.paths.size)
    }

    @Test
    fun digest_mismatch_fails_closed_before_network() = runBlocking {
        val transport = FakeTransport()
        val client =
            AuthenticatedReceiptUploadApiClient(
                transport = transport,
                organizationId = "00000000-0000-4000-8000-000000000001",
                nowIso = { "2026-08-11T00:00:00.000Z" },
            )

        val result =
            client.upload(
                ReceiptArtifactUploadCommand(
                    scope = scope,
                    artifactSessionId = "00000000-0000-4000-8000-0000000000b1",
                    contentDigest = "sha256:${"a".repeat(64)}",
                    workspaceGrantId = "00000000-0000-4000-8000-0000000000b2",
                    originalBytes = bytes,
                    totalBytes = bytes.size.toLong(),
                    idempotencyKey = "receipt-upload-01SYNTHETICKEY0003",
                ),
            )

        assertEquals(ReceiptUploadApiResult.Rejected("upload_digest_mismatch"), result)
        assertTrue(transport.paths.isEmpty())
    }

    private class FakeTransport(
        private val createResult: AuthenticatedHttpResult =
            AuthenticatedHttpResult.Success(200, """{"accepted":true,"revision":1}"""),
    ) : AuthenticatedApiTransport {
        val paths = mutableListOf<String>()
        val loggedBodies = mutableListOf<String>()

        override suspend fun execute(request: AuthenticatedHttpRequest): AuthenticatedHttpResult {
            paths += request.path
            request.jsonBody?.let { loggedBodies += it }
            // Never record binary bodies as strings (privacy).
            return when {
                request.path == "/v1/artifact-upload-sessions" -> createResult
                request.path.endsWith("/parts/transfer") ->
                    AuthenticatedHttpResult.Success(
                        200,
                        """{"transferId":"00000000-0000-4000-8000-0000000000t1"}""",
                    )
                request.path.contains("/artifact-upload-transfers/") ->
                    AuthenticatedHttpResult.Success(200, """{"accepted":true}""")
                request.path.endsWith("/parts") ->
                    AuthenticatedHttpResult.Success(200, """{"accepted":true,"revision":2}""")
                request.path.endsWith("/complete") ->
                    AuthenticatedHttpResult.Success(200, """{"accepted":true,"revision":3}""")
                else -> AuthenticatedHttpResult.RetryableFailure(500)
            }
        }
    }
}
