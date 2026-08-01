package com.databreeze.android.telemetry

/** Cross-runtime names shared with @databreeze/telemetry/v1. */
object TelemetryContract {
    const val SchemaVersion = 1
    const val CorrelationHeader = "x-correlation-id"
    const val TraceparentHeader = "traceparent"
    val SafeAttributeKeys = setOf(
        "workspaceId", "projectId", "jobId", "attemptId", "deviceId",
        "protocolVersion", "operation", "outcome", "status", "reasonCode",
        "errorCode", "mode", "durationMs", "retryCount", "itemCount",
        "byteCount", "redactedCount", "sampled",
    )
}
