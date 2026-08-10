package com.databreeze.android.receipts

import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.storage.AccountWorkspaceScope
import java.io.File
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** DDA-040: durable encrypted staging survives beyond in-memory prototype maps. */
class FileBackedReceiptStagingStoreTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private val scope = AccountWorkspaceScope("account-1", "workspace-1")

    @Test
    fun durable_store_persists_ciphertext_and_reloads_after_new_instance() {
        val root = temporaryFolder.newFolder("receipt-staging")
        val keyStore = InMemoryDeviceKeyStore()
        val handle = keyStore.getOrCreate("receipt-staging")
        val bytes = byteArrayOf(7, 8, 9, 10)

        val first = FileBackedReceiptStagingStore(root, DevicePayloadCipher(keyStore), keyStore)
        assertTrue(
            first
                .stage(
                    scope = scope,
                    keyHandle = handle,
                    artifactSessionId = "session-durable",
                    originalBytes = bytes,
                    contentDigest = "sha256:${"a".repeat(64)}",
                ).accepted,
        )
        assertNull(first.plaintextLookup(scope, "session-durable"))
        assertTrue(File(root, scope.stableKey.replace(Regex("[^a-zA-Z0-9._-]"), "_")).listFiles()!!.isNotEmpty())

        val second = FileBackedReceiptStagingStore(root, DevicePayloadCipher(keyStore), keyStore)
        assertArrayEquals(bytes, second.loadOriginal(scope, handle, "session-durable"))
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
