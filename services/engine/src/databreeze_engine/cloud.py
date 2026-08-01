"""Single-request cloud-worker adapter using the shared typed dispatcher."""

from __future__ import annotations

import sys
from typing import Any

from .dispatcher import dispatch_execution
from .json_codec import JsonCodecError, decode_json, encode_json
from .models import EngineExecutionRequest

MAX_CLOUD_INPUT_BYTES = 1024 * 1024


def invoke(payload: dict[str, Any]) -> dict[str, Any]:
    request = EngineExecutionRequest.model_validate(payload)
    return dispatch_execution(request).model_dump(mode="json")


def main() -> int:
    encoded = sys.stdin.buffer.read(MAX_CLOUD_INPUT_BYTES + 1)
    if not encoded or len(encoded) > MAX_CLOUD_INPUT_BYTES:
        return 2
    try:
        payload = decode_json(encoded)
        if not isinstance(payload, dict):
            return 2
        output = encode_json(invoke(payload))
    except (JsonCodecError, ValueError):
        return 2
    sys.stdout.buffer.write(output)
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
