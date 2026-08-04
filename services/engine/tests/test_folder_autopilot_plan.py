from __future__ import annotations

import pytest

from databreeze_engine.processors.folder_autopilot import build_file_observation
from databreeze_engine.processors.folder_autopilot_plan import (
    AutopilotPlanRequest,
    CollisionPolicy,
    DestinationState,
    PlanEvaluationError,
    PlanStep,
    evaluate_autopilot_plan,
)


def _observation():
    return build_file_observation(
        observation_id="obs-001",
        display_name="invoice.csv",
        size_bytes=12,
        modified_at_ns="10",
        content_sha256="a" * 64,
    )


def _request(*steps: PlanStep, destinations: tuple[DestinationState, ...] = ()):
    return AutopilotPlanRequest(
        recipeVersionId="recipe-001",
        assignmentId="assignment-001",
        observation=_observation(),
        allowedOutputBindingIds=("binding-out",),
        existingDestinations=destinations,
        steps=steps,
    )


def test_evaluator_returns_typed_deterministic_operations_and_hash() -> None:
    request = _request(
        PlanStep(stepId="inspect", action="INSPECT"),
        PlanStep(stepId="validate", action="VALIDATE"),
        PlanStep(
            stepId="rename",
            action="RENAME",
            destinationBindingId="binding-out",
            destinationName="invoice-reviewed.csv",
        ),
    )

    first = evaluate_autopilot_plan(request)
    second = evaluate_autopilot_plan(request)

    assert first.status == "READY"
    assert [operation.action for operation in first.operations] == [
        "INSPECT",
        "VALIDATE",
        "RENAME",
    ]
    assert first.operations[-1].destinationName == "invoice-reviewed.csv"
    assert first.planHash == second.planHash
    assert first.operations == second.operations


@pytest.mark.parametrize("policy", ["REVIEW", "SKIP", "UNIQUE_NAME"])
def test_collision_policy_is_explicit_and_never_overwrites(policy: CollisionPolicy) -> None:
    step = PlanStep(
        stepId="copy",
        action="COPY",
        destinationBindingId="binding-out",
        destinationName="invoice.csv",
        collisionPolicy=policy,
    )
    request = _request(
        step,
        destinations=(
            DestinationState(bindingId="binding-out", displayName="invoice.csv", occupied=True),
        ),
    )

    result = evaluate_autopilot_plan(request)

    if policy == "REVIEW":
        assert result.status == "REVIEW"
        assert result.operations[0].requiresApproval is True
        assert "DESTINATION_COLLISION" in result.reasonCodes
    elif policy == "SKIP":
        assert result.status == "SKIPPED"
        assert result.operations == ()
        assert result.reasonCodes == ("DESTINATION_COLLISION_SKIPPED",)
    else:
        assert result.status == "READY"
        assert result.operations[0].destinationName == "invoice (1).csv"
        assert result.operations[0].requiresApproval is False


def test_unique_name_generation_is_bounded_and_deterministic() -> None:
    step = PlanStep(
        stepId="copy",
        action="COPY",
        destinationBindingId="binding-out",
        destinationName="invoice.csv",
        collisionPolicy="UNIQUE_NAME",
    )
    occupied = tuple(
        [
            DestinationState(bindingId="binding-out", displayName="invoice.csv", occupied=True),
            *(
                DestinationState(
                    bindingId="binding-out", displayName=f"invoice ({i}).csv", occupied=True
                )
                for i in range(1, 101)
            ),
        ]
    )

    result = evaluate_autopilot_plan(_request(step, destinations=occupied))

    assert result.status == "READY"
    assert result.operations[0].destinationName == "invoice (101).csv"


def test_destination_collisions_use_windows_case_folding() -> None:
    result = evaluate_autopilot_plan(
        _request(
            PlanStep(
                stepId="copy-case",
                action="COPY",
                destinationBindingId="binding-out",
                destinationName="Invoice.csv",
                collisionPolicy="REVIEW",
            ),
            destinations=(
                DestinationState(bindingId="binding-out", displayName="invoice.csv", occupied=True),
            ),
        )
    )
    assert result.status == "REVIEW"
    assert "DESTINATION_COLLISION" in result.reasonCodes


def test_unique_name_generation_preserves_the_255_character_contract_limit() -> None:
    name = f"{'a' * 251}.csv"
    result = evaluate_autopilot_plan(
        _request(
            PlanStep(
                stepId="copy-long",
                action="COPY",
                destinationBindingId="binding-out",
                destinationName=name,
                collisionPolicy="UNIQUE_NAME",
            ),
            destinations=(
                DestinationState(bindingId="binding-out", displayName=name, occupied=True),
            ),
        )
    )
    assert result.status == "READY"
    assert result.operations[0].destinationName is not None
    assert len(result.operations[0].destinationName) <= 255


def test_evaluator_rejects_unbound_destinations_and_untyped_actions() -> None:
    with pytest.raises(PlanEvaluationError, match="DESTINATION_BINDING_NOT_ALLOWED"):
        evaluate_autopilot_plan(
            _request(
                PlanStep(
                    stepId="move",
                    action="MOVE",
                    destinationBindingId="other-binding",
                    destinationName="invoice.csv",
                )
            )
        )

    with pytest.raises(ValueError):
        PlanStep(stepId="shell", action="RUN_SHELL")


def test_evaluator_rejects_unbounded_steps_and_path_like_destination_names() -> None:
    with pytest.raises(ValueError):
        AutopilotPlanRequest(
            recipeVersionId="recipe-001",
            assignmentId="assignment-001",
            observation=_observation(),
            allowedOutputBindingIds=("binding-out",),
            existingDestinations=(),
            steps=tuple(PlanStep(stepId=f"step-{i}", action="INSPECT") for i in range(101)),
        )

    with pytest.raises(ValueError):
        PlanStep(
            stepId="rename",
            action="RENAME",
            destinationBindingId="binding-out",
            destinationName="..\\escape.txt",
        )
