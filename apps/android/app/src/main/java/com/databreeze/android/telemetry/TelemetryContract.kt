package com.databreeze.android.telemetry

import java.time.Instant
import java.time.format.DateTimeParseException

/** Cross-runtime names and safe record helpers shared with @databreeze/telemetry/v1. */
object TelemetryContract {
    const val SchemaVersion = 1
    const val CorrelationHeader = "x-correlation-id"
    const val TraceparentHeader = "traceparent"

    val SafeAttributeKeys = setOf(
        "organizationId", "workspaceId", "projectId", "principalId", "deviceId",
        "jobId", "attemptId", "artifactId", "artifactVersionId", "datasetId",
        "datasetVersionId", "processorVersion", "protocolVersion", "route", "operation",
        "outcome", "status", "reasonCode", "errorCode", "providerCode", "mode", "dataClass",
        "durationMs", "queueDelayMs", "retryCount", "itemCount", "byteCount",
        "redactedCount", "sampled",
    )

    private val identifierKeys = SafeAttributeKeys - setOf(
        "processorVersion", "protocolVersion", "route", "operation", "outcome", "status",
        "reasonCode", "errorCode", "providerCode", "mode", "dataClass", "durationMs",
        "queueDelayMs", "retryCount", "itemCount", "byteCount", "redactedCount", "sampled",
    )
    private val numericKeys = setOf(
        "durationMs", "queueDelayMs", "retryCount", "itemCount", "byteCount", "redactedCount",
    )
    private val tokenKeys = setOf(
        "processorVersion", "protocolVersion", "operation", "outcome", "reasonCode",
        "errorCode", "providerCode", "mode", "dataClass",
    )
    private val tokenPattern = Regex("^(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    private val routePattern = Regex("^/?[A-Za-z0-9._~/-]{1,255}$")
    private val unsafeStringPattern = Regex(
        "(?:[\\\\/]|^[a-z]:|://|[@]|\\.(?:xlsx?|csv|pdf|docx?|pptx?|png|jpe?g|gif|zip|json|xml|parquet|txt|log|db|sqlite|avro|orc)$)",
        RegexOption.IGNORE_CASE,
    )
    private val controlPattern = Regex("[\\u0000-\\u001f\\u007f]")
    private val correlationPattern = Regex(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        RegexOption.IGNORE_CASE,
    )
    private val tracePattern = Regex("^(?!0{32}$)[0-9a-f]{32}$", RegexOption.IGNORE_CASE)
    private val spanPattern = Regex("^(?!0{16}$)[0-9a-f]{16}$", RegexOption.IGNORE_CASE)
    private val flagsPattern = Regex("^[0-9a-f]{2}$", RegexOption.IGNORE_CASE)
    private val traceparentPattern = Regex(
        "^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$",
        RegexOption.IGNORE_CASE,
    )
    private val eventPattern = Regex("^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}$")
    private val componentPattern = Regex("^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,5}$")

    fun sanitizeAttributes(input: Map<String, Any?>): Map<String, Any> {
        val result = linkedMapOf<String, Any>()
        val entries = readAttributeEntries(input) ?: return emptyMap()
        entries.forEach { (key, value) ->
            require(key.matches(Regex("^[A-Za-z][A-Za-z0-9]{0,63}$"))) {
                "invalid telemetry key"
            }
            if (key !in SafeAttributeKeys) return@forEach
            val safe = safeScalar(key, value) ?: return@forEach
            result[key] = safe
        }
        return result
    }

    fun assertSafeAttributes(input: Map<String, Any?>) {
        val entries = readAttributeEntries(input)
            ?: throw IllegalArgumentException("telemetry attributes are not readable")
        entries.forEach { (key, value) ->
            require(key in SafeAttributeKeys && safeScalar(key, value) != null) {
                "telemetry attribute is not allowed: $key"
            }
        }
    }

    private fun readAttributeEntries(input: Map<String, Any?>): List<Pair<String, Any?>>? =
        try {
            input.entries.map { entry -> entry.key to entry.value }
        } catch (_: Exception) {
            null
        }

    private fun safeScalar(key: String, value: Any?): Any? {
        if (key == "sampled") return value as? Boolean
        if (key in numericKeys || key == "status") {
            val number = value as? Number ?: return null
            val numeric = number.toDouble()
            return if (numeric.isFinite() && kotlin.math.abs(numeric) <= 1e15) value else null
        }
        val text = value as? String ?: return null
        if (text.length > 256 || controlPattern.containsMatchIn(text) || unsafeStringPattern.containsMatchIn(text)) {
            return null
        }
        if (key == "route") return text.takeIf { routePattern.matches(it) }
        if (key !in identifierKeys && key !in tokenKeys) return null
        return text.takeIf { tokenPattern.matches(it) }
    }

    fun correlationHeaders(context: CorrelationContext): Map<String, String> {
        val normalized = createCorrelationContext(
            context.correlationId,
            context.traceId,
            context.spanId,
            context.traceFlags,
        )
        val headers = linkedMapOf(CorrelationHeader to normalized.correlationId)
        if (normalized.traceId != null && normalized.spanId != null) {
            headers[TraceparentHeader] =
                "00-${normalized.traceId}-${normalized.spanId}-${normalized.traceFlags ?: "01"}"
        }
        return headers
    }

    fun correlationFromHeaders(headers: Map<String, List<String>>): CorrelationContext {
        val correlation = singleHeader(headers, CorrelationHeader)
            ?: error("missing telemetry correlation ID")
        val traceparent = singleHeader(headers, TraceparentHeader)
            ?: return createCorrelationContext(correlation)
        val match = traceparentPattern.matchEntire(traceparent)
            ?: error("invalid telemetry traceparent")
        require(match.groupValues[1].lowercase() != "ff") { "invalid telemetry traceparent" }
        return createCorrelationContext(
            correlation,
            match.groupValues[2],
            match.groupValues[3],
            match.groupValues[4],
        )
    }

    fun createRecord(
        level: String,
        event: String,
        component: String,
        correlation: CorrelationContext,
        attributes: Map<String, Any?> = emptyMap(),
        timestamp: String,
    ): TelemetryRecord {
        require(level in setOf("debug", "info", "warn", "error")) { "invalid telemetry level" }
        require(eventPattern.matches(event)) { "invalid telemetry event" }
        require(componentPattern.matches(component)) { "invalid telemetry component" }
        val normalized = createCorrelationContext(
            correlation.correlationId,
            correlation.traceId,
            correlation.spanId,
            correlation.traceFlags,
        )
        val normalizedTimestamp = try {
            Instant.parse(timestamp).toString()
        } catch (_: DateTimeParseException) {
            throw IllegalArgumentException("invalid telemetry timestamp")
        }
        return TelemetryRecord(
            SchemaVersion,
            normalizedTimestamp,
            level,
            event,
            component,
            normalized.correlationId,
            normalized.traceId,
            normalized.spanId,
            normalized.traceFlags,
            sanitizeAttributes(attributes),
        )
    }

    private fun singleHeader(headers: Map<String, List<String>>, name: String): String? {
        val entries = try {
            headers.entries.map { entry -> entry.key to entry.value.toList() }
        } catch (_: Exception) {
            throw IllegalArgumentException("telemetry headers are not readable")
        }
        val values = entries
            .filter { it.first.lowercase() == name }
            .flatMap { it.second }
        require(values.size <= 1) { "ambiguous telemetry $name header" }
        return values.singleOrNull()?.also { require(it.isNotEmpty()) { "empty telemetry $name header" } }
    }

    private fun createCorrelationContext(
        correlationId: String,
        traceId: String? = null,
        spanId: String? = null,
        traceFlags: String? = null,
    ): CorrelationContext {
        require(correlationPattern.matches(correlationId)) { "invalid telemetry correlation ID" }
        require((traceId == null) == (spanId == null)) { "trace and span IDs must be supplied together" }
        if (traceId == null || spanId == null) {
            require(traceFlags == null) { "trace flags require trace and span IDs" }
            return CorrelationContext(correlationId.lowercase())
        }
        require(tracePattern.matches(traceId)) { "invalid telemetry trace ID" }
        require(spanPattern.matches(spanId)) { "invalid telemetry span ID" }
        val normalizedFlags = traceFlags ?: "01"
        require(flagsPattern.matches(normalizedFlags)) { "invalid telemetry trace flags" }
        return CorrelationContext(
            correlationId.lowercase(),
            traceId.lowercase(),
            spanId.lowercase(),
            normalizedFlags.lowercase(),
        )
    }
}

data class CorrelationContext(
    val correlationId: String,
    val traceId: String? = null,
    val spanId: String? = null,
    val traceFlags: String? = null,
)

data class TelemetryRecord(
    val schemaVersion: Int,
    val timestamp: String,
    val level: String,
    val event: String,
    val component: String,
    val correlationId: String,
    val traceId: String?,
    val spanId: String?,
    val traceFlags: String?,
    val attributes: Map<String, Any>,
)
