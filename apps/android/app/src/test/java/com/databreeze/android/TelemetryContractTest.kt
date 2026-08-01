package com.databreeze.android

import com.databreeze.android.telemetry.CorrelationContext
import com.databreeze.android.telemetry.TelemetryContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class TelemetryContractTest {
    private val correlationId = "00000000-0000-4000-8000-000000000001"

    @Test
    fun safeAttributeSetContainsEveryCanonicalKey() {
        assertEquals(
            setOf(
                "organizationId", "workspaceId", "projectId", "principalId", "deviceId",
                "jobId", "attemptId", "artifactId", "artifactVersionId", "datasetId",
                "datasetVersionId", "processorVersion", "protocolVersion", "route", "operation",
                "outcome", "status", "reasonCode", "errorCode", "providerCode", "mode", "dataClass",
                "durationMs", "queueDelayMs", "retryCount", "itemCount", "byteCount",
                "redactedCount", "sampled",
            ),
            TelemetryContract.SafeAttributeKeys,
        )
    }

    @Test
    fun sanitizerDropsSensitiveValuesAndKeepsOperationalMetadata() {
        assertEquals(
            mapOf("workspaceId" to "workspace-1", "status" to 200),
            TelemetryContract.sanitizeAttributes(
                mapOf(
                    "workspaceId" to "workspace-1",
                    "status" to 200,
                    "outcome" to "customer@example.com",
                    "path" to "C:\\Users\\someone\\source.xlsx",
                ),
            ),
        )
        assertThrows(IllegalArgumentException::class.java) {
            TelemetryContract.assertSafeAttributes(mapOf("outcome" to "invoice total 123"))
        }
    }

    @Test
    fun recordAndCorrelationHeadersCarryTraceContext() {
        val context = CorrelationContext(
            correlationId,
            "0123456789abcdef0123456789abcdef",
            "0123456789abcdef",
            "00",
        )
        val headers = TelemetryContract.correlationHeaders(context)
        assertEquals(
            context,
            TelemetryContract.correlationFromHeaders(
                headers.mapValues { listOf(it.value) },
            ),
        )
        val record = TelemetryContract.createRecord(
            "info",
            "request.completed",
            "android",
            context,
            mapOf("status" to 200),
            "2026-01-01T00:00:00Z",
        )
        assertEquals(context.traceId, record.traceId)
        assertEquals(mapOf("status" to 200), record.attributes)
        assertThrows(IllegalArgumentException::class.java) {
            TelemetryContract.correlationFromHeaders(
                mapOf(TelemetryContract.CorrelationHeader to listOf(correlationId, correlationId)),
            )
        }
    }
}
