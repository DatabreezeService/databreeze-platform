from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from databreeze_engine.dispatcher import dispatch_execution
from databreeze_engine.models import EngineExecutionRequest
from databreeze_engine.registry import default_registry


def _payload(action: dict[str, str]) -> dict[str, Any]:
    return {
        "protocolVersion": "1.0",
        "requestId": "00000000-0000-4000-8000-000000000101",
        "attemptId": "00000000-0000-4000-8000-000000000102",
        "correlation": {"correlationId": "00000000-0000-4000-8000-000000000103"},
        "action": action,
        "inputHandles": [],
        "outputHandle": {
            "handleId": "output-folder-plan",
            "byteLength": 1_048_576,
            "sha256": "b" * 64,
            "schemaId": "folder-autopilot.plan-result.v1",
        },
        "parameters": {
            "recipeVersionId": "recipe-001",
            "assignmentId": "assignment-001",
            "observation": {
                "observationId": "obs-001",
                "displayName": "invoice.csv",
                "sizeBytes": 12,
                "modifiedAtNs": 10,
                "contentSha256": "a" * 64,
                "stableExecutionKey": "c" * 64,
            },
            "allowedOutputBindingIds": ["binding-out"],
            "existingDestinations": [],
            "steps": [
                {
                    "stepId": "inspect",
                    "action": "INSPECT",
                    "collisionPolicy": "REVIEW",
                    "requiresApproval": False,
                }
            ],
        },
        "deadline": "2099-01-01T00:00:00Z",
        "locale": "vi-VN",
    }


def test_registry_exposes_content_free_folder_plan_action() -> None:
    manifest = next(
        manifest
        for manifest in default_registry().manifests
        if manifest.actionType == "folder-autopilot.plan-evaluate"
    )
    assert manifest.inputSchemaId == "folder-autopilot.plan-request.v1"
    assert manifest.outputSchemaId == "folder-autopilot.plan-result.v1"
    assert manifest.filesystemWritesPermitted is False
    assert manifest.networkPermitted is False
    assert manifest.externalProvidersPermitted is False


def test_dispatch_evaluates_typed_folder_plan_without_input_bytes() -> None:
    manifest = next(
        manifest
        for manifest in default_registry().manifests
        if manifest.actionType == "folder-autopilot.plan-evaluate"
    )
    request = EngineExecutionRequest.model_validate(
        _payload(
            {
                "type": manifest.actionType,
                "version": manifest.actionVersion,
                "handlerDigest": manifest.handlerDigest,
            }
        )
    )

    result = dispatch_execution(
        request,
        wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC),
        monotonic_clock=lambda: 1.0,
    )

    assert result.status == "SUCCEEDED"
    assert result.output.status == "READY"
    assert result.output.operations[0].action == "INSPECT"
