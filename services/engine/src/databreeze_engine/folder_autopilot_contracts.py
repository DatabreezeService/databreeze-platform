"""Closed, content-free Folder Autopilot contracts shared by the engine boundary."""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)

MAX_AUTOPILOT_FILE_BYTES = 10 * 1024 * 1024 * 1024
MAX_PLAN_STEPS = 100
MAX_DESTINATIONS = 10_000
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")


def _invalid() -> ValueError:
    return ValueError("INVALID_OBSERVATION")


def _valid_name(value: str) -> bool:
    return (
        bool(value)
        and value not in {".", ".."}
        and "/" not in value
        and "\\" not in value
        and all(ord(character) >= 32 and ord(character) != 127 for character in value)
    )


def _tuple_from_json(value: Any) -> Any:
    return tuple(value) if isinstance(value, list) else value


class FileObservation(BaseModel):
    """A bounded, value-free identity for one locally observed file."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    observationId: StrictStr
    displayName: StrictStr = Field(min_length=1, max_length=255)
    sizeBytes: StrictInt = Field(ge=0, le=MAX_AUTOPILOT_FILE_BYTES)
    modifiedAtNs: StrictInt = Field(ge=0)
    contentSha256: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    stableExecutionKey: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("observationId")
    @classmethod
    def validate_observation_id(cls, value: str) -> str:
        if _SAFE_ID.fullmatch(value) is None:
            raise _invalid()
        return value

    @field_validator("displayName")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        if not _valid_name(value):
            raise _invalid()
        return value

    @field_validator("contentSha256", "stableExecutionKey")
    @classmethod
    def validate_digest(cls, value: str) -> str:
        if _DIGEST.fullmatch(value) is None:
            raise _invalid()
        return value


ActionType = Literal["INSPECT", "VALIDATE", "RENAME", "COPY", "MOVE"]
CollisionPolicy = Literal["REVIEW", "SKIP", "UNIQUE_NAME"]


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
    allowedOutputBindingIds: Annotated[tuple[StrictStr, ...], BeforeValidator(_tuple_from_json)] = (
        Field(min_length=1, max_length=20)
    )
    existingDestinations: Annotated[
        tuple[DestinationState, ...], BeforeValidator(_tuple_from_json)
    ] = Field(max_length=MAX_DESTINATIONS)
    steps: Annotated[tuple[PlanStep, ...], BeforeValidator(_tuple_from_json)] = Field(
        min_length=1, max_length=MAX_PLAN_STEPS
    )

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
