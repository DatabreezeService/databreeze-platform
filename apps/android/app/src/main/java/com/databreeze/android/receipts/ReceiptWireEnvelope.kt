package com.databreeze.android.receipts

/**
 * Builds content-safe JSON for the published contracts v2 `dda-receipt-upload` wire envelope.
 * Bytes and local paths are never included.
 */
internal object ReceiptWireEnvelope {
    fun createSession(
        organizationId: String,
        workspaceId: String,
        sessionId: String,
        artifactId: String,
        workspaceGrantId: String,
        expectedSha256: String,
        expectedByteSize: Long,
        idempotencyKey: String,
        revision: Long,
        issuedAt: String,
        expiresAt: String,
    ): String =
        envelope(
            operation = "CREATE_SESSION",
            organizationId = organizationId,
            workspaceId = workspaceId,
            idempotencyKey = idempotencyKey,
            revision = revision,
            extras =
                mapOf(
                    "sessionId" to sessionId,
                    "artifactId" to artifactId,
                    "workspaceGrantId" to workspaceGrantId,
                    "expectedSha256" to expectedSha256,
                    "expectedByteSize" to expectedByteSize,
                    "mediaType" to "image/jpeg",
                    "partSize" to expectedByteSize.coerceAtMost(5_242_880L),
                    "issuedAt" to issuedAt,
                    "expiresAt" to expiresAt,
                ),
        )

    fun issuePartTransfer(
        organizationId: String,
        workspaceId: String,
        sessionId: String,
        partNumber: Long,
        idempotencyKey: String,
        revision: Long,
    ): String =
        envelope(
            operation = "ISSUE_PART_TRANSFER",
            organizationId = organizationId,
            workspaceId = workspaceId,
            idempotencyKey = idempotencyKey,
            revision = revision,
            extras =
                mapOf(
                    "sessionId" to sessionId,
                    "partNumber" to partNumber,
                ),
        )

    fun recordPart(
        organizationId: String,
        workspaceId: String,
        sessionId: String,
        transferId: String,
        partNumber: Long,
        partSha256: String,
        partByteSize: Long,
        idempotencyKey: String,
        revision: Long,
    ): String =
        envelope(
            operation = "RECORD_PART",
            organizationId = organizationId,
            workspaceId = workspaceId,
            idempotencyKey = idempotencyKey,
            revision = revision,
            extras =
                mapOf(
                    "sessionId" to sessionId,
                    "transferId" to transferId,
                    "partNumber" to partNumber,
                    "partSha256" to partSha256,
                    "partByteSize" to partByteSize,
                ),
        )

    fun completeSession(
        organizationId: String,
        workspaceId: String,
        sessionId: String,
        expectedSha256: String,
        idempotencyKey: String,
        revision: Long,
    ): String =
        envelope(
            operation = "COMPLETE_SESSION",
            organizationId = organizationId,
            workspaceId = workspaceId,
            idempotencyKey = idempotencyKey,
            revision = revision,
            extras =
                mapOf(
                    "sessionId" to sessionId,
                    "expectedSha256" to expectedSha256,
                ),
        )

    fun requestExtraction(
        organizationId: String,
        workspaceId: String,
        artifactVersionId: String,
        profileVersionId: String,
        correlationId: String,
        idempotencyKey: String,
        revision: Long,
    ): String =
        envelope(
            operation = "REQUEST_EXTRACTION",
            organizationId = organizationId,
            workspaceId = workspaceId,
            idempotencyKey = idempotencyKey,
            revision = revision,
            extras =
                mapOf(
                    "artifactVersionId" to artifactVersionId,
                    "profileVersionId" to profileVersionId,
                    "correlationId" to correlationId,
                ),
        )

    fun readCandidate(
        organizationId: String,
        workspaceId: String,
        candidateId: String,
        idempotencyKey: String,
        revision: Long,
    ): String =
        envelope(
            operation = "READ_CANDIDATE",
            organizationId = organizationId,
            workspaceId = workspaceId,
            idempotencyKey = idempotencyKey,
            revision = revision,
            extras = mapOf("candidateId" to candidateId),
        )

    fun correctCandidate(
        organizationId: String,
        workspaceId: String,
        candidateId: String,
        idempotencyKey: String,
        revision: Long,
    ): String =
        envelope(
            operation = "CORRECT_CANDIDATE",
            organizationId = organizationId,
            workspaceId = workspaceId,
            idempotencyKey = idempotencyKey,
            revision = revision,
            extras = mapOf("candidateId" to candidateId),
        )

    fun acceptanceStatus(
        organizationId: String,
        workspaceId: String,
        candidateId: String,
        acceptanceState: String,
        idempotencyKey: String,
        revision: Long,
    ): String =
        envelope(
            operation = "ACCEPTANCE_STATUS",
            organizationId = organizationId,
            workspaceId = workspaceId,
            idempotencyKey = idempotencyKey,
            revision = revision,
            extras =
                mapOf(
                    "candidateId" to candidateId,
                    "acceptanceState" to acceptanceState,
                ),
        )

    private fun envelope(
        operation: String,
        organizationId: String,
        workspaceId: String,
        idempotencyKey: String,
        revision: Long,
        extras: Map<String, Any>,
    ): String {
        val fields = linkedMapOf<String, Any>(
            "schemaVersion" to 2,
            "operation" to operation,
            "tenantScope" to
                mapOf(
                    "scopeType" to "workspace",
                    "organizationId" to organizationId,
                    "workspaceId" to workspaceId,
                ),
            "idempotencyKey" to idempotencyKey,
            "revision" to revision,
        )
        fields.putAll(extras)
        return encodeObject(fields)
    }

    private fun encodeObject(value: Map<String, Any>): String =
        value.entries.joinToString(prefix = "{", postfix = "}") { (key, entry) ->
            "\"$key\":${encodeValue(entry)}"
        }

    private fun encodeValue(value: Any): String =
        when (value) {
            is String -> "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
            is Number, is Boolean -> value.toString()
            is Map<*, *> ->
                @Suppress("UNCHECKED_CAST")
                encodeObject(value as Map<String, Any>)
            else -> error("unsupported wire value ${value::class.java.name}")
        }
}
