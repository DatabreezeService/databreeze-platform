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


@pytest.mark.parametrize(
    ("body", "code"),
    [
        (b"[" * 65 + b"0" + b"]" * 65, "JSON_DEPTH_EXCEEDED"),
        (b"9" * 5_000, "JSON_NUMBER_TOO_LONG"),
        (b"1e999999", "NON_FINITE_NUMBER"),
        (b"-1e999999", "NON_FINITE_NUMBER"),
    ],
)
def test_json_limits_are_enforced_before_parser_recursion_or_integer_conversion(
    body: bytes, code: str
) -> None:
    with pytest.raises(FrameError, match=code):
        read_frame(BytesIO(framed(body)))


class ShortReader:
    def __init__(self, data: bytes, chunk_size: int) -> None:
        self._stream = BytesIO(data)
        self._chunk_size = chunk_size

    def read(self, size: int) -> bytes:
        return self._stream.read(min(size, self._chunk_size))


def test_exact_reads_tolerate_short_prefix_and_body_reads() -> None:
    body = b'{"ok":true}'
    assert read_frame(ShortReader(framed(body), 1)) == {"ok": True}  # type: ignore[arg-type]


class ControlledWriter:
    def __init__(self, result: int | None) -> None:
        self.result = result
        self.data = bytearray()
        self.flushed = False

    def write(self, data: bytes) -> int | None:
        if self.result is None:
            return None
        count = self.result if self.result == 1000 else min(self.result, len(data))
        if count > 0:
            self.data.extend(data[: min(count, len(data))])
        return count

    def flush(self) -> None:
        self.flushed = True


def test_exact_writes_loop_over_short_counts() -> None:
    writer = ControlledWriter(2)
    write_frame(writer, {"ok": True})  # type: ignore[arg-type]
    assert bytes(writer.data) == framed(b'{"ok":true}')
    assert writer.flushed is True


@pytest.mark.parametrize("result", [0, None, -1, 1000])
def test_exact_writes_reject_zero_none_or_invalid_counts(result: int | None) -> None:
    writer = ControlledWriter(result)
    with pytest.raises(FrameError, match="INVALID_WRITE_COUNT"):
        write_frame(writer, {"ok": True})  # type: ignore[arg-type]
    assert writer.flushed is False
