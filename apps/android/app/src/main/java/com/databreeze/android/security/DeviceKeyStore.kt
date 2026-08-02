package com.databreeze.android.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val safeAlias = Regex("[a-z][a-z0-9._-]{0,63}")

data class DeviceKeyHandle(val alias: String) {
    init {
        require(safeAlias.matches(alias)) { "device key alias is invalid" }
    }
}

interface DeviceKeyStore {
    fun getOrCreate(alias: String): DeviceKeyHandle
    fun contains(alias: String): Boolean
    fun delete(alias: String): Boolean
    fun keyFor(handle: DeviceKeyHandle): SecretKey
}

class AndroidDeviceKeyStore : DeviceKeyStore {
    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    override fun getOrCreate(alias: String): DeviceKeyHandle {
        validateAlias(alias)
        if (!contains(alias)) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setUserAuthenticationRequired(false)
                    .build(),
            )
            generator.generateKey()
        }
        return DeviceKeyHandle(alias)
    }

    override fun contains(alias: String): Boolean =
        safeAlias.matches(alias) && keyStore.containsAlias(alias)

    override fun delete(alias: String): Boolean {
        validateAlias(alias)
        if (!keyStore.containsAlias(alias)) return false
        keyStore.deleteEntry(alias)
        return true
    }

    override fun keyFor(handle: DeviceKeyHandle): SecretKey =
        (keyStore.getKey(handle.alias, null) as? SecretKey)
            ?: error("device key is unavailable")

    companion object {
        fun validateAlias(alias: String) {
            require(safeAlias.matches(alias)) {
                "device key alias must start with a letter and contain only bounded safe characters"
            }
        }
    }
}

data class EncryptedPayload(val iv: ByteArray, val ciphertext: ByteArray) {
    init {
        require(iv.size == 12) { "GCM IV must be 96 bits" }
        require(ciphertext.isNotEmpty()) { "ciphertext cannot be empty" }
    }
}

/** Encrypts local sensitive fields; callers persist only this envelope, never plaintext. */
class DevicePayloadCipher(private val keyStore: DeviceKeyStore) {
    private val random = SecureRandom()

    fun encrypt(handle: DeviceKeyHandle, plaintext: ByteArray): EncryptedPayload {
        require(plaintext.isNotEmpty()) { "plaintext cannot be empty" }
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, keyStore.keyFor(handle), GCMParameterSpec(128, iv))
        return EncryptedPayload(iv, cipher.doFinal(plaintext))
    }

    fun decrypt(handle: DeviceKeyHandle, payload: EncryptedPayload): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, keyStore.keyFor(handle), GCMParameterSpec(128, payload.iv))
        return cipher.doFinal(payload.ciphertext)
    }
}
