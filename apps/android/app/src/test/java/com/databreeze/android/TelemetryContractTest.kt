package com.databreeze.android

import com.databreeze.android.telemetry.CorrelationContext
import com.databreeze.android.telemetry.TelemetryContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
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

    @Test
    fun providerBackedMapsFailClosedWithoutLeakingTheirCause() {
        val hostileAttributes = object : Map<String, Any?> by emptyMap() {
            override val entries: Set<Map.Entry<String, Any?>>
                get() = throw IllegalStateException("provider attribute cause")
        }
        assertEquals(emptyMap<String, Any>(), TelemetryContract.sanitizeAttributes(hostileAttributes))
        val attributeError = assertThrows(IllegalArgumentException::class.java) {
            TelemetryContract.assertSafeAttributes(hostileAttributes)
        }
        assertEquals("telemetry attributes are not readable", attributeError.message)
        assertTrue(attributeError.cause == null)

        val hostileHeaders = object : Map<String, List<String>> by emptyMap() {
            override val entries: Set<Map.Entry<String, List<String>>>
                get() = throw IllegalStateException("provider header cause")
        }
        val headerError = assertThrows(IllegalArgumentException::class.java) {
            TelemetryContract.correlationFromHeaders(hostileHeaders)
        }
        assertTrue(headerError.message.orEmpty().contains("not readable"))
        assertTrue(!headerError.message.orEmpty().contains("provider header cause"))
        assertTrue(headerError.cause == null)
    }

    @Test
    fun recordRequiresAndNormalizesAnAbsoluteTimestamp() {
        val normalized = TelemetryContract.createRecord(
            "info",
            "sync.completed",
            "android",
            CorrelationContext(correlationId),
            timestamp = "2026-01-01T07:00:00+07:00",
        )
        assertEquals("2026-01-01T00:00:00Z", normalized.timestamp)

        val error = assertThrows(IllegalArgumentException::class.java) {
            TelemetryContract.createRecord(
                "info",
                "sync.completed",
                "android",
                CorrelationContext(correlationId),
                timestamp = "tomorrow in a provider timezone",
            )
        }
        assertEquals("invalid telemetry timestamp", error.message)
    }
}
