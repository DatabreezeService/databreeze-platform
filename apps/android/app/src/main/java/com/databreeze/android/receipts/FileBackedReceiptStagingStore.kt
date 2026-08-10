package com.databreeze.android.receipts

import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.security.EncryptedPayload
import com.databreeze.android.storage.AccountWorkspaceScope
import org.json.JSONObject
import java.io.File
import java.util.Base64

/**
 * Durable encrypted staging: ciphertext + metadata on disk under an account/workspace scope.
 * Survives process death; plaintext never written. Used by production AndroidRuntime.
 */
class FileBackedReceiptStagingStore(
    private val rootDirectory: File,
    private val cipher: DevicePayloadCipher,
    @Suppress("unused") private val keyStore: DeviceKeyStore,
) : ReceiptStagingStore {
    init {
        if (!rootDirectory.exists()) {
            check(rootDirectory.mkdirs()) { "unable to create receipt staging root" }
        }
    }

    override fun stage(
        scope: AccountWorkspaceScope,
        keyHandle: DeviceKeyHandle,
        artifactSessionId: String,
        originalBytes: ByteArray,
        contentDigest: String,
    ): ReceiptStageResult {
        require(originalBytes.isNotEmpty()) { "originalBytes cannot be empty" }
        require(contentDigest.matches(SHA256_DIGEST)) { "contentDigest must be sha256" }
        val payload = cipher.encrypt(keyHandle, originalBytes)
        val dir = scopeDirectory(scope)
        if (!dir.exists()) check(dir.mkdirs()) { "unable to create staging scope directory" }
        val meta =
            ReceiptStagingMetadata(
                artifactSessionId = artifactSessionId,
                contentDigest = contentDigest,
                byteLength = originalBytes.size,
            )
        writeEnvelope(dir, artifactSessionId, meta, payload)
        return ReceiptStageResult(accepted = true)
    }

    override fun loadOriginal(
        scope: AccountWorkspaceScope,
        keyHandle: DeviceKeyHandle,
        artifactSessionId: String,
    ): ByteArray? {
        val envelope = readEnvelope(scopeDirectory(scope), artifactSessionId) ?: return null
        return cipher.decrypt(keyHandle, envelope.payload)
    }

    override fun metadata(scope: AccountWorkspaceScope, artifactSessionId: String): ReceiptStagingMetadata? =
        readEnvelope(scopeDirectory(scope), artifactSessionId)?.metadata

    override fun clearScope(scope: AccountWorkspaceScope) {
        val dir = scopeDirectory(scope)
        if (!dir.exists()) return
        dir.listFiles()?.forEach { it.delete() }
        dir.delete()
    }

    override fun plaintextLookup(scope: AccountWorkspaceScope, artifactSessionId: String): ByteArray? = null

    private fun scopeDirectory(scope: AccountWorkspaceScope): File =
        File(rootDirectory, scope.stableKey.replace(Regex("[^a-zA-Z0-9._-]"), "_"))

    private fun writeEnvelope(
        dir: File,
        artifactSessionId: String,
        metadata: ReceiptStagingMetadata,
        payload: EncryptedPayload,
    ) {
        val safeId = artifactSessionId.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val file = File(dir, "$safeId.json")
        val json =
            JSONObject()
                .put("artifactSessionId", metadata.artifactSessionId)
                .put("contentDigest", metadata.contentDigest)
                .put("byteLength", metadata.byteLength)
                .put("iv", Base64.getEncoder().encodeToString(payload.iv))
                .put("ciphertext", Base64.getEncoder().encodeToString(payload.ciphertext))
        file.writeText(json.toString())
    }

    private data class Envelope(val metadata: ReceiptStagingMetadata, val payload: EncryptedPayload)

    private fun readEnvelope(dir: File, artifactSessionId: String): Envelope? {
        if (!dir.exists()) return null
        val safeId = artifactSessionId.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val file = File(dir, "$safeId.json")
        if (!file.isFile) return null
        return runCatching {
            val json = JSONObject(file.readText())
            Envelope(
                metadata =
                    ReceiptStagingMetadata(
                        artifactSessionId = json.getString("artifactSessionId"),
                        contentDigest = json.getString("contentDigest"),
                        byteLength = json.getInt("byteLength"),
                    ),
                payload =
                    EncryptedPayload(
                        iv = Base64.getDecoder().decode(json.getString("iv")),
                        ciphertext = Base64.getDecoder().decode(json.getString("ciphertext")),
                    ),
            )
        }.getOrNull()
    }

    companion object {
        private val SHA256_DIGEST = Regex("sha256:[0-9a-fA-F]{64}")
    }
}
