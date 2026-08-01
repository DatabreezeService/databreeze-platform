from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from databreeze_engine.dispatcher import dispatch_rpc
from databreeze_engine.models import JsonRpcErrorResponse, JsonRpcSuccessResponse


def rpc(payload: dict[str, Any], request_id: int | str = 1) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "method": "engine.execute", "params": payload}


def test_json_rpc_success_has_only_validated_result(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    response = dispatch_rpc(rpc(execution_payload()), now=datetime(2026, 1, 1, tzinfo=UTC))
    assert response["jsonrpc"] == "2.0"
    assert response["id"] == 1
    assert response["result"]["status"] == "SUCCEEDED"
    assert "error" not in response
    JsonRpcSuccessResponse.model_validate(response)


def test_deadline_and_unsupported_requests_return_stable_safe_errors(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    expired = execution_payload(deadline="2020-01-01T00:00:00Z")
    assert (
        dispatch_rpc(rpc(expired), now=datetime(2026, 1, 1, tzinfo=UTC))["error"]["code"]
        == "DEADLINE_EXCEEDED"
    )
    unknown = execution_payload()
    unknown["action"] = {**unknown["action"], "type": "unknown.action"}
    assert (
        dispatch_rpc(rpc(unknown), now=datetime(2026, 1, 1, tzinfo=UTC))["error"]["code"]
        == "UNSUPPORTED_ACTION"
    )


def test_shared_contract_leap_second_deadline_dispatches_safely(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    payload = execution_payload(deadline="2099-12-31T23:59:60Z")
    response = dispatch_rpc(rpc(payload), now=datetime(2026, 1, 1, tzinfo=UTC))
    assert response["result"]["status"] == "SUCCEEDED"


def test_invalid_json_rpc_version_method_id_and_params_are_rejected(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    invalid = [
        {**rpc(execution_payload()), "jsonrpc": "1.0"},
        {**rpc(execution_payload()), "method": "system.exec"},
        rpc(execution_payload(), request_id=True),
        {**rpc(execution_payload()), "params": {"path": r"C:\\secret\\input"}},
    ]
    for request in invalid:
        response = dispatch_rpc(request)
        assert response["error"]["code"] == "MALFORMED_REQUEST"
        JsonRpcErrorResponse.model_validate(response)


def test_errors_do_not_reflect_exception_paths_handles_or_values(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    marker = "PRIVATE_VALUE_X9Y8Z7"
    payload = execution_payload(parameters={"items": [{"key": "x", "value": marker}]})
    payload["action"] = {**payload["action"], "handlerDigest": "sha256:" + "0" * 64}
    response = dispatch_rpc(rpc(payload))
    serialized = str(response)
    assert response["error"] == {"code": "HANDLER_DIGEST_MISMATCH", "data": {}}
    assert marker not in serialized
    assert "input-1" not in serialized
