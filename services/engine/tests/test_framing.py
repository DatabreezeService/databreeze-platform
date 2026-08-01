from __future__ import annotations

from io import BytesIO

import pytest

from databreeze_engine.framing import (
    MAX_FRAME_BYTES,
    MAX_OUTPUT_FRAME_BYTES,
    FrameError,
    read_frame,
    write_frame,
)


def framed(body: bytes) -> bytes:
    return len(body).to_bytes(4, "big") + body


def test_four_byte_frame_round_trip_and_empty_eof() -> None:
    stream = BytesIO()
    write_frame(stream, {"jsonrpc": "2.0", "id": 1, "result": {"ok": True}})
    stream.seek(0)
    assert read_frame(stream) == {"id": 1, "jsonrpc": "2.0", "result": {"ok": True}}
    assert read_frame(stream) is None


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (b"\x00\x01", "TRUNCATED_PREFIX"),
        ((6).to_bytes(4, "big") + b'{"x":', "TRUNCATED_BODY"),
        (b"\x00\x00\x00\x00", "ZERO_LENGTH_FRAME"),
        ((MAX_FRAME_BYTES + 1).to_bytes(4, "big"), "OVERSIZED_FRAME"),
        (framed(b"\xff"), "INVALID_UTF8"),
        (framed(b'{"x":1,"x":2}'), "DUPLICATE_JSON_KEY"),
        (framed(b"{}{}"), "MALFORMED_JSON"),
        (framed(b'{"x":"\\ud800"}'), "INVALID_UNICODE"),
    ],
)
def test_frame_corruption_has_stable_codes(data: bytes, code: str) -> None:
    with pytest.raises(FrameError, match=code):
        read_frame(BytesIO(data))


def test_maximum_frame_is_accepted() -> None:
    body = b'"' + (b"a" * (MAX_FRAME_BYTES - 2)) + b'"'
    assert len(read_frame(BytesIO(framed(body)))) == MAX_FRAME_BYTES - 2


def test_oversized_declaration_is_rejected_before_body_read() -> None:
    stream = BytesIO((MAX_FRAME_BYTES + 1).to_bytes(4, "big") + b"not-read")
    with pytest.raises(FrameError, match="OVERSIZED_FRAME"):
        read_frame(stream)
    assert stream.tell() == 4


def test_output_policy_is_smaller_and_bounded() -> None:
    with pytest.raises(FrameError, match="OVERSIZED_OUTPUT"):
        write_frame(BytesIO(), {"value": "x" * MAX_OUTPUT_FRAME_BYTES})
