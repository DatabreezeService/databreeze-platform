"""Shared typed dispatcher used by sidecar and cloud entry paths."""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import ValidationError

from .handler import CancellationView, DisabledProgressSink, HandlerContext
from .json_codec import encode_json
from .models import (
    EngineError,
    EngineExecutionRequest,
    EngineResult,
    FoundationDigestResult,
    JsonRpcErrorResponse,
    JsonRpcRequest,
    JsonRpcSuccessResponse,
)
from .registry import RegistryError, default_registry

WallClock = Callable[[], datetime]
MonotonicClock = Callable[[], float]

_ERROR_SPECS: dict[str, tuple[int, str]] = {
    "PARSE_ERROR": (-32700, "Parse error"),
    "MALFORMED_REQUEST": (-32600, "Invalid Request"),
    "METHOD_NOT_FOUND": (-32601, "Method not found"),
    "VALIDATION_FAILED": (-32602, "Invalid params"),
    "INTERNAL_ERROR": (-32603, "Internal error"),
    "UNSUPPORTED_PROTOCOL": (-32001, "Unsupported protocol"),
    "UNSUPPORTED_ACTION": (-32002, "Unsupported action"),
    "UNSUPPORTED_ACTION_VERSION": (-32003, "Unsupported action version"),
    "HANDLER_DIGEST_MISMATCH": (-32004, "Handler digest mismatch"),
    "DEADLINE_EXCEEDED": (-32006, "Deadline exceeded"),
    "RESOURCE_LIMIT_EXCEEDED": (-32007, "Resource limit exceeded"),
    "DURATION_EXCEEDED": (-32008, "Duration exceeded"),
}


class EngineDispatchError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _deadline(value: str) -> datetime:
    normalized = value.removesuffix("Z") + "+00:00"
    if value[17:19] == "60":
        normalized = value[:17] + "59" + value[19:-1] + "+00:00"
        return datetime.fromisoformat(normalized) + timedelta(seconds=1)
    return datetime.fromisoformat(normalized)


def dispatch_execution(
    request: EngineExecutionRequest,
    *,
    wall_clock: WallClock | None = None,
    monotonic_clock: MonotonicClock | None = None,
) -> EngineResult:
    read_wall_clock = wall_clock or (lambda: datetime.now(UTC))
    read_monotonic_clock = monotonic_clock or time.monotonic
    deadline = _deadline(request.deadline)
    if deadline <= read_wall_clock():
        raise EngineDispatchError("DEADLINE_EXCEEDED")
    try:
        definition = default_registry().resolve(
            request.action.type, request.action.version, request.action.handlerDigest
        )
    except RegistryError as error:
        raise EngineDispatchError(error.code) from None

    limits = definition.manifest.resources
    if sum(handle.byteLength for handle in request.inputHandles) > limits.maxInputBytes:
        raise EngineDispatchError("RESOURCE_LIMIT_EXCEEDED")
    if request.outputHandle.byteLength > limits.maxOutputBytes:
        raise EngineDispatchError("RESOURCE_LIMIT_EXCEEDED")

    context = HandlerContext(
        request_id=request.requestId,
        attempt_id=request.attemptId,
        correlation_id=request.correlation.correlationId,
        locale=request.locale,
        input_handles=tuple(request.inputHandles),
        output_handle=request.outputHandle,
        resources=limits,
        deadline=deadline,
        cancellation=CancellationView(),
        progress=DisabledProgressSink(),
    )
    started = read_monotonic_clock()
    try:
        output = definition.handler(context, request.parameters)
        if not isinstance(output, FoundationDigestResult):
            raise EngineDispatchError("INTERNAL_ERROR")
        result = EngineResult(attemptId=request.attemptId, status="SUCCEEDED", output=output)
    except EngineDispatchError:
        raise
    except Exception:
        raise EngineDispatchError("INTERNAL_ERROR") from None
    elapsed_milliseconds = (read_monotonic_clock() - started) * 1000
    if deadline <= read_wall_clock():
        raise EngineDispatchError("DEADLINE_EXCEEDED")
    if elapsed_milliseconds < 0:
        raise EngineDispatchError("INTERNAL_ERROR")
    if elapsed_milliseconds > limits.maxDurationMilliseconds:
        raise EngineDispatchError("DURATION_EXCEEDED")
    if len(encode_json(output.model_dump(mode="json"))) > limits.maxOutputBytes:
        raise EngineDispatchError("RESOURCE_LIMIT_EXCEEDED")
    return result


def _recover_request_id(payload: object) -> int | str | None:
    if not isinstance(payload, dict):
        return None
    request_id = payload.get("id")
    if isinstance(request_id, bool):
        return None
    if isinstance(request_id, int) and request_id >= 0:
        return request_id
    if isinstance(request_id, str) and 1 <= len(request_id) <= 128:
        return request_id
    return None


def error_response(request_id: int | str | None, engine_code: str) -> dict[str, Any]:
    numeric_code, message = _ERROR_SPECS.get(engine_code, _ERROR_SPECS["INTERNAL_ERROR"])
    safe_engine_code = engine_code if engine_code in _ERROR_SPECS else "INTERNAL_ERROR"
    error = EngineError.model_validate(
        {
            "code": numeric_code,
            "message": message,
            "data": {"engineCode": safe_engine_code},
        }
    )
    response = JsonRpcErrorResponse(
        jsonrpc="2.0",
        id=request_id,
        error=error,
    )
    return response.model_dump(mode="json")


def dispatch_rpc(
    payload: object,
    *,
    wall_clock: WallClock | None = None,
    monotonic_clock: MonotonicClock | None = None,
) -> dict[str, Any]:
    request_id = _recover_request_id(payload)
    if not isinstance(payload, dict):
        return error_response(None, "MALFORMED_REQUEST")
    if set(payload) != {"jsonrpc", "id", "method", "params"}:
        return error_response(request_id, "MALFORMED_REQUEST")
    if payload.get("jsonrpc") != "2.0" or request_id is None:
        return error_response(request_id, "MALFORMED_REQUEST")
    if payload.get("method") != "engine.execute":
        return error_response(request_id, "METHOD_NOT_FOUND")
    params = payload.get("params")
    if not isinstance(params, dict):
        return error_response(request_id, "VALIDATION_FAILED")
    if params.get("protocolVersion") not in (None, "1.0"):
        return error_response(request_id, "UNSUPPORTED_PROTOCOL")
    try:
        request = JsonRpcRequest.model_validate(payload)
    except ValidationError:
        return error_response(request_id, "VALIDATION_FAILED")
    try:
        result = dispatch_execution(
            request.params,
            wall_clock=wall_clock,
            monotonic_clock=monotonic_clock,
        )
        return JsonRpcSuccessResponse(jsonrpc="2.0", id=request.id, result=result).model_dump(
            mode="json"
        )
    except EngineDispatchError as error:
        return error_response(request.id, error.code)
    except Exception:
        return error_response(request.id, "INTERNAL_ERROR")
