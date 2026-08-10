package com.databreeze.android.receipts

import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.storage.AccountWorkspaceScope
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** DDA-040: uploads reconstruct the original only from encrypted, scope-bound durable staging. */
class StagedReceiptUploadTransportTest {
    private val scope = AccountWorkspaceScope("account-1", "workspace-1")
    private val keyStore = InMemoryDeviceKeyStore()
    private val keyHandle = keyStore.getOrCreate("receipt-staging")
    private val staging = InMemoryReceiptStagingStore(DevicePayloadCipher(keyStore), keyStore)

    @Test
    fun upload_posts_staged_original_with_scope_bound_idempotency_key() = runBlocking {
        val bytes = "abc".toByteArray()
        val digest = "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        staging.stage(scope, keyHandle, "session-upload", bytes, digest)
        val client = RecordingReceiptUploadApiClient()
        val transport = StagedReceiptUploadTransport(staging, keyHandle, client)

        val outcome = transport.upload(
            ReceiptUploadRequest(
                scope = scope,
                artifactSessionId = "session-upload",
                contentDigest = digest,
                destination = ReceiptDestination.Hybrid("grant-1"),
                uploadedBytes = 0L,
                totalBytes = bytes.size.toLong(),
            ),
        )

        assertEquals(ReceiptUploadTransportResult.Accepted, outcome)
        val command = requireNotNull(client.command)
        assertEquals(scope, command.scope)
        assertEquals("session-upload", command.artifactSessionId)
        assertEquals(digest, command.contentDigest)
        assertEquals("grant-1", command.workspaceGrantId)
        assertArrayEquals(bytes, command.originalBytes)
        assertEquals(bytes.size.toLong(), command.totalBytes)
        assertTrue(command.idempotencyKey.startsWith("receipt-upload-"))
        assertTrue(!command.idempotencyKey.contains(scope.accountId))
        assertTrue(!command.idempotencyKey.contains(scope.workspaceId))
    }

    @Test
    fun missing_staged_artifact_fails_closed_without_posting() = runBlocking {
        val client = RecordingReceiptUploadApiClient()
        val transport = StagedReceiptUploadTransport(staging, keyHandle, client)

        val outcome = transport.upload(
            ReceiptUploadRequest(
                scope = scope,
                artifactSessionId = "missing-session",
                contentDigest = "sha256:${"b".repeat(64)}",
                destination = ReceiptDestination.Cloud("grant-1"),
                uploadedBytes = 0L,
                totalBytes = 10L,
            ),
        )

        assertEquals(ReceiptUploadTransportResult.Rejected("staged_metadata_missing"), outcome)
        assertEquals(null, client.command)
    }

    @Test
    fun unconfigured_api_client_rejects_without_credential_fallback() = runBlocking {
        val outcome = FailClosedReceiptUploadApiClient().upload(
            ReceiptArtifactUploadCommand(
                scope = scope,
                artifactSessionId = "session-fail-closed",
                contentDigest = "sha256:${"c".repeat(64)}",
                workspaceGrantId = "grant-1",
                originalBytes = byteArrayOf(1),
                totalBytes = 1L,
                idempotencyKey = "receipt-upload-test",
            ),
        )

        assertEquals(ReceiptUploadApiResult.Rejected("receipt_upload_client_not_configured"), outcome)
    }

    private class RecordingReceiptUploadApiClient : ReceiptUploadApiClient {
        var command: ReceiptArtifactUploadCommand? = null

        override suspend fun upload(command: ReceiptArtifactUploadCommand): ReceiptUploadApiResult {
            this.command = command
            return ReceiptUploadApiResult.Accepted
        }
    }

    private class InMemoryDeviceKeyStore : DeviceKeyStore {
        private val keys = mutableMapOf<String, SecretKey>()

        override fun getOrCreate(alias: String): DeviceKeyHandle {
            keys.getOrPut(alias) {
                KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
            }
            return DeviceKeyHandle(alias)
        }

        override fun contains(alias: String): Boolean = alias in keys

        override fun delete(alias: String): Boolean = keys.remove(alias) != null

        override fun keyFor(handle: DeviceKeyHandle): SecretKey =
            keys[handle.alias] ?: error("missing key")
    }
}
