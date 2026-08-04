"""Bounded typed Folder Autopilot plan evaluation without filesystem side effects."""

from __future__ import annotations

import hashlib
import json

from ..folder_autopilot_contracts import (
    AutopilotPlan,
    AutopilotPlanRequest,
    CollisionPolicy,
    DestinationState,
    PlanOperation,
    PlanReason,
    PlanStep,
)

MAX_UNIQUE_NAME_ATTEMPTS = 1_000


class PlanEvaluationError(ValueError):
    """Stable, content-free plan rejection."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _unique_name(name: str, occupied: set[tuple[str, str]], binding_id: str) -> str | None:
    stem, separator, extension = name.rpartition(".")
    if not separator or not stem:
        stem, extension = name, ""
    suffix = f".{extension}" if extension else ""
    for index in range(1, MAX_UNIQUE_NAME_ATTEMPTS + 1):
        candidate = f"{stem} ({index}){suffix}"
        if (binding_id, candidate) not in occupied:
            return candidate
    return None


def _plan_hash(
    request: AutopilotPlanRequest,
    status: str,
    operations: tuple[PlanOperation, ...],
    reason_codes: tuple[PlanReason, ...],
) -> str:
    canonical = json.dumps(
        {
            "assignmentId": request.assignmentId,
            "observationKey": request.observation.stableExecutionKey,
            "operations": [operation.model_dump(mode="json") for operation in operations],
            "reasonCodes": reason_codes,
            "recipeVersionId": request.recipeVersionId,
            "status": status,
        },
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def evaluate_autopilot_plan(request: AutopilotPlanRequest) -> AutopilotPlan:
    """Evaluate a bounded typed plan without reading, writing, or shelling out."""
    occupied = {
        (destination.bindingId, destination.displayName)
        for destination in request.existingDestinations
        if destination.occupied
    }
    operations: list[PlanOperation] = []
    reason_codes: list[PlanReason] = []
    review_required = False
    skipped = False

    for sequence, step in enumerate(request.steps):
        if step.action in {"INSPECT", "VALIDATE"}:
            operations.append(
                PlanOperation(
                    sequence=sequence,
                    stepId=step.stepId,
                    action=step.action,
                    sourceObservationId=request.observation.observationId,
                    requiresApproval=step.requiresApproval,
                )
            )
            review_required = review_required or step.requiresApproval
            continue

        binding_id = step.destinationBindingId
        destination_name = step.destinationName
        if binding_id is None or destination_name is None:
            raise PlanEvaluationError("DESTINATION_REQUIRED")
        if binding_id not in request.allowedOutputBindingIds:
            raise PlanEvaluationError("DESTINATION_BINDING_NOT_ALLOWED")

        requested_key = (binding_id, destination_name)
        collision_review = False
        if requested_key in occupied:
            if step.collisionPolicy == "REVIEW":
                collision_review = True
                review_required = True
                reason_codes.append("DESTINATION_COLLISION")
            elif step.collisionPolicy == "SKIP":
                skipped = True
                reason_codes.append("DESTINATION_COLLISION_SKIPPED")
                continue
            else:
                destination_name = _unique_name(destination_name, occupied, binding_id)
                if destination_name is None:
                    raise PlanEvaluationError("UNIQUE_NAME_EXHAUSTED")

        requires_approval = step.requiresApproval or step.action == "MOVE" or collision_review
        if step.action == "MOVE" and not step.requiresApproval:
            reason_codes.append("MOVE_REQUIRES_APPROVAL")
        review_required = review_required or requires_approval
        operation = PlanOperation(
            sequence=sequence,
            stepId=step.stepId,
            action=step.action,
            sourceObservationId=request.observation.observationId,
            destinationBindingId=binding_id,
            destinationName=destination_name,
            requiresApproval=requires_approval,
        )
        operations.append(operation)
        occupied.add((binding_id, destination_name))

    status = "REVIEW" if review_required else "SKIPPED" if not operations and skipped else "READY"
    reason_tuple = tuple(dict.fromkeys(reason_codes))
    operation_tuple = tuple(operations)
    return AutopilotPlan(
        status=status,
        operations=operation_tuple,
        reasonCodes=reason_tuple,
        planHash=_plan_hash(request, status, operation_tuple, reason_tuple),
    )


__all__ = [
    "AutopilotPlan",
    "AutopilotPlanRequest",
    "CollisionPolicy",
    "DestinationState",
    "PlanEvaluationError",
    "PlanOperation",
    "PlanStep",
    "evaluate_autopilot_plan",
]
