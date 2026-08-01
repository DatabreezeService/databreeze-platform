"""Strict bounded JSON codec shared by transport adapters."""

from __future__ import annotations

import json
import math
from typing import Any

MAX_JSON_DEPTH = 64
MAX_JSON_NUMBER_TOKEN_BYTES = 128


class JsonCodecError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise JsonCodecError("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def _validate_json_value(value: object) -> None:
    if isinstance(value, float):
        if not math.isfinite(value):
            raise JsonCodecError("NON_FINITE_NUMBER")
    elif isinstance(value, str):
        try:
            value.encode("utf-8", "strict")
        except UnicodeEncodeError:
            raise JsonCodecError("INVALID_UNICODE") from None
    elif isinstance(value, list):
        for item in value:
            _validate_json_value(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            _validate_json_value(key)
            _validate_json_value(item)


def _preflight_json(encoded: bytes) -> None:
    depth = 0
    in_string = False
    escaped = False
    index = 0
    while index < len(encoded):
        byte = encoded[index]
        if in_string:
            if escaped:
                escaped = False
            elif byte == 0x5C:
                escaped = True
            elif byte == 0x22:
                in_string = False
            index += 1
            continue
        if byte == 0x22:
            in_string = True
            index += 1
            continue
        if byte in (0x5B, 0x7B):
            depth += 1
            if depth > MAX_JSON_DEPTH:
                raise JsonCodecError("JSON_DEPTH_EXCEEDED")
        elif byte in (0x5D, 0x7D):
            depth -= 1
        elif byte == 0x2D or 0x30 <= byte <= 0x39:
            end = index + 1
            while end < len(encoded) and encoded[end] in b"0123456789.eE+-":
                end += 1
            if end - index > MAX_JSON_NUMBER_TOKEN_BYTES:
                raise JsonCodecError("JSON_NUMBER_TOO_LONG")
            index = end
            continue
        index += 1


def decode_json(encoded: bytes) -> object:
    _preflight_json(encoded)
    try:
        text = encoded.decode("utf-8", "strict")
    except UnicodeDecodeError:
        raise JsonCodecError("INVALID_UTF8") from None
    try:
        value = json.loads(
            text,
            object_pairs_hook=_pairs,
            parse_constant=lambda _value: (_ for _ in ()).throw(
                JsonCodecError("NON_FINITE_NUMBER")
            ),
        )
    except JsonCodecError:
        raise
    except json.JSONDecodeError:
        raise JsonCodecError("MALFORMED_JSON") from None
    except (RecursionError, ValueError, OverflowError):
        raise JsonCodecError("JSON_LIMIT_EXCEEDED") from None
    _validate_json_value(value)
    return value


def encode_json(value: object) -> bytes:
    try:
        _validate_json_value(value)
        return json.dumps(
            value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
        ).encode("utf-8", "strict")
    except (TypeError, ValueError, UnicodeEncodeError, RecursionError, OverflowError):
        raise JsonCodecError("INVALID_JSON_VALUE") from None
