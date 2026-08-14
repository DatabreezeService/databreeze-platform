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
    fun request_extraction_uses_server_scoped_receipt_route_and_reads_canonical_candidate() = runBlocking {
        val transport = FakeTransport()
        val client = ReceiptExtractionApiClient(transport)

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
        val extractionRequest = transport.requests.single()
        assertEquals("POST", extractionRequest.method)
        assertEquals("/v1/dda/receipts/extract", extractionRequest.path)
        assertTrue(extractionRequest.jsonBody!!.contains("\"profileKind\":\"receipt\""))
        assertTrue(!extractionRequest.jsonBody.contains("tenantScope"))
        assertTrue(!extractionRequest.jsonBody.contains("schemaVersion"))

        val candidate =
            client.readCandidate(
                candidateId = "00000000-0000-4000-8000-0000000000c1",
                idempotencyKey = "receipt-extract-01SYNTHETICKEY0002",
                revision = 1,
            )
        assertTrue(candidate is ReceiptCandidateReadResult.Ready)
        val ready = candidate as ReceiptCandidateReadResult.Ready
        assertEquals("00000000-0000-4000-8000-0000000000c1", ready.candidateId)
        assertEquals(2, ready.fields.size)
        assertEquals("merchant", ready.fields[0].field)
        assertEquals(
            "/v1/dda/receipts/candidates/00000000-0000-4000-8000-0000000000c1" +
                "?artifactVersionId=00000000-0000-4000-8000-0000000000a1",
            transport.requests.last().path,
        )
        assertEquals(null, transport.requests.last().jsonBody)
    }

    @Test
    fun provider_failure_is_retryable_without_fabricating_a_candidate() = runBlocking {
        val transport =
            FakeTransport(
                extractionResult = AuthenticatedHttpResult.RetryableFailure(503),
            )
        val client = ReceiptExtractionApiClient(transport)

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
        assertEquals(ReceiptExtractionApiResult.Retryable, result)
    }

    @Test
    fun candidate_response_outside_the_published_field_bounds_is_rejected() = runBlocking {
        val oversizedField = "f".repeat(65)
        val transport =
            FakeTransport(
                candidateOverride =
                    """{"schemaVersion":1,"candidateId":"00000000-0000-4000-8000-0000000000c1","tenantScope":{"scopeType":"workspace","organizationId":"00000000-0000-4000-8000-000000000001","workspaceId":"00000000-0000-4000-8000-000000000002"},"artifactVersionId":"00000000-0000-4000-8000-0000000000a1","profileVersionId":"00000000-0000-4000-8000-0000000000a2","fieldCandidates":[{"field":"$oversizedField","value":"Cafe","confidence":72}],"adapterVersion":"synthetic-1","evidenceReferenceId":"00000000-0000-4000-8000-0000000000e1","candidateHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}""",
            )
        val client = ReceiptExtractionApiClient(transport)

        val result =
            client.requestExtraction(
                ReceiptExtractionRequest(
                    artifactVersionId = "00000000-0000-4000-8000-0000000000a1",
                    profileVersionId = "00000000-0000-4000-8000-0000000000a2",
                    correlationId = "00000000-0000-4000-8000-0000000000a3",
                    idempotencyKey = "receipt-extract-01SYNTHETICKEY0006",
                    revision = 1,
                ),
            )

        assertEquals(ReceiptExtractionApiResult.Rejected("receipt_candidate_invalid"), result)
    }

    @Test
    fun correction_sends_only_changed_fields_to_the_server_authoritative_version() = runBlocking {
        val transport = FakeTransport()
        val client = ReceiptExtractionApiClient(transport)

        client.requestExtraction(
            ReceiptExtractionRequest(
                artifactVersionId = "00000000-0000-4000-8000-0000000000a1",
                profileVersionId = "00000000-0000-4000-8000-0000000000a2",
                correlationId = "00000000-0000-4000-8000-0000000000a3",
                idempotencyKey = "receipt-extract-01SYNTHETICKEY0005",
                revision = 1,
            ),
        )

        val result =
            client.correctCandidate(
                ReceiptCandidateCorrection(
                    priorCandidateId = "00000000-0000-4000-8000-0000000000c1",
                    fields =
                        listOf(
                            ReceiptFieldCandidate("merchant", "Cafe Synthetic", 100, null),
                            ReceiptFieldCandidate("total", "125000", 42, null),
                        ),
                    idempotencyKey = "receipt-extract-01SYNTHETICKEY0004",
                    revision = 2,
                ),
            )
        assertEquals(
            ReceiptExtractionApiResult.Accepted("00000000-0000-4000-8000-0000000000c2"),
            result,
        )
        val correctionRequest = transport.requests.last()
        assertEquals("/v1/dda/receipts/correct", correctionRequest.path)
        assertTrue(
            correctionRequest.jsonBody!!.contains(
                "\"fieldUpdates\":{\"merchant\":\"Cafe Synthetic\"}",
            ),
        )
        assertTrue(!correctionRequest.jsonBody.contains("\"total\""))
        assertTrue(!correctionRequest.jsonBody.contains("tenantScope"))
    }

    private class FakeTransport(
        private val extractionResult: AuthenticatedHttpResult =
            AuthenticatedHttpResult.Success(
                200,
                """{"candidateId":"00000000-0000-4000-8000-0000000000c1","status":"ready"}""",
            ),
        private val candidateOverride: String? = null,
    ) : AuthenticatedApiTransport {
        val requests = mutableListOf<AuthenticatedHttpRequest>()

        private val canonicalCandidate =
            """{"schemaVersion":1,"candidateId":"00000000-0000-4000-8000-0000000000c1","tenantScope":{"scopeType":"workspace","organizationId":"00000000-0000-4000-8000-000000000001","workspaceId":"00000000-0000-4000-8000-000000000002"},"artifactVersionId":"00000000-0000-4000-8000-0000000000a1","profileVersionId":"00000000-0000-4000-8000-0000000000a2","fieldCandidates":[{"field":"merchant","value":"Cafe","confidence":72},{"field":"total","value":"125000","confidence":42}],"adapterVersion":"synthetic-1","modelVersion":"synthetic-model-1","evidenceReferenceId":"00000000-0000-4000-8000-0000000000e1","candidateHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","treatedAsUntrustedData":true}"""

        override suspend fun execute(request: AuthenticatedHttpRequest): AuthenticatedHttpResult {
            requests += request
            val candidateBody = candidateOverride ?: canonicalCandidate
            return when {
                request.path == "/v1/dda/receipts/extract" ->
                    if (extractionResult is AuthenticatedHttpResult.Success) {
                        AuthenticatedHttpResult.Success(200, candidateBody)
                    } else {
                        extractionResult
                    }
                request.path == "/v1/dda/receipts/correct" ->
                    AuthenticatedHttpResult.Success(
                        200,
                        candidateBody.replace(
                            "00000000-0000-4000-8000-0000000000c1",
                            "00000000-0000-4000-8000-0000000000c2",
                        ).replace("\"Cafe\"", "\"Cafe Synthetic\""),
                    )
                request.path.startsWith("/v1/dda/receipts/candidates/") ->
                    AuthenticatedHttpResult.Success(200, candidateBody)
                else -> AuthenticatedHttpResult.RetryableFailure(500)
            }
        }
    }
}
