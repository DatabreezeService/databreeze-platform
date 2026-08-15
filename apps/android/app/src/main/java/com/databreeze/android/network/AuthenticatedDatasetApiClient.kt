package com.databreeze.android.network

import com.databreeze.android.datasets.DatasetOption
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

sealed interface DatasetApiResult {
    data class Ready(val options: List<DatasetOption>) : DatasetApiResult
    data class Rejected(val code: String) : DatasetApiResult
    data object Retryable : DatasetApiResult
}

/** Reads the server-owned published dataset index; the APK never ships dataset IDs. */
class AuthenticatedDatasetApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()

    suspend fun list(): DatasetApiResult = when (
        val response = transport.execute(AuthenticatedHttpRequest("GET", "/v1/datasets"))
    ) {
        is AuthenticatedHttpResult.Success -> runCatching {
            val root = mapper.readTree(response.body)
            val rows = root.get("value")?.get("datasets")
            if (rows == null || !rows.isArray || rows.size() > 100) {
                return@runCatching DatasetApiResult.Rejected("dataset_response_invalid")
            }
            val options = rows.mapNotNull { row ->
                val datasetId = row.get("datasetId")?.takeIf { it.isTextual }?.textValue()
                val label = row.get("label")?.takeIf { it.isTextual }?.textValue()
                val health = row.get("health")?.takeIf { it.isTextual }?.textValue()
                val versionId = row.get("datasetVersionId")?.takeIf { it.isTextual }?.textValue()
                    ?: row.get("versionId")?.takeIf { it.isTextual }?.textValue()
                if (datasetId.isNullOrBlank() || label.isNullOrBlank() || health.isNullOrBlank()) null
                else DatasetOption(datasetId, label, health, versionId.orEmpty())
            }
            if (options.size != rows.size()) DatasetApiResult.Rejected("dataset_response_invalid")
            else DatasetApiResult.Ready(options)
        }.getOrElse { DatasetApiResult.Rejected("dataset_response_invalid") }
        is AuthenticatedHttpResult.TerminalAuthFailure -> DatasetApiResult.Rejected("dataset_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure,
        is AuthenticatedHttpResult.NetworkFailure,
        -> DatasetApiResult.Retryable
    }
}
