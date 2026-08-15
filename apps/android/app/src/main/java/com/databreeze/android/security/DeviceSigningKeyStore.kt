package com.databreeze.android.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.util.Base64

data class DeviceSigningKeyHandle(val alias: String)

/** Non-exportable Ed25519 identity key. There is deliberately no software-key fallback. */
class AndroidDeviceSigningKeyStore {
    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun getOrCreate(alias: String): DeviceSigningKeyHandle {
        validateAlias(alias)
        if (!keyStore.containsAlias(alias)) {
            val generator = KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")
            generator.initialize(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                    .setUserAuthenticationRequired(false)
                    .build(),
            )
            generator.generateKeyPair()
        }
        return DeviceSigningKeyHandle(alias)
    }

    fun publicKeyBase64(handle: DeviceSigningKeyHandle): String =
        Base64.getEncoder().encodeToString(keyStore.getCertificate(handle.alias).publicKey.encoded)

    fun sign(handle: DeviceSigningKeyHandle, payload: ByteArray): String {
        val privateKey = keyStore.getKey(handle.alias, null) as? PrivateKey
            ?: error("device signing key unavailable")
        val signature = Signature.getInstance("Ed25519")
        signature.initSign(privateKey)
        signature.update(payload)
        return Base64.getEncoder().encodeToString(signature.sign())
    }

    fun delete(alias: String): Boolean {
        validateAlias(alias)
        if (!keyStore.containsAlias(alias)) return false
        keyStore.deleteEntry(alias)
        return true
    }

    private fun validateAlias(alias: String) {
        require(ALIAS.matches(alias)) { "device signing key alias invalid" }
    }

    private companion object {
        val ALIAS = Regex("[a-z][a-z0-9._-]{0,63}")
    }
}
