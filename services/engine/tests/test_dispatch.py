from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest

from databreeze_engine.dispatcher import EngineDispatchError, dispatch_execution, dispatch_rpc
from databreeze_engine.models import (
    EngineExecutionRequest,
    JsonRpcErrorResponse,
    JsonRpcSuccessResponse,
)


def rpc(payload: dict[str, Any], request_id: int | str = 1) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "method": "engine.execute", "params": payload}


def test_json_rpc_success_has_only_validated_result(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    response = dispatch_rpc(
        rpc(execution_payload()), wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC)
    )
    assert response["jsonrpc"] == "2.0"
    assert response["id"] == 1
    assert response["result"]["status"] == "SUCCEEDED"
    assert "error" not in response
    JsonRpcSuccessResponse.model_validate(response)


def test_deadline_and_unsupported_requests_return_stable_safe_errors(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    expired = execution_payload(deadline="2020-01-01T00:00:00Z")
    assert dispatch_rpc(rpc(expired), wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC))[
        "error"
    ] == {
        "code": -32006,
        "message": "Deadline exceeded",
        "data": {"engineCode": "DEADLINE_EXCEEDED"},
    }
    unknown = execution_payload()
    unknown["action"] = {**unknown["action"], "type": "unknown.action"}
    assert dispatch_rpc(rpc(unknown), wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC))[
        "error"
    ] == {
        "code": -32002,
        "message": "Unsupported action",
        "data": {"engineCode": "UNSUPPORTED_ACTION"},
    }


def test_shared_contract_leap_second_deadline_dispatches_safely(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    payload = execution_payload(deadline="2099-12-31T23:59:60Z")
    response = dispatch_rpc(rpc(payload), wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC))
    assert response["result"]["status"] == "SUCCEEDED"


def test_invalid_json_rpc_version_method_id_and_params_are_rejected(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    cases = [
        (
            {**rpc(execution_payload()), "jsonrpc": "1.0"},
            -32600,
            "Invalid Request",
            "MALFORMED_REQUEST",
        ),
        (
            {**rpc(execution_payload()), "method": "system.exec"},
            -32601,
            "Method not found",
            "METHOD_NOT_FOUND",
        ),
        (rpc(execution_payload(), request_id=True), -32600, "Invalid Request", "MALFORMED_REQUEST"),
        (
            {**rpc(execution_payload()), "params": {"path": r"C:\\secret\\input"}},
            -32602,
            "Invalid params",
            "VALIDATION_FAILED",
        ),
    ]
    for request, code, message, engine_code in cases:
        response = dispatch_rpc(request)
        assert response["error"] == {
            "code": code,
            "message": message,
            "data": {"engineCode": engine_code},
        }
        JsonRpcErrorResponse.model_validate(response)


def test_errors_do_not_reflect_exception_paths_handles_or_values(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    marker = "PRIVATE_VALUE_X9Y8Z7"
    payload = execution_payload()
    payload["inputHandles"][0]["handleId"] = marker
    payload["action"] = {**payload["action"], "handlerDigest": "sha256:" + "0" * 64}
    response = dispatch_rpc(rpc(payload))
    serialized = str(response)
    assert response["error"] == {
        "code": -32004,
        "message": "Handler digest mismatch",
        "data": {"engineCode": "HANDLER_DIGEST_MISMATCH"},
    }
    assert marker not in serialized
    assert "input-1" not in serialized


def _request(
    execution_payload: Callable[..., dict[str, Any]], **updates: Any
) -> EngineExecutionRequest:
    payload = execution_payload()
    payload.update(updates)
    return EngineExecutionRequest.model_validate(payload)


def test_dispatch_enforces_aggregate_input_and_declared_output_limits(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    payload = execution_payload()
    payload["inputHandles"] = [
        {**payload["inputHandles"][0], "handleId": "input-1", "byteLength": 8 * 1024 * 1024 + 1},
        {**payload["inputHandles"][0], "handleId": "input-2", "byteLength": 8 * 1024 * 1024},
    ]
    with pytest.raises(EngineDispatchError, match="RESOURCE_LIMIT_EXCEEDED"):
        dispatch_execution(EngineExecutionRequest.model_validate(payload))

    payload = execution_payload()
    payload["outputHandle"]["byteLength"] = 1024 * 1024 + 1
    with pytest.raises(EngineDispatchError, match="RESOURCE_LIMIT_EXCEEDED"):
        dispatch_execution(EngineExecutionRequest.model_validate(payload))


def test_dispatch_checks_post_call_deadline_and_logical_duration(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    before = datetime(2026, 1, 1, tzinfo=UTC)
    wall_values = iter((before, datetime(2100, 1, 1, tzinfo=UTC)))
    with pytest.raises(EngineDispatchError, match="DEADLINE_EXCEEDED"):
        dispatch_execution(
            _request(execution_payload),
            wall_clock=lambda: next(wall_values),
            monotonic_clock=lambda: 0.0,
        )

    monotonic_values = iter((0.0, 5.001))
    with pytest.raises(EngineDispatchError, match="DURATION_EXCEEDED"):
        dispatch_execution(
            _request(execution_payload),
            wall_clock=lambda: before,
            monotonic_clock=lambda: next(monotonic_values),
        )
