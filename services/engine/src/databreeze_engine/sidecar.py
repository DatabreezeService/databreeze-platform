"""Binary stdio sidecar adapter. Importing this module performs no I/O."""

from __future__ import annotations

import sys
from contextlib import suppress
from typing import BinaryIO

from .dispatcher import dispatch_rpc, error_response
from .framing import FrameError, read_frame, write_frame

_JSON_PARSE_FRAME_CODES = frozenset(
    {
        "DUPLICATE_JSON_KEY",
        "INVALID_UNICODE",
        "INVALID_UTF8",
        "JSON_DEPTH_EXCEEDED",
        "JSON_LIMIT_EXCEEDED",
        "JSON_NUMBER_TOO_LONG",
        "MALFORMED_JSON",
        "NON_FINITE_NUMBER",
    }
)


def serve(input_stream: BinaryIO, output_stream: BinaryIO) -> int:
    while True:
        try:
            request = read_frame(input_stream)
        except FrameError as error:
            if error.code in _JSON_PARSE_FRAME_CODES:
                with suppress(FrameError):
                    write_frame(output_stream, error_response(None, "PARSE_ERROR"))
            return 2
        if request is None:
            return 0
        try:
            write_frame(output_stream, dispatch_rpc(request))
        except FrameError:
            return 2


def main() -> int:
    return serve(sys.stdin.buffer, sys.stdout.buffer)


if __name__ == "__main__":
    raise SystemExit(main())
