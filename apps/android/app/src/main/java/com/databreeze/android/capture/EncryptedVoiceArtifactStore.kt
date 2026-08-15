package com.databreeze.android.capture

import android.content.Context
import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import java.io.File
import java.security.MessageDigest
import java.util.UUID

data class VoiceArtifactVersion(val versionId: String, val contentDigest: String, val byteSize: Int, val file: File)

/** App-private encrypted audio staging. Raw audio never enters logs or shared storage. */
class EncryptedVoiceArtifactStore(private val context: Context, private val keyStore: DeviceKeyStore, private val keyHandle: DeviceKeyHandle) {
    fun stage(rawAudio: ByteArray): VoiceArtifactVersion {
        require(rawAudio.isNotEmpty() && rawAudio.size <= 20 * 1024 * 1024) { "voice_artifact_invalid" }
        val versionId = UUID.randomUUID().toString()
        val encrypted = DevicePayloadCipher(keyStore).encrypt(keyHandle, rawAudio)
        val directory = File(context.filesDir, "voice-artifacts").apply { mkdirs() }
        val file = File(directory, "$versionId.bin")
        file.outputStream().use { it.write(encrypted.iv); it.write(encrypted.ciphertext) }
        val digest = MessageDigest.getInstance("SHA-256").digest(rawAudio).joinToString("") { "%02x".format(it) }
        return VoiceArtifactVersion(versionId, digest, rawAudio.size, file)
    }
}
