package com.databreeze.android.network

import com.databreeze.android.R

/** Maps bounded transport/domain codes to localized recovery copy at the presentation edge. */
object AndroidErrorMapper {
    fun messageResource(code: String): Int = when (code.uppercase()) {
        "NETWORK_UNAVAILABLE", "TIMEOUT", "NETWORK_RETRYABLE", "EVIDENCE_RETRYABLE" -> R.string.network_unavailable
        "SESSION_EXPIRED", "SESSION_INVALID", "CREDENTIALS_REJECTED" -> R.string.session_expired
        "DEVICE_REVOKED", "SYNC_SCOPE_REVOKED", "DEVICE_ENROLLMENT_AUTH_DENIED" -> R.string.device_revoked
        "ACCESS_DENIED", "FORBIDDEN", "APPROVAL_AUTH_DENIED" -> R.string.access_denied
        "CONFLICT", "REVISION_CONFLICT", "SUBJECT_CHANGED" -> R.string.conflict_requires_review
        "STORAGE_LOW", "STORAGE_FULL" -> R.string.storage_low
        "SOURCE_OFFLINE" -> R.string.source_offline
        "UNSUPPORTED_CONTENT", "INVALID_CONTENT" -> R.string.unsupported_content
        else -> R.string.request_failed
    }

    fun isRetryable(code: String): Boolean = code.uppercase() in setOf(
        "NETWORK_UNAVAILABLE", "TIMEOUT", "NETWORK_RETRYABLE", "EVIDENCE_RETRYABLE",
    )
}
