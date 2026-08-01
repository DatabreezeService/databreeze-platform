from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from databreeze_engine.dispatcher import dispatch_execution
from databreeze_engine.models import EngineExecutionRequest


def test_foundation_processor_matches_the_hand_checked_golden_digest(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    request = EngineExecutionRequest.model_validate(execution_payload())
    now = datetime(2026, 1, 1, tzinfo=UTC)
    result = dispatch_execution(request, wall_clock=lambda: now)
    fixture = json.loads(
        (Path(__file__).parent / "fixtures" / "metadata_digest_golden.json").read_text(
            encoding="utf-8"
        )
    )
    assert result.model_dump()["output"] == fixture["expectedOutput"]


def test_foundation_processor_is_stable_for_equivalent_input_order(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    first = EngineExecutionRequest.model_validate(execution_payload())
    reordered = execution_payload(
        parameters={
            "items": [
                {"key": "category", "value": "invoice"},
                {"key": "priority", "value": "high"},
            ],
            "tags": ["alpha", "beta"],
        }
    )
    second = EngineExecutionRequest.model_validate(reordered)
    now = datetime(2026, 1, 1, tzinfo=UTC)
    assert (
        dispatch_execution(first, wall_clock=lambda: now).output
        == dispatch_execution(second, wall_clock=lambda: now).output
    )


def test_foundation_processor_ignores_product_locale(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    vi = EngineExecutionRequest.model_validate(execution_payload(locale="vi-VN"))
    en = EngineExecutionRequest.model_validate(execution_payload(locale="en"))
    now = datetime(2026, 1, 1, tzinfo=UTC)
    assert (
        dispatch_execution(vi, wall_clock=lambda: now).output
        == dispatch_execution(en, wall_clock=lambda: now).output
    )
