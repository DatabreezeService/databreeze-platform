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


def _exact_read(stream: BinaryIO, length: int) -> bytes:
    chunks: list[bytes] = []
    remaining = length
    while remaining:
        chunk = stream.read(remaining)
        if not chunk:
            raise FrameError("TRUNCATED_BODY")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def read_frame(stream: BinaryIO) -> object | None:
    prefix = stream.read(4)
    if prefix == b"":
        return None
    if len(prefix) != 4:
        raise FrameError("TRUNCATED_PREFIX")
    length = int.from_bytes(prefix, "big", signed=False)
    if length == 0:
        raise FrameError("ZERO_LENGTH_FRAME")
    if length > MAX_FRAME_BYTES:
        raise FrameError("OVERSIZED_FRAME")
    body = _exact_read(stream, length)
    try:
        return decode_json(body)
    except JsonCodecError as error:
        raise FrameError(error.code) from None


def write_frame(stream: BinaryIO, payload: object) -> None:
    try:
        body = encode_json(payload)
    except JsonCodecError as error:
        raise FrameError(error.code) from None
    if not body:
        raise FrameError("ZERO_LENGTH_OUTPUT")
    if len(body) > MAX_OUTPUT_FRAME_BYTES:
        raise FrameError("OVERSIZED_OUTPUT")
    stream.write(len(body).to_bytes(4, "big", signed=False))
    stream.write(body)
    stream.flush()
