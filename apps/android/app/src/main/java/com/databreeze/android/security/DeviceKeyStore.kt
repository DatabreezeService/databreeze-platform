package com.databreeze.android.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

data class DeviceKeyHandle(val alias: String)

interface DeviceKeyStore {
    fun getOrCreate(alias: String): DeviceKeyHandle
    fun contains(alias: String): Boolean
}

class AndroidDeviceKeyStore : DeviceKeyStore {
    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    override fun getOrCreate(alias: String): DeviceKeyHandle {
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

    override fun contains(alias: String): Boolean = keyStore.containsAlias(alias)

    fun keyFor(handle: DeviceKeyHandle): SecretKey =
        (keyStore.getKey(handle.alias, null) as? SecretKey)
            ?: error("device key is unavailable")
}
