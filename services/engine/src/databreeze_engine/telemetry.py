"""Content-safe telemetry primitives for the Python engine.

The engine mirrors the canonical schema in ``packages/telemetry/schemas/v1.json``.
It emits only bounded operational metadata to its caller; the Desktop sidecar or
cloud worker owns the exporter.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

SAFE_ATTRIBUTE_KEYS = frozenset(
    {
        "organizationId",
        "workspaceId",
        "projectId",
        "principalId",
        "deviceId",
        "jobId",
        "attemptId",
        "artifactId",
        "artifactVersionId",
        "datasetId",
        "datasetVersionId",
        "processorVersion",
        "protocolVersion",
        "route",
        "operation",
        "outcome",
        "status",
        "reasonCode",
        "errorCode",
        "providerCode",
        "mode",
        "dataClass",
        "durationMs",
        "queueDelayMs",
        "retryCount",
        "itemCount",
        "byteCount",
        "redactedCount",
        "sampled",
    }
)
_IDENTIFIER_ATTRIBUTES = SAFE_ATTRIBUTE_KEYS - {
    "processorVersion",
    "protocolVersion",
    "route",
    "operation",
    "outcome",
    "status",
    "reasonCode",
    "errorCode",
    "providerCode",
    "mode",
    "dataClass",
    "durationMs",
    "queueDelayMs",
    "retryCount",
    "itemCount",
    "byteCount",
    "redactedCount",
    "sampled",
}
_NUMERIC_ATTRIBUTES = frozenset(
    {"durationMs", "queueDelayMs", "retryCount", "itemCount", "byteCount", "redactedCount"}
)
_TOKEN_ATTRIBUTES = frozenset(
    {
        "processorVersion",
        "protocolVersion",
        "operation",
        "outcome",
        "reasonCode",
        "errorCode",
        "providerCode",
        "mode",
        "dataClass",
    }
)
_KEY_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9]*$")
_TOKEN_PATTERN = re.compile(r"^(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_ROUTE_PATTERN = re.compile(r"^/?[A-Za-z0-9._~/-]{1,255}$")
_UNSAFE_STRING = re.compile(
    r"(?:[\\/]|^[a-z]:|://|[@]|\.(?:xlsx?|csv|pdf|docx?|pptx?|png|jpe?g|gif|zip|json|xml|parquet|txt|log|db|sqlite|avro|orc)$)",
    re.IGNORECASE,
)
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_CORRELATION_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_TRACE_PATTERN = re.compile(r"^(?!0{32}$)[0-9a-f]{32}$", re.IGNORECASE)
_SPAN_PATTERN = re.compile(r"^(?!0{16}$)[0-9a-f]{16}$", re.IGNORECASE)
_FLAGS_PATTERN = re.compile(r"^[0-9a-f]{2}$", re.IGNORECASE)
_TRACEPARENT_PATTERN = re.compile(
    r"^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$", re.IGNORECASE
)
_EVENT_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}$")
_COMPONENT_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,5}$")
_LEVELS = frozenset({"debug", "info", "warn", "error"})


@dataclass(frozen=True)
class CorrelationContext:
    correlation_id: str
    trace_id: str | None = None
    span_id: str | None = None
    trace_flags: str | None = None


def _safe_number(value: object) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        numeric = float(value)
    except (OverflowError, ValueError):
        return None
    if not math.isfinite(numeric) or abs(numeric) > 1e15:
        return None
    return value


def _safe_string(key: str, value: str) -> str | None:
    if len(value) > 256 or _CONTROL.search(value) or _UNSAFE_STRING.search(value):
        return None
    if key == "route":
        return value if _ROUTE_PATTERN.fullmatch(value) else None
    if key not in _IDENTIFIER_ATTRIBUTES and key not in _TOKEN_ATTRIBUTES:
        return None
    return value if _TOKEN_PATTERN.fullmatch(value) else None


def _safe_scalar(key: str, value: object) -> str | int | float | bool | None:
    if key == "sampled":
        return value if isinstance(value, bool) else None
    if key in _NUMERIC_ATTRIBUTES or key == "status":
        return _safe_number(value)
    return _safe_string(key, value) if isinstance(value, str) else None


def _validate_key(key: object) -> str:
    if (
        not isinstance(key, str)
        or len(key) == 0
        or len(key) > 64
        or not _KEY_PATTERN.fullmatch(key)
    ):
        raise ValueError(f"invalid telemetry key: {key!r}")
    return key


def sanitize_attributes(attributes: dict[str, Any]) -> dict[str, str | int | float | bool]:
    """Return only bounded, allowlisted scalar attributes."""

    if not isinstance(attributes, Mapping):
        return {}
    safe: dict[str, str | int | float | bool] = {}
    for raw_key, value in attributes.items():
        key = _validate_key(raw_key)
        if key not in SAFE_ATTRIBUTE_KEYS:
            continue
        scalar = _safe_scalar(key, value)
        if scalar is not None:
            safe[key] = scalar
    return safe


def assert_safe_attributes(attributes: Mapping[str, Any]) -> None:
    """Raise when a record contains an unsafe or unknown attribute."""

    for raw_key, value in attributes.items():
        key = _validate_key(raw_key)
        if key not in SAFE_ATTRIBUTE_KEYS or _safe_scalar(key, value) is None:
            raise ValueError(f"telemetry attribute is not allowed: {key}")


def _correlation_id(value: str) -> str:
    if not _CORRELATION_PATTERN.fullmatch(value):
        raise ValueError("invalid telemetry correlation ID")
    return value.lower()


def _trace_id(value: str) -> str:
    if not _TRACE_PATTERN.fullmatch(value):
        raise ValueError("invalid telemetry trace ID")
    return value.lower()


def _span_id(value: str) -> str:
    if not _SPAN_PATTERN.fullmatch(value):
        raise ValueError("invalid telemetry span ID")
    return value.lower()


def _trace_flags(value: str) -> str:
    if not _FLAGS_PATTERN.fullmatch(value):
        raise ValueError("invalid telemetry trace flags")
    return value.lower()


def create_correlation_context(
    correlation_id: str | None = None,
    *,
    trace_id: str | None = None,
    span_id: str | None = None,
    trace_flags: str | None = None,
) -> CorrelationContext:
    """Create a validated correlation context shared with the TypeScript contract."""

    normalized_correlation = _correlation_id(correlation_id or str(uuid4()))
    if (trace_id is None) != (span_id is None):
        raise ValueError("trace and span IDs must be supplied together")
    if trace_id is None or span_id is None:
        if trace_flags is not None:
            raise ValueError("trace flags require trace and span IDs")
        return CorrelationContext(normalized_correlation)
    return CorrelationContext(
        normalized_correlation,
        _trace_id(trace_id),
        _span_id(span_id),
        _trace_flags(trace_flags or "01"),
    )


def correlation_headers(context: CorrelationContext) -> dict[str, str]:
    normalized = create_correlation_context(
        context.correlation_id,
        trace_id=context.trace_id,
        span_id=context.span_id,
        trace_flags=context.trace_flags,
    )
    headers = {"x-correlation-id": normalized.correlation_id}
    if normalized.trace_id and normalized.span_id:
        headers["traceparent"] = (
            f"00-{normalized.trace_id}-{normalized.span_id}-{normalized.trace_flags or '01'}"
        )
    return headers


def _single_header(headers: Mapping[str, str | Sequence[str] | None], name: str) -> str | None:
    values: list[str] = []
    for key, value in headers.items():
        if key.lower() != name:
            continue
        if isinstance(value, str):
            values.append(value)
        elif value is not None:
            values.extend(value)
    if len(values) > 1:
        raise ValueError(f"ambiguous telemetry {name} header")
    if not values:
        return None
    if not values[0]:
        raise ValueError(f"empty telemetry {name} header")
    return values[0]


def correlation_from_headers(
    headers: Mapping[str, str | Sequence[str] | None],
) -> CorrelationContext:
    correlation_id = _single_header(headers, "x-correlation-id")
    if correlation_id is None:
        raise ValueError("missing telemetry correlation ID")
    traceparent = _single_header(headers, "traceparent")
    if traceparent is None:
        return create_correlation_context(correlation_id)
    match = _TRACEPARENT_PATTERN.fullmatch(traceparent)
    if match is None or match.group(1).lower() == "ff":
        raise ValueError("invalid telemetry traceparent")
    return create_correlation_context(
        correlation_id,
        trace_id=match.group(2),
        span_id=match.group(3),
        trace_flags=match.group(4),
    )


def emit_record(
    level: str,
    event: str,
    component: str,
    correlation: CorrelationContext,
    attributes: Mapping[str, Any] | None = None,
    *,
    timestamp: datetime | None = None,
) -> dict[str, Any]:
    """Build the same structured record shape emitted by the TypeScript logger."""

    if level not in _LEVELS or not _EVENT_PATTERN.fullmatch(event):
        raise ValueError("invalid telemetry level or event")
    if not _COMPONENT_PATTERN.fullmatch(component):
        raise ValueError("invalid telemetry component")
    normalized = create_correlation_context(
        correlation.correlation_id,
        trace_id=correlation.trace_id,
        span_id=correlation.span_id,
        trace_flags=correlation.trace_flags,
    )
    now = timestamp or datetime.now(UTC)
    record: dict[str, Any] = {
        "schemaVersion": 1,
        "timestamp": now.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "level": level,
        "event": event,
        "component": component,
        "correlationId": normalized.correlation_id,
        "attributes": sanitize_attributes(dict(attributes or {})),
    }
    if normalized.trace_id and normalized.span_id:
        record["traceId"] = normalized.trace_id
        record["spanId"] = normalized.span_id
        record["traceFlags"] = normalized.trace_flags
    return record
