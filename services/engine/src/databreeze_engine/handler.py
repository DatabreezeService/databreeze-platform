"""Narrow typed handler contract shared by both executor adapters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from .models import (
    EngineProgress,
    FoundationDigestResult,
    FoundationMetadataParameters,
    OpaqueHandle,
    ResourceLimits,
)


class ProgressSink(Protocol):
    def emit(self, progress: EngineProgress) -> None: ...


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


class ActionHandler(Protocol):
    def __call__(
        self, context: HandlerContext, parameters: FoundationMetadataParameters
    ) -> FoundationDigestResult: ...


class DisabledProgressSink:
    """Content-safe default: progress remains disabled until a supervisor supplies a sink."""

    def emit(self, progress: EngineProgress) -> None:
        del progress
