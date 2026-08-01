"""Exact four-byte big-endian framed JSON transport."""

from __future__ import annotations

from typing import BinaryIO

from .json_codec import JsonCodecError, decode_json, encode_json

MAX_FRAME_BYTES = 16 * 1024 * 1024
MAX_OUTPUT_FRAME_BYTES = 1024 * 1024


class FrameError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _exact_read(
    stream: BinaryIO, length: int, *, truncated_code: str, allow_empty_eof: bool = False
) -> bytes | None:
    result = bytearray()
    remaining = length
    while remaining:
        try:
            chunk = stream.read(remaining)
        except (OSError, ValueError):
            raise FrameError("READ_FAILED") from None
        if chunk is None or not isinstance(chunk, bytes):
            raise FrameError("INVALID_READ_RESULT")
        if chunk == b"":
            if allow_empty_eof and not result:
                return None
            raise FrameError(truncated_code)
        if len(chunk) > remaining:
            raise FrameError("INVALID_READ_COUNT")
        result.extend(chunk)
        remaining -= len(chunk)
    return bytes(result)


def read_frame(stream: BinaryIO) -> object | None:
    prefix = _exact_read(stream, 4, truncated_code="TRUNCATED_PREFIX", allow_empty_eof=True)
    if prefix is None:
        return None
    length = int.from_bytes(prefix, "big", signed=False)
    if length == 0:
        raise FrameError("ZERO_LENGTH_FRAME")
    if length > MAX_FRAME_BYTES:
        raise FrameError("OVERSIZED_FRAME")
    body = _exact_read(stream, length, truncated_code="TRUNCATED_BODY")
    if body is None:
        raise FrameError("TRUNCATED_BODY")
    try:
        return decode_json(body)
    except JsonCodecError as error:
        raise FrameError(error.code) from None


def _write_all(stream: BinaryIO, data: bytes) -> None:
    offset = 0
    while offset < len(data):
        try:
            count = stream.write(data[offset:])
        except (OSError, ValueError):
            raise FrameError("WRITE_FAILED") from None
        if (
            count is None
            or isinstance(count, bool)
            or not isinstance(count, int)
            or count <= 0
            or count > len(data) - offset
        ):
            raise FrameError("INVALID_WRITE_COUNT")
        offset += count


def write_frame(stream: BinaryIO, payload: object) -> None:
    try:
        body = encode_json(payload)
    except JsonCodecError as error:
        raise FrameError(error.code) from None
    if not body:
        raise FrameError("ZERO_LENGTH_OUTPUT")
    if len(body) > MAX_OUTPUT_FRAME_BYTES:
        raise FrameError("OVERSIZED_OUTPUT")
    _write_all(stream, len(body).to_bytes(4, "big", signed=False))
    _write_all(stream, body)
    try:
        stream.flush()
    except (OSError, ValueError):
        raise FrameError("WRITE_FAILED") from None
