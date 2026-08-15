package com.databreeze.android.sync

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.security.DeviceKeyStore
import com.databreeze.android.security.DevicePayloadCipher
import java.util.Base64

/**
 * Digest-only Strict-Local package boundary (AND-008/AND-023). The manifest contains no source
 * content, paths, URLs, or credentials. A package is issued by the server and is never treated as
 * proof that bytes were synchronized.
 */
class StrictLocalPackageExporter(
    private val transport: AuthenticatedApiTransport,
    private val organizationId: String,
    private val workspaceId: String,
    private val deviceId: String,
    private val now: () -> Instant = { Instant.now() },
) {
    data class Manifest(
        val packageId: String,
        val purpose: String,
        val destinationClass: String,
        val itemDigests: List<String>,
        val packageDigest: String,
        val issuedAt: String,
        val expiresAt: String,
    )

    sealed interface Result {
        data class Issued(val manifest: Manifest, val serverValue: String) : Result
        data class Rejected(val code: String) : Result
        data object Retryable : Result
    }

    data class EncryptedPackage(val bytes: ByteArray, val packageDigest: String, val itemDigests: List<String>)

    /** Builds the actual encrypted offline hand-off. It never POSTs bytes to cloud and only
     * accepts bounded opaque records supplied by the caller (no filesystem paths). */
    fun exportEncryptedPackage(
        keyStore: DeviceKeyStore,
        keyHandle: DeviceKeyHandle,
        records: List<ByteArray>,
    ): EncryptedPackage {
        require(records.isNotEmpty() && records.size <= 64) { "strict-local records are bounded" }
        require(records.all { it.isNotEmpty() && it.size <= 20 * 1024 * 1024 }) { "strict-local record too large" }
        val itemDigests = records.map { sha256(it) }
        val plain = mapper.writeValueAsString(mapOf("schemaVersion" to 1, "items" to records.map { Base64.getEncoder().encodeToString(it) })).toByteArray(Charsets.UTF_8)
        val encrypted = DevicePayloadCipher(keyStore).encrypt(keyHandle, plain)
        val envelope = mapper.writeValueAsBytes(mapOf("schemaVersion" to 1, "iv" to Base64.getEncoder().encodeToString(encrypted.iv), "ciphertext" to Base64.getEncoder().encodeToString(encrypted.ciphertext), "itemDigests" to itemDigests))
        return EncryptedPackage(envelope, sha256(envelope), itemDigests)
    }

    fun importEncryptedPackage(keyStore: DeviceKeyStore, keyHandle: DeviceKeyHandle, envelope: ByteArray): List<ByteArray> {
        require(envelope.size in 1..64 * 1024 * 1024) { "strict-local package is bounded" }
        val root = mapper.readTree(envelope)
        val iv = Base64.getDecoder().decode(root.get("iv")?.textValue() ?: error("package_iv_missing"))
        val ciphertext = Base64.getDecoder().decode(root.get("ciphertext")?.textValue() ?: error("package_ciphertext_missing"))
        val plain = DevicePayloadCipher(keyStore).decrypt(keyHandle, com.databreeze.android.security.EncryptedPayload(iv, ciphertext))
        val items = mapper.readTree(plain).get("items") ?: error("package_items_missing")
        require(items.isArray && items.size() in 1..64) { "package_items_invalid" }
        return items.map { Base64.getDecoder().decode(it.textValue()) }
    }

    suspend fun issue(
        purpose: String,
        destinationClass: String,
        itemDigests: List<String>,
    ): Result {
        if (deviceId.isBlank() || purpose.isBlank() || destinationClass.isBlank())
            return Result.Rejected("strict_local_input_invalid")
        val normalized = itemDigests.distinct().sorted()
        if (normalized.isEmpty() || normalized.size > 64 || normalized.any { !DIGEST.matches(it) })
            return Result.Rejected("strict_local_digest_invalid")
        val issued = now()
        val expires = issued.plusSeconds(15 * 60)
        val packageId = UUID.randomUUID().toString()
        val digestInput = normalized.joinToString("\n") + "\u0000" + packageId + "\u0000" + destinationClass
        val packageDigest = sha256(digestInput.toByteArray(Charsets.UTF_8))
        val body = mapper.writeValueAsString(
            linkedMapOf(
                "packageId" to packageId,
                "deviceId" to deviceId,
                "tenantScope" to linkedMapOf(
                    "scopeType" to "workspace",
                    "organizationId" to organizationId,
                    "workspaceId" to workspaceId,
                ),
                "purpose" to purpose.take(200),
                "destinationClass" to destinationClass.take(64),
                "itemDigests" to normalized,
                "packageDigest" to packageDigest,
                "issuedAt" to issued.toString(),
                "expiresAt" to expires.toString(),
            ),
        )
        return when (val response = transport.execute(AuthenticatedHttpRequest("POST", "/v1/devices/sync/packages", body))) {
            is AuthenticatedHttpResult.Success -> {
                val value = runCatching { mapper.readTree(response.body).get("value") }.getOrNull()
                if (value == null) Result.Rejected("strict_local_response_invalid")
                else Result.Issued(
                    Manifest(packageId, purpose.take(200), destinationClass.take(64), normalized, packageDigest, issued.toString(), expires.toString()),
                    value.toString(),
                )
            }
            is AuthenticatedHttpResult.TerminalAuthFailure -> Result.Rejected("strict_local_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> Result.Retryable
        }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private companion object {
        val DIGEST = Regex("^[a-f0-9]{64,128}$")
        val mapper = jacksonObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    }
}
