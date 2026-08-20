package com.databreeze.android.network

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

/** Content-safe evidence reference. Source bytes and document paths never cross this boundary. */
data class ArtifactEvidenceSummary(
    val id: String,
    val kind: String,
    val locator: String,
)

sealed interface ArtifactApiResult<out TValue> {
    data class Ready<TValue>(val value: TValue) : ArtifactApiResult<TValue>
    data class Rejected(val code: String) : ArtifactApiResult<Nothing>
    data object Retryable : ArtifactApiResult<Nothing>
}

/** Reads immutable artifact/evidence metadata; authorization is re-evaluated by IAE on every call. */
class AuthenticatedArtifactApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()

    suspend fun evidence(versionId: String): ArtifactApiResult<List<ArtifactEvidenceSummary>> {
        if (!isOpaqueId(versionId)) return ArtifactApiResult.Rejected("artifact_version_invalid")
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest("GET", "/v1/artifact-versions/$versionId/evidence"),
            )
        ) {
            is AuthenticatedHttpResult.Success -> parseEvidence(response.body)
            is AuthenticatedHttpResult.TerminalAuthFailure -> ArtifactApiResult.Rejected("artifact_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ArtifactApiResult.Retryable
        }
    }

    suspend fun resolveEvidence(versionId: String, evidenceId: String): ArtifactApiResult<String> {
        if (!isOpaqueId(versionId) || !isOpaqueId(evidenceId)) {
            return ArtifactApiResult.Rejected("evidence_identifier_invalid")
        }
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest(
                    "GET",
                    "/v1/artifact-versions/$versionId/evidence/$evidenceId/resolve",
                ),
            )
        ) {
            is AuthenticatedHttpResult.Success -> {
                val node = runCatching { mapper.readTree(response.body) }.getOrNull()
                val accepted = node?.get("accepted")?.booleanValue() == true
                val value = node?.get("value")
                val summary = if (accepted && value != null) {
                    value.get("reference")?.textValue()
                        ?: value.get("locator")?.textValue()
                        ?: value.get("route")?.textValue()
                } else null
                if (summary.isNullOrBlank() || summary.length > 512) {
                    ArtifactApiResult.Rejected("evidence_resolution_invalid")
                } else ArtifactApiResult.Ready(summary)
            }
            is AuthenticatedHttpResult.TerminalAuthFailure -> ArtifactApiResult.Rejected("artifact_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ArtifactApiResult.Retryable
        }
    }

    private fun parseEvidence(body: String): ArtifactApiResult<List<ArtifactEvidenceSummary>> = runCatching {
        val root = mapper.readTree(body)
        if (root.get("accepted")?.booleanValue() != true) {
            return@runCatching ArtifactApiResult.Rejected("evidence_not_available")
        }
        val rows = root.get("value")
        if (rows == null || !rows.isArray || rows.size() > 100) {
            return@runCatching ArtifactApiResult.Rejected("evidence_response_invalid")
        }
        val result = rows.mapNotNull { row ->
            val id = row.get("evidenceId")?.textValue() ?: row.get("id")?.textValue()
            val kind = row.get("kind")?.textValue() ?: row.get("type")?.textValue()
            val locator = row.get("reference")?.textValue()
                ?: row.get("locator")?.textValue()
                ?: row.get("description")?.textValue()
            if (id.isNullOrBlank() || kind.isNullOrBlank() || locator.isNullOrBlank()) null
            else ArtifactEvidenceSummary(id.take(128), kind.take(64), locator.take(512))
        }
        if (result.size != rows.size()) ArtifactApiResult.Rejected("evidence_response_invalid")
        else ArtifactApiResult.Ready(result)
    }.getOrElse { ArtifactApiResult.Rejected("evidence_response_invalid") }

    private fun isOpaqueId(value: String): Boolean =
        value.length in 1..128 && value.matches(Regex("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))
}
