from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest


@pytest.fixture
def execution_payload() -> Callable[..., dict[str, Any]]:
    def build(**overrides: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "protocolVersion": "1.0",
            "requestId": "00000000-0000-4000-8000-000000000001",
            "attemptId": "00000000-0000-4000-8000-000000000002",
            "correlation": {"correlationId": "00000000-0000-4000-8000-000000000003"},
            "action": {
                "type": "foundation.metadata-digest",
                "version": "1.0.0",
                "handlerDigest": (
                    "sha256:6de342f9b36d0e1e05a4908ea7796e1564c45504f96256e2b4957aa8d0bbd9be"
                ),
            },
            "inputHandles": [
                {
                    "handleId": "input-1",
                    "byteLength": 128,
                    "sha256": "a" * 64,
                    "schemaId": "foundation.metadata-fixture.v1",
                }
            ],
            "outputHandle": {
                "handleId": "output-1",
                "byteLength": 4096,
                "sha256": "b" * 64,
                "schemaId": "foundation.metadata-digest-result.v1",
            },
            "parameters": {
                "items": [
                    {"key": "priority", "value": "high"},
                    {"key": "category", "value": "invoice"},
                ],
                "tags": ["beta", "alpha"],
            },
            "deadline": "2099-01-01T00:00:00Z",
            "locale": "vi-VN",
        }
        payload.update(overrides)
        return payload

    return build
