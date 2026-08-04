"""Narrow typed handler contract shared by both executor adapters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from .models import (
    EngineProgress,
    OpaqueHandle,
    ResourceLimits,
)


class ProgressSink(Protocol):
    def emit(self, progress: EngineProgress) -> None: ...


class InputReadError(Exception):
    """Stable, content-safe failure raised when an opaque handle cannot be read."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class InputReader(Protocol):
    def __call__(self, handle: OpaqueHandle, /) -> bytes: ...


class ActionExecutionError(Exception):
    """Stable processor rejection without exposing source content or paths."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class CancellationView:
    cancelled: bool = False


@dataclass(frozen=True, slots=True)
class HandlerContext:
    request_id: str
    attempt_id: str
    correlation_id: str
    locale: str
    input_handles: tuple[OpaqueHandle, ...]
    output_handle: OpaqueHandle
    resources: ResourceLimits
    deadline: datetime
    cancellation: CancellationView
    progress: ProgressSink
    read_input: InputReader


class ActionHandler(Protocol):
    def __call__(
        self, context: HandlerContext, parameters: Any
    ) -> Any: ...


class DisabledProgressSink:
    """Content-safe default: progress remains disabled until a supervisor supplies a sink."""

    def emit(self, progress: EngineProgress) -> None:
        del progress
