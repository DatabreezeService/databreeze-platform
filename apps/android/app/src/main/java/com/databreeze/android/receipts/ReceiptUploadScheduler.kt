package com.databreeze.android.receipts

import com.databreeze.android.storage.AccountWorkspaceScope
import java.security.MessageDigest

/** Hybrid/Cloud destinations only — Strict-Local cannot claim cloud OCR upload. */
sealed interface ReceiptDestination {
    data class Hybrid(val workspaceGrantId: String) : ReceiptDestination {
        init {
            require(workspaceGrantId.isNotBlank() && workspaceGrantId.length <= 128)
        }
    }

    data class Cloud(val workspaceGrantId: String) : ReceiptDestination {
        init {
            require(workspaceGrantId.isNotBlank() && workspaceGrantId.length <= 128)
        }
    }

    data object StrictLocal : ReceiptDestination
}

enum class ReceiptUploadDenyReason {
    MISSING_DESTINATION,
    STRICT_LOCAL_DESTINATION,
    SCOPE_REVOKED,
    DUPLICATE_SCHEDULE,
}

enum class ReceiptCaptureDenyReason {
    CAMERA_PERMISSION_MISSING,
    MISSING_DESTINATION,
    STRICT_LOCAL_DESTINATION,
    SCOPE_UNAUTHORIZED,
}

enum class ExistingWorkPolicyKind {
    KEEP,
}

data class ReceiptUploadRequest(
    val scope: AccountWorkspaceScope,
    val artifactSessionId: String,
    val contentDigest: String,
    val destination: ReceiptDestination?,
    val uploadedBytes: Long,
    val totalBytes: Long,
    val policy: ReceiptTransferPolicy = ReceiptTransferPolicy(),
) {
    init {
        require(artifactSessionId.matches(SAFE_ID)) { "artifactSessionId must be opaque" }
        require(contentDigest.matches(SHA256_DIGEST)) { "contentDigest must be sha256" }
        require(uploadedBytes >= 0L) { "uploadedBytes cannot be negative" }
        require(totalBytes > 0L) { "totalBytes must be positive" }
        require(uploadedBytes <= totalBytes) { "uploadedBytes cannot exceed totalBytes" }
    }

    companion object {
        private val SAFE_ID = Regex("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
        private val SHA256_DIGEST = Regex("sha256:[0-9a-fA-F]{64}")
    }
}

/** Explicit transfer policy, persisted with WorkManager input and never inferred from network. */
data class ReceiptTransferPolicy(
    val wifiOnly: Boolean = false,
    val requiresCharging: Boolean = false,
)

data class ReceiptUploadScheduleResult(
    val accepted: Boolean,
    val denyReason: ReceiptUploadDenyReason? = null,
)

data class ReceiptUploadProgress(
    val artifactSessionId: String,
    val uploadedBytes: Long,
    val totalBytes: Long,
) {
    init {
        require(artifactSessionId.isNotBlank())
        require(uploadedBytes >= 0L)
        require(totalBytes > 0L)
        require(uploadedBytes <= totalBytes)
    }

    val resumeFromByte: Long get() = uploadedBytes
    val isComplete: Boolean get() = uploadedBytes == totalBytes
}

class ReceiptCaptureGate {
    fun evaluate(
        cameraPermissionGranted: Boolean,
        destination: ReceiptDestination?,
        scopeAuthorized: Boolean,
    ): ReceiptCaptureDenyReason? {
        if (!cameraPermissionGranted) return ReceiptCaptureDenyReason.CAMERA_PERMISSION_MISSING
        if (destination == null) return ReceiptCaptureDenyReason.MISSING_DESTINATION
        if (destination is ReceiptDestination.StrictLocal) {
            return ReceiptCaptureDenyReason.STRICT_LOCAL_DESTINATION
        }
        if (!scopeAuthorized) return ReceiptCaptureDenyReason.SCOPE_UNAUTHORIZED
        return null
    }
}

interface ReceiptUploadScheduler {
    fun schedule(request: ReceiptUploadRequest): ReceiptUploadScheduleResult

    companion object {
        fun uniqueWorkName(scope: AccountWorkspaceScope, artifactSessionId: String): String {
            val digest = MessageDigest
                .getInstance("SHA-256")
                .digest("${scope.stableKey}\u0000$artifactSessionId".toByteArray(Charsets.UTF_8))
                .joinToString("") { byte -> "%02x".format(byte) }
            return "receipt-upload-$digest"
        }
    }
}

/** JVM-testable scheduler that records KEEP policy and enforces DDA-040 denial rules. */
class RecordingReceiptUploadScheduler(
    private val revoked: Set<String> = emptySet(),
) : ReceiptUploadScheduler {
    var lastPolicy: ExistingWorkPolicyKind? = null
        private set
    var enqueueCount: Int = 0
        private set
    private val scheduled = mutableSetOf<String>()

    override fun schedule(request: ReceiptUploadRequest): ReceiptUploadScheduleResult {
        when (request.destination) {
            null -> return ReceiptUploadScheduleResult(false, ReceiptUploadDenyReason.MISSING_DESTINATION)
            is ReceiptDestination.StrictLocal ->
                return ReceiptUploadScheduleResult(false, ReceiptUploadDenyReason.STRICT_LOCAL_DESTINATION)
            is ReceiptDestination.Hybrid, is ReceiptDestination.Cloud -> Unit
        }
        if (request.scope.stableKey in revoked) {
            return ReceiptUploadScheduleResult(false, ReceiptUploadDenyReason.SCOPE_REVOKED)
        }
        val workName = ReceiptUploadScheduler.uniqueWorkName(request.scope, request.artifactSessionId)
        lastPolicy = ExistingWorkPolicyKind.KEEP
        if (!scheduled.add(workName)) {
            return ReceiptUploadScheduleResult(false, ReceiptUploadDenyReason.DUPLICATE_SCHEDULE)
        }
        enqueueCount += 1
        return ReceiptUploadScheduleResult(true)
    }
}
