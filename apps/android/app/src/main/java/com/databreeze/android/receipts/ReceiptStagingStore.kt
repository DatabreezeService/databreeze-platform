package com.databreeze.android.receipts

import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.security.EncryptedPayload
import com.databreeze.android.storage.AccountWorkspaceScope

data class ReceiptStagingMetadata(
    val artifactSessionId: String,
    val contentDigest: String,
    val byteLength: Int,
)

data class ReceiptStageResult(val accepted: Boolean)

interface ReceiptStagingStore {
    fun stage(
        scope: AccountWorkspaceScope,
        keyHandle: DeviceKeyHandle,
        artifactSessionId: String,
        originalBytes: ByteArray,
        contentDigest: String,
    ): ReceiptStageResult

    fun loadOriginal(
        scope: AccountWorkspaceScope,
        keyHandle: DeviceKeyHandle,
        artifactSessionId: String,
    ): ByteArray?

    fun metadata(scope: AccountWorkspaceScope, artifactSessionId: String): ReceiptStagingMetadata?

    fun clearScope(scope: AccountWorkspaceScope)

    /** Test/debug only: must never expose plaintext from production adapters. */
    fun plaintextLookup(scope: AccountWorkspaceScope, artifactSessionId: String): ByteArray?
}

/**
 * Encrypted in-memory staging used by unit tests and as the prototype store until Room-backed
 * encrypted files land in a follow-up. Bytes remain ciphertext-only in the map.
 */
class InMemoryReceiptStagingStore(
    private val cipher: DevicePayloadCipher,
    @Suppress("unused") private val keyStore: DeviceKeyStore,
) : ReceiptStagingStore {
    private data class Entry(
        val scopeKey: String,
        val metadata: ReceiptStagingMetadata,
        val payload: EncryptedPayload,
    )

    private val entries = linkedMapOf<String, Entry>()

    override fun stage(
        scope: AccountWorkspaceScope,
        keyHandle: DeviceKeyHandle,
        artifactSessionId: String,
        originalBytes: ByteArray,
        contentDigest: String,
    ): ReceiptStageResult {
        require(originalBytes.isNotEmpty()) { "originalBytes cannot be empty" }
        require(contentDigest.matches(SHA256_DIGEST)) { "contentDigest must be sha256" }
        val key = entryKey(scope, artifactSessionId)
        entries[key] = Entry(
            scopeKey = scope.stableKey,
            metadata = ReceiptStagingMetadata(
                artifactSessionId = artifactSessionId,
                contentDigest = contentDigest,
                byteLength = originalBytes.size,
            ),
            payload = cipher.encrypt(keyHandle, originalBytes),
        )
        return ReceiptStageResult(accepted = true)
    }

    override fun loadOriginal(
        scope: AccountWorkspaceScope,
        keyHandle: DeviceKeyHandle,
        artifactSessionId: String,
    ): ByteArray? {
        val entry = entries[entryKey(scope, artifactSessionId)] ?: return null
        if (entry.scopeKey != scope.stableKey) return null
        return cipher.decrypt(keyHandle, entry.payload)
    }

    override fun metadata(scope: AccountWorkspaceScope, artifactSessionId: String): ReceiptStagingMetadata? {
        val entry = entries[entryKey(scope, artifactSessionId)] ?: return null
        if (entry.scopeKey != scope.stableKey) return null
        return entry.metadata
    }

    override fun clearScope(scope: AccountWorkspaceScope) {
        val doomed = entries.filterValues { it.scopeKey == scope.stableKey }.keys
        doomed.forEach { entries.remove(it) }
    }

    override fun plaintextLookup(scope: AccountWorkspaceScope, artifactSessionId: String): ByteArray? = null

    private fun entryKey(scope: AccountWorkspaceScope, artifactSessionId: String): String =
        "${scope.stableKey}:$artifactSessionId"

    companion object {
        private val SHA256_DIGEST = Regex("sha256:[0-9a-fA-F]{64}")
    }
}
