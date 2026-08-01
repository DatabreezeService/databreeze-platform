from __future__ import annotations

from collections.abc import Callable
from io import BytesIO
from typing import Any

from databreeze_engine.cloud import invoke
from databreeze_engine.framing import read_frame, write_frame
from databreeze_engine.sidecar import serve


def rpc(payload: dict[str, Any], request_id: int = 1) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "method": "engine.execute", "params": payload}


def test_sidecar_repeats_frames_and_matches_cloud_dispatch(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    payload = execution_payload()
    input_stream = BytesIO()
    write_frame(input_stream, rpc(payload, 1))
    write_frame(input_stream, rpc(payload, 2))
    input_stream.seek(0)
    output_stream = BytesIO()

    assert serve(input_stream, output_stream) == 0
    output_stream.seek(0)
    first = read_frame(output_stream)
    second = read_frame(output_stream)
    assert first["result"] == invoke(payload)
    assert second["result"] == first["result"]
    assert read_frame(output_stream) is None


def test_sidecar_stops_on_corrupt_transport_without_extra_output(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    input_stream = BytesIO()
    write_frame(input_stream, rpc(execution_payload()))
    input_stream.write(b"\x00\x01")
    input_stream.seek(0)
    output_stream = BytesIO()

    assert serve(input_stream, output_stream) == 2
    output_stream.seek(0)
    assert read_frame(output_stream)["result"]["status"] == "SUCCEEDED"
    assert read_frame(output_stream) is None
