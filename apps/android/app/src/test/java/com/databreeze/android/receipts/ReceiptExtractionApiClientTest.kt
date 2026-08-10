package com.databreeze.android.receipts

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** DDA-041: authenticated extraction/review loop against a fake local HTTP transport. */
class ReceiptExtractionApiClientTest {
    @Test
    fun request_extraction_uses_v2_wire_envelope_and_reads_candidate() = runBlocking {
        val transport = FakeTransport()
        val client =
            ReceiptExtractionApiClient(
                transport = transport,
                organizationId = "00000000-0000-4000-8000-000000000001",
                workspaceId = "00000000-0000-4000-8000-000000000002",
                nowIso = { "2026-08-11T00:00:00.000Z" },
            )

        val requested =
            client.requestExtraction(
                ReceiptExtractionRequest(
                    artifactVersionId = "00000000-0000-4000-8000-0000000000a1",
                    profileVersionId = "00000000-0000-4000-8000-0000000000a2",
                    correlationId = "00000000-0000-4000-8000-0000000000a3",
                    idempotencyKey = "receipt-extract-01SYNTHETICKEY0001",
                    revision = 1,
                ),
            )
        assertEquals(ReceiptExtractionApiResult.Accepted("00000000-0000-4000-8000-0000000000c1"), requested)
        assertTrue(transport.bodies.any { it.contains("\"schemaVersion\":2") })
        assertTrue(transport.bodies.any { it.contains("\"operation\":\"REQUEST_EXTRACTION\"") })

        val candidate =
            client.readCandidate(
                candidateId = "00000000-0000-4000-8000-0000000000c1",
                idempotencyKey = "receipt-extract-01SYNTHETICKEY0002",
                revision = 1,
            )
        assertTrue(candidate is ReceiptCandidateReadResult.Ready)
        val ready = candidate as ReceiptCandidateReadResult.Ready
        assertEquals("00000000-0000-4000-8000-0000000000c1", ready.candidateId)
        assertEquals(1, ready.fields.size)
        assertEquals("merchant", ready.fields[0].field)
    }

    @Test
    fun provider_failure_keeps_manual_correction_path_without_fabricating_fields() = runBlocking {
        val transport =
            FakeTransport(
                extractionResult =
                    AuthenticatedHttpResult.Success(
                        200,
                        """{"status":"provider_unavailable","code":"server_ocr_unavailable"}""",
                    ),
            )
        val client =
            ReceiptExtractionApiClient(
                transport = transport,
                organizationId = "00000000-0000-4000-8000-000000000001",
                workspaceId = "00000000-0000-4000-8000-000000000002",
                nowIso = { "2026-08-11T00:00:00.000Z" },
            )

        val result =
            client.requestExtraction(
                ReceiptExtractionRequest(
                    artifactVersionId = "00000000-0000-4000-8000-0000000000a1",
                    profileVersionId = "00000000-0000-4000-8000-0000000000a2",
                    correlationId = "00000000-0000-4000-8000-0000000000a3",
                    idempotencyKey = "receipt-extract-01SYNTHETICKEY0003",
                    revision = 1,
                ),
            )
        assertEquals(ReceiptExtractionApiResult.Unavailable("server_ocr_unavailable"), result)
    }

    @Test
    fun correction_creates_new_candidate_version_via_v2_envelope() = runBlocking {
        val transport = FakeTransport()
        val client =
            ReceiptExtractionApiClient(
                transport = transport,
                organizationId = "00000000-0000-4000-8000-000000000001",
                workspaceId = "00000000-0000-4000-8000-000000000002",
                nowIso = { "2026-08-11T00:00:00.000Z" },
            )

        val result =
            client.correctCandidate(
                ReceiptCandidateCorrection(
                    priorCandidateId = "00000000-0000-4000-8000-0000000000c1",
                    fields = listOf(ReceiptFieldCandidate("merchant", "Cafe Synthetic", 100, null)),
                    idempotencyKey = "receipt-extract-01SYNTHETICKEY0004",
                    revision = 2,
                ),
            )
        assertEquals(
            ReceiptExtractionApiResult.Accepted("00000000-0000-4000-8000-0000000000c2"),
            result,
        )
        assertTrue(transport.bodies.any { it.contains("\"operation\":\"CORRECT_CANDIDATE\"") })
    }

    private class FakeTransport(
        private val extractionResult: AuthenticatedHttpResult =
            AuthenticatedHttpResult.Success(
                200,
                """{"candidateId":"00000000-0000-4000-8000-0000000000c1","status":"ready"}""",
            ),
    ) : AuthenticatedApiTransport {
        val bodies = mutableListOf<String>()

        override suspend fun execute(request: AuthenticatedHttpRequest): AuthenticatedHttpResult {
            request.jsonBody?.let { bodies += it }
            return when {
                request.path.endsWith("/extraction") -> extractionResult
                request.path.contains("/receipt-candidates/") &&
                    request.path.endsWith("/corrections") ->
                    AuthenticatedHttpResult.Success(
                        200,
                        """{"candidateId":"00000000-0000-4000-8000-0000000000c2","status":"ready"}""",
                    )
                request.path.contains("/receipt-candidates/") && request.method == "GET" ->
                    AuthenticatedHttpResult.Success(
                        200,
                        """{"candidateId":"00000000-0000-4000-8000-0000000000c1","adapterVersion":"synthetic-1","fields":[{"field":"merchant","value":"Cafe","confidence":72,"evidenceCropId":"crop-1"}]}""",
                    )
                else -> AuthenticatedHttpResult.RetryableFailure(500)
            }
        }
    }
}
