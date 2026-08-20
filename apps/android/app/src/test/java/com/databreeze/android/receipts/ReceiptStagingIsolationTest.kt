package com.databreeze.android.receipts

import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.security.EncryptedPayload
import com.databreeze.android.storage.AccountWorkspaceScope
import java.security.SecureRandom
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** DDA-040: encrypted account/workspace staging isolation and logout clearing. */
class ReceiptStagingIsolationTest {
    private val first = AccountWorkspaceScope("account-1", "workspace-1")
    private val second = AccountWorkspaceScope("account-1", "workspace-2")
    private val otherAccount = AccountWorkspaceScope("account-2", "workspace-1")

    @Test
    fun staging_is_encrypted_and_scoped_to_account_workspace() {
        val keyStore = InMemoryDeviceKeyStore()
        val store = InMemoryReceiptStagingStore(DevicePayloadCipher(keyStore), keyStore)
        val handle = keyStore.getOrCreate("receipt-staging")
        val bytes = byteArrayOf(1, 2, 3, 4, 5)

        val staged = store.stage(
            scope = first,
            keyHandle = handle,
            artifactSessionId = "session-1",
            originalBytes = bytes,
            contentDigest = "sha256:${"e".repeat(64)}",
        )
        assertTrue(staged.accepted)
        assertNull(store.plaintextLookup(first, "session-1"))

        val loaded = store.loadOriginal(first, handle, "session-1")
        assertArrayEquals(bytes, loaded)

        assertNull(store.loadOriginal(second, handle, "session-1"))
        assertNull(store.loadOriginal(otherAccount, handle, "session-1"))
    }

    @Test
    fun logout_or_account_switch_clears_only_that_scope() {
        val keyStore = InMemoryDeviceKeyStore()
        val store = InMemoryReceiptStagingStore(DevicePayloadCipher(keyStore), keyStore)
        val handle = keyStore.getOrCreate("receipt-staging")
        store.stage(first, handle, "session-a", byteArrayOf(9), "sha256:${"f".repeat(64)}")
        store.stage(second, handle, "session-b", byteArrayOf(8), "sha256:${"1".repeat(64)}")

        store.clearScope(first)
        assertNull(store.loadOriginal(first, handle, "session-a"))
        assertArrayEquals(byteArrayOf(8), store.loadOriginal(second, handle, "session-b"))
    }

    @Test
    fun capture_gate_requires_camera_permission_and_authorized_destination() {
        val gate = ReceiptCaptureGate()
        assertEquals(
            ReceiptCaptureDenyReason.CAMERA_PERMISSION_MISSING,
            gate.evaluate(
                cameraPermissionGranted = false,
                destination = ReceiptDestination.Cloud(workspaceGrantId = "grant-1"),
                scopeAuthorized = true,
            ),
        )
        assertEquals(
            ReceiptCaptureDenyReason.MISSING_DESTINATION,
            gate.evaluate(
                cameraPermissionGranted = true,
                destination = null,
                scopeAuthorized = true,
            ),
        )
        assertNull(
            gate.evaluate(
                cameraPermissionGranted = true,
                destination = ReceiptDestination.StrictLocal,
                scopeAuthorized = true,
            ),
        )
        assertEquals(
            ReceiptCaptureDenyReason.SCOPE_UNAUTHORIZED,
            gate.evaluate(
                cameraPermissionGranted = true,
                destination = ReceiptDestination.Hybrid(workspaceGrantId = "grant-1"),
                scopeAuthorized = false,
            ),
        )
        assertNull(
            gate.evaluate(
                cameraPermissionGranted = true,
                destination = ReceiptDestination.Hybrid(workspaceGrantId = "grant-1"),
                scopeAuthorized = true,
            ),
        )
    }

    @Test
    fun process_death_recovers_staged_metadata_without_mutating_original_digest() {
        val keyStore = InMemoryDeviceKeyStore()
        val store = InMemoryReceiptStagingStore(DevicePayloadCipher(keyStore), keyStore)
        val handle = keyStore.getOrCreate("receipt-staging")
        val digest = "sha256:${"2".repeat(64)}"
        store.stage(first, handle, "session-recover", byteArrayOf(7, 7), digest)

        val recovered = store.metadata(first, "session-recover")
        assertEquals(digest, recovered?.contentDigest)
        assertEquals(2, recovered?.byteLength)
        assertEquals("session-recover", recovered?.artifactSessionId)
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
