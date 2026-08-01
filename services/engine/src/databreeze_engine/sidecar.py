"""Binary stdio sidecar adapter. Importing this module performs no I/O."""

from __future__ import annotations

import sys
from typing import BinaryIO

from .dispatcher import dispatch_rpc
from .framing import FrameError, read_frame, write_frame


def serve(input_stream: BinaryIO, output_stream: BinaryIO) -> int:
    while True:
        try:
            request = read_frame(input_stream)
            if request is None:
                return 0
            write_frame(output_stream, dispatch_rpc(request))
        except FrameError:
            return 2


def main() -> int:
    return serve(sys.stdin.buffer, sys.stdout.buffer)


if __name__ == "__main__":
    raise SystemExit(main())
