package com.databreeze.android.capture

import android.content.Context
import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import com.databreeze.android.storage.AccountWorkspaceScope
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID

data class VoiceArtifactVersion(val versionId: String, val contentDigest: String, val byteSize: Int, val file: File)

/** App-private encrypted audio staging. Raw audio never enters logs or shared storage. */
class EncryptedVoiceArtifactStore(private val context: Context, private val keyStore: DeviceKeyStore, private val keyHandle: DeviceKeyHandle) {
    fun stage(rawAudio: ByteArray, scope: AccountWorkspaceScope? = null): VoiceArtifactVersion {
        require(rawAudio.isNotEmpty() && rawAudio.size <= 20 * 1024 * 1024) { "voice_artifact_invalid" }
        val versionId = UUID.randomUUID().toString()
        val encrypted = DevicePayloadCipher(keyStore).encrypt(keyHandle, rawAudio)
        val directory = scopedDirectory(scope).apply { mkdirs() }
        val file = File(directory, "$versionId.bin")
        val temporary = File(directory, "$versionId.bin.tmp")
        FileOutputStream(temporary).use { output ->
            output.write(encrypted.iv)
            output.write(encrypted.ciphertext)
            output.fd.sync()
        }
        check(temporary.renameTo(file)) { "voice_artifact_commit_failed" }
        val digest = MessageDigest.getInstance("SHA-256").digest(rawAudio).joinToString("") { "%02x".format(it) }
        return VoiceArtifactVersion(versionId, digest, rawAudio.size, file)
    }

    fun clear(scope: AccountWorkspaceScope) {
        val directory = scopedDirectory(scope)
        directory.listFiles()?.forEach { it.delete() }
        directory.delete()
    }

    private fun scopedDirectory(scope: AccountWorkspaceScope?): File {
        val root = File(context.filesDir, "voice-artifacts")
        return File(root, scope?.stableKey ?: "unscoped")
    }
}
