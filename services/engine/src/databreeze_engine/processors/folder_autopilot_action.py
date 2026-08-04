"""Reviewed read-only Folder Autopilot plan evaluator action."""

from __future__ import annotations

from typing import Any

from databreeze_engine.handler import ActionExecutionError, HandlerContext

from .folder_autopilot_plan import (
    AutopilotPlan,
    AutopilotPlanRequest,
    PlanEvaluationError,
    evaluate_autopilot_plan,
)

ACTION_TYPE = "folder-autopilot.plan-evaluate"
ACTION_VERSION = "1.0.0"
INPUT_SCHEMA_ID = "folder-autopilot.plan-request.v1"
OUTPUT_SCHEMA_ID = "folder-autopilot.plan-result.v1"


def handle(context: HandlerContext, parameters: Any) -> AutopilotPlan:
    """Evaluate only typed metadata; local file effects remain Desktop-owned."""
    if context.input_handles or not isinstance(parameters, AutopilotPlanRequest):
        raise ActionExecutionError("VALIDATION_FAILED")
    try:
        return evaluate_autopilot_plan(parameters)
    except PlanEvaluationError as error:
        raise ActionExecutionError(error.code) from None
