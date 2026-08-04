"""Bounded typed Folder Autopilot plan evaluation without filesystem side effects."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr, model_validator

from .folder_autopilot import ActionType, CollisionPolicy, FileObservation

MAX_PLAN_STEPS = 100
MAX_DESTINATIONS = 10_000
MAX_UNIQUE_NAME_ATTEMPTS = 1_000
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


def _valid_name(value: str) -> bool:
    return (
        bool(value)
        and value not in {".", ".."}
        and "/" not in value
        and "\\" not in value
        and all(ord(character) >= 32 and ord(character) != 127 for character in value)
    )


class PlanEvaluationError(ValueError):
    """Stable, content-free plan rejection."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class DestinationState(BaseModel):
    """Content-free occupancy state keyed by a Desktop-local output binding."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    bindingId: StrictStr = Field(min_length=1, max_length=128)
    displayName: StrictStr = Field(min_length=1, max_length=255)
    occupied: StrictBool

    @model_validator(mode="after")
    def validate_destination(self) -> DestinationState:
        if _SAFE_ID.fullmatch(self.bindingId) is None or not _valid_name(self.displayName):
            raise ValueError("INVALID_DESTINATION")
        return self


class PlanStep(BaseModel):
    """A single action from the closed Folder Autopilot action catalog."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    stepId: StrictStr = Field(min_length=1, max_length=128)
    action: ActionType
    destinationBindingId: StrictStr | None = Field(default=None, max_length=128)
    destinationName: StrictStr | None = Field(default=None, max_length=255)
    collisionPolicy: CollisionPolicy = "REVIEW"
    requiresApproval: StrictBool = False

    @model_validator(mode="after")
    def validate_shape(self) -> PlanStep:
        if _SAFE_ID.fullmatch(self.stepId) is None:
            raise ValueError("INVALID_STEP")
        writes_destination = self.action in {"RENAME", "COPY", "MOVE"}
        if writes_destination:
            if self.destinationBindingId is None or self.destinationName is None:
                raise ValueError("DESTINATION_REQUIRED")
            if _SAFE_ID.fullmatch(self.destinationBindingId) is None:
                raise ValueError("INVALID_DESTINATION_BINDING")
            if not _valid_name(self.destinationName):
                raise ValueError("INVALID_DESTINATION")
        elif self.destinationBindingId is not None or self.destinationName is not None:
            raise ValueError("DESTINATION_FORBIDDEN")
        return self


class AutopilotPlanRequest(BaseModel):
    """Local evaluator input; it carries IDs and names, never bytes or OS paths."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    recipeVersionId: StrictStr = Field(min_length=1, max_length=128)
    assignmentId: StrictStr = Field(min_length=1, max_length=128)
    observation: FileObservation
    allowedOutputBindingIds: tuple[StrictStr, ...] = Field(min_length=1, max_length=20)
    existingDestinations: tuple[DestinationState, ...] = Field(max_length=MAX_DESTINATIONS)
    steps: tuple[PlanStep, ...] = Field(min_length=1, max_length=MAX_PLAN_STEPS)

    @model_validator(mode="after")
    def validate_bindings_and_steps(self) -> AutopilotPlanRequest:
        if any(_SAFE_ID.fullmatch(binding) is None for binding in self.allowedOutputBindingIds):
            raise ValueError("INVALID_DESTINATION_BINDING")
        if len(set(self.allowedOutputBindingIds)) != len(self.allowedOutputBindingIds):
            raise ValueError("DUPLICATE_DESTINATION_BINDING")
        if len({step.stepId for step in self.steps}) != len(self.steps):
            raise ValueError("DUPLICATE_STEP")
        return self


class PlanOperation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    sequence: int = Field(ge=0, le=MAX_PLAN_STEPS)
    stepId: StrictStr
    action: ActionType
    sourceObservationId: StrictStr
    destinationBindingId: StrictStr | None = None
    destinationName: StrictStr | None = None
    requiresApproval: StrictBool


PlanStatus = Literal["READY", "REVIEW", "SKIPPED"]
PlanReason = Literal[
    "DESTINATION_COLLISION",
    "DESTINATION_COLLISION_SKIPPED",
    "MOVE_REQUIRES_APPROVAL",
]


class AutopilotPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    status: PlanStatus
    operations: tuple[PlanOperation, ...] = Field(max_length=MAX_PLAN_STEPS)
    reasonCodes: tuple[PlanReason, ...] = Field(max_length=MAX_PLAN_STEPS)
    planHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")


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
    status: PlanStatus,
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

    status: PlanStatus
    if review_required:
        status = "REVIEW"
    elif not operations and skipped:
        status = "SKIPPED"
    else:
        status = "READY"
    reason_tuple = tuple(dict.fromkeys(reason_codes))
    operation_tuple = tuple(operations)
    return AutopilotPlan(
        status=status,
        operations=operation_tuple,
        reasonCodes=reason_tuple,
        planHash=_plan_hash(request, status, operation_tuple, reason_tuple),
    )
