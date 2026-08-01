"""Strict bounded JSON codec shared by transport adapters."""

from __future__ import annotations

import json
from typing import Any


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


def _validate_unicode(value: object) -> None:
    if isinstance(value, str):
        try:
            value.encode("utf-8", "strict")
        except UnicodeEncodeError:
            raise JsonCodecError("INVALID_UNICODE") from None
    elif isinstance(value, list):
        for item in value:
            _validate_unicode(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            _validate_unicode(key)
            _validate_unicode(item)


def decode_json(encoded: bytes) -> object:
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
    _validate_unicode(value)
    return value


def encode_json(value: object) -> bytes:
    try:
        _validate_unicode(value)
        return json.dumps(
            value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
        ).encode("utf-8", "strict")
    except (TypeError, ValueError, UnicodeEncodeError):
        raise JsonCodecError("INVALID_JSON_VALUE") from None
