"""Content-safe telemetry adapter for the Python engine.

The engine deliberately mirrors the TypeScript allowlist instead of importing
application code. It emits only bounded operational metadata to its caller;
the Desktop sidecar or cloud worker owns the exporter.
"""

from __future__ import annotations

import re
from typing import Any

SAFE_ATTRIBUTE_KEYS = frozenset(
    {
        "workspaceId",
        "projectId",
        "jobId",
        "attemptId",
        "deviceId",
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
_FORBIDDEN_KEY = re.compile(
    r"secret|token|password|credential|private.?key|authorization|cookie|path|filename|content|payload|body|value|prompt|question|evidence|snippet|formula|transcript|voice|email|phone|address|comment",
    re.IGNORECASE,
)


def sanitize_attributes(attributes: dict[str, Any]) -> dict[str, str | int | float | bool]:
    """Return only bounded, allowlisted scalar attributes."""

    safe: dict[str, str | int | float | bool] = {}
    for key, value in attributes.items():
        if not key or len(key) > 64 or not key.isidentifier():
            raise ValueError(f"invalid telemetry key: {key!r}")
        if key not in SAFE_ATTRIBUTE_KEYS or _FORBIDDEN_KEY.search(key):
            continue
        is_bounded_number = (
            isinstance(value, (int, float)) and not isinstance(value, bool) and abs(value) <= 1e15
        )
        if (
            isinstance(value, bool)
            or is_bounded_number
            or (isinstance(value, str) and len(value) <= 256)
        ):
            safe[key] = value
    return safe
