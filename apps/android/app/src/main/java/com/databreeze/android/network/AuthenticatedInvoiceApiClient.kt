package com.databreeze.android.network

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.util.Base64

data class InvoiceTableResult(val headers: List<String>, val rows: List<List<String>>)
sealed interface InvoiceApiResult<out T> { data class Ready<T>(val value: T) : InvoiceApiResult<T>; data class Rejected(val code: String) : InvoiceApiResult<Nothing>; data object Retryable : InvoiceApiResult<Nothing> }

/** Uses the server-owned invoice/table extraction contract; no local OCR or fabricated totals. */
class AuthenticatedInvoiceApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()
    suspend fun extract(bytes: ByteArray, mimeType: String, widthPx: Int, heightPx: Int, pageCount: Int): InvoiceApiResult<InvoiceTableResult> {
        if (bytes.isEmpty() || bytes.size > 20 * 1024 * 1024 || widthPx < 1 || heightPx < 1 || pageCount < 1) return InvoiceApiResult.Rejected("invoice_input_invalid")
        val body = mapper.writeValueAsString(mapOf("mimeType" to mimeType, "bytesBase64" to Base64.getEncoder().encodeToString(bytes), "widthPx" to widthPx, "heightPx" to heightPx, "pageCount" to pageCount))
        return when (val response = transport.execute(AuthenticatedHttpRequest("POST", "/v1/dda/invoice-extractions", body))) {
            is AuthenticatedHttpResult.Success -> runCatching {
                val root = mapper.readTree(response.body); val value = root.get("value") ?: root
                val headers = value.get("headers")?.mapNotNull { it.textValue() } ?: emptyList()
                val rows = value.get("rows")?.map { row -> row.mapNotNull { it.textValue() } } ?: emptyList()
                InvoiceApiResult.Ready(InvoiceTableResult(headers.take(256), rows.take(10_000).map { it.take(256) }))
            }.getOrElse { InvoiceApiResult.Rejected("invoice_response_invalid") }
            is AuthenticatedHttpResult.TerminalAuthFailure -> InvoiceApiResult.Rejected("invoice_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure, is AuthenticatedHttpResult.NetworkFailure -> InvoiceApiResult.Retryable
        }
    }
}
