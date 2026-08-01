"""Shared typed dispatcher used by sidecar and cloud entry paths."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import ValidationError

from .handler import CancellationView, DisabledProgressSink, HandlerContext
from .models import (
    EngineError,
    EngineErrorData,
    EngineExecutionRequest,
    EngineResult,
    JsonRpcErrorResponse,
    JsonRpcRequest,
    JsonRpcSuccessResponse,
)
from .registry import ActionRegistry, RegistryError, default_registry


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
    registry: ActionRegistry | None = None,
    now: datetime | None = None,
) -> EngineResult:
    active_registry = registry or default_registry()
    current_time = now or datetime.now(UTC)
    if _deadline(request.deadline) <= current_time:
        raise EngineDispatchError("DEADLINE_EXCEEDED")
    try:
        definition = active_registry.resolve(
            request.action.type, request.action.version, request.action.handlerDigest
        )
        context = HandlerContext(
            request_id=request.requestId,
            attempt_id=request.attemptId,
            correlation_id=request.correlation.correlationId,
            locale=request.locale,
            input_handles=tuple(request.inputHandles),
            output_handle=request.outputHandle,
            resources=definition.manifest.resources,
            deadline=_deadline(request.deadline),
            cancellation=CancellationView(),
            progress=DisabledProgressSink(),
        )
        output = definition.handler(context, request.parameters)
        return EngineResult(attemptId=request.attemptId, status="SUCCEEDED", output=output)
    except RegistryError as error:
        raise EngineDispatchError(error.code) from None
    except ValidationError:
        raise EngineDispatchError("VALIDATION_FAILED") from None


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


def _error(request_id: int | str | None, code: str) -> dict[str, Any]:
    response = JsonRpcErrorResponse(
        jsonrpc="2.0",
        id=request_id,
        error=EngineError(code=code, data=EngineErrorData()),  # type: ignore[arg-type]
    )
    return response.model_dump(mode="json")


def dispatch_rpc(payload: object, *, now: datetime | None = None) -> dict[str, Any]:
    request_id = _recover_request_id(payload)
    if (
        isinstance(payload, dict)
        and isinstance(payload.get("params"), dict)
        and payload["params"].get("protocolVersion") not in (None, "1.0")
    ):
        return _error(request_id, "UNSUPPORTED_PROTOCOL")
    try:
        request = JsonRpcRequest.model_validate(payload)
    except ValidationError:
        return _error(request_id, "MALFORMED_REQUEST")
    try:
        result = dispatch_execution(request.params, now=now)
        return JsonRpcSuccessResponse(jsonrpc="2.0", id=request.id, result=result).model_dump(
            mode="json"
        )
    except EngineDispatchError as error:
        return _error(request.id, error.code)
    except Exception:
        return _error(request.id, "INTERNAL_ERROR")
