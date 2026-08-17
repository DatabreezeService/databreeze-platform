package com.databreeze.android.receipts

import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.security.EncryptedPayload
import com.databreeze.android.storage.AccountWorkspaceScope
import java.io.File
import java.io.FileOutputStream
import java.util.Base64
import java.util.Properties

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

    override fun list(scope: AccountWorkspaceScope): List<ReceiptStagingMetadata> =
        scopeDirectory(scope).listFiles()
            ?.filter { it.isFile && it.extension == "json" }
            ?.mapNotNull { file -> readEnvelope(scopeDirectory(scope), file.nameWithoutExtension)?.metadata }
            ?.sortedBy { it.artifactSessionId }
            ?: emptyList()

    override fun clearScope(scope: AccountWorkspaceScope) {
        val dir = scopeDirectory(scope)
        if (!dir.exists()) return
        dir.listFiles()?.forEach { it.delete() }
        dir.delete()
    }

    override fun delete(scope: AccountWorkspaceScope, artifactSessionId: String) {
        val dir = scopeDirectory(scope)
        val safeId = artifactSessionId.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        File(dir, "$safeId.json").delete()
        if (dir.listFiles().isNullOrEmpty()) dir.delete()
    }

    override fun usageBytes(scope: AccountWorkspaceScope): Long = scopeDirectory(scope)
        .listFiles()
        ?.filter { it.isFile }
        ?.sumOf { it.length() }
        ?: 0L

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
        val properties = Properties().apply {
            setProperty("artifactSessionId", metadata.artifactSessionId)
            setProperty("contentDigest", metadata.contentDigest)
            setProperty("byteLength", metadata.byteLength.toString())
            setProperty("iv", Base64.getEncoder().encodeToString(payload.iv))
            setProperty("ciphertext", Base64.getEncoder().encodeToString(payload.ciphertext))
        }
        // Commit ciphertext and manifest atomically. Room is only updated by the caller after
        // this method returns, so a process death cannot expose a READY item without a durable
        // encrypted envelope. fsync is intentionally applied before the rename.
        val temporary = File(dir, "$safeId.json.tmp")
        FileOutputStream(temporary).use { output ->
            properties.store(output, null)
            output.fd.sync()
        }
        check(temporary.renameTo(file)) { "unable to commit receipt staging envelope" }
    }

    private data class Envelope(val metadata: ReceiptStagingMetadata, val payload: EncryptedPayload)

    private fun readEnvelope(dir: File, artifactSessionId: String): Envelope? {
        if (!dir.exists()) return null
        val safeId = artifactSessionId.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val file = File(dir, "$safeId.json")
        if (!file.isFile) return null
        return runCatching {
            val envelope = Properties().also { properties ->
                file.inputStream().use(properties::load)
            }
            Envelope(
                metadata =
                    ReceiptStagingMetadata(
                        artifactSessionId = envelope.getProperty("artifactSessionId"),
                        contentDigest = envelope.getProperty("contentDigest"),
                        byteLength = envelope.getProperty("byteLength").toInt(),
                    ),
                payload =
                    EncryptedPayload(
                        iv = Base64.getDecoder().decode(envelope.getProperty("iv")),
                        ciphertext = Base64.getDecoder().decode(envelope.getProperty("ciphertext")),
                    ),
            )
        }.getOrNull()
    }

    companion object {
        private val SHA256_DIGEST = Regex("sha256:[0-9a-fA-F]{64}")
    }
}
