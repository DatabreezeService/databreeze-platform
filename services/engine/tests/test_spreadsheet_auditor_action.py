from __future__ import annotations

import hashlib
import io
import zipfile
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest

from databreeze_engine.dispatcher import EngineDispatchError, dispatch_execution
from databreeze_engine.models import EngineExecutionRequest, SpreadsheetAuditProcessorResult
from databreeze_engine.registry import default_registry


def _workbook() -> bytes:
    workbook = (
        b'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        b'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        b'<sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    relationships = (
        b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        b'<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
    )
    sheet = (
        b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        b'<sheetData><row r="1">'
        b'<c r="A1"><f>SUM(B1:C1)</f><v>3</v></c>'
        b'<c r="B1"><f>SUM(B1:C1)</f><v>3</v></c>'
        b'<c r="C1"><f>SUM(B1:D1)</f><v>4</v></c>'
        b"</row></sheetData></worksheet>"
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", relationships)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
    return output.getvalue()


def _manifest():
    return next(
        manifest
        for manifest in default_registry().manifests
        if manifest.actionType == "spreadsheet-auditor.audit"
    )


def _request(
    execution_payload: Callable[..., dict[str, Any]], content: bytes, **overrides: Any
) -> EngineExecutionRequest:
    manifest = _manifest()
    payload = execution_payload()
    payload.update(
        {
            "action": {
                "type": manifest.actionType,
                "version": manifest.actionVersion,
                "handlerDigest": manifest.handlerDigest,
            },
            "inputHandles": [
                {
                    "handleId": "workbook-input",
                    "byteLength": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "schemaId": manifest.inputSchemaId,
                }
            ],
            "outputHandle": {
                "handleId": "audit-output",
                "byteLength": 1024 * 1024,
                "sha256": "b" * 64,
                "schemaId": manifest.outputSchemaId,
            },
            "parameters": {
                "schemaVersion": 1,
                "artifactVersionId": "11111111-1111-4111-8111-111111111111",
                "jobId": "22222222-2222-4222-8222-222222222222",
                "resultManifestId": "33333333-3333-4333-8333-333333333333",
            },
        }
    )
    payload.update(overrides)
    return EngineExecutionRequest.model_validate(payload)


def test_registry_exposes_a_read_only_spreadsheet_auditor_action() -> None:
    manifest = _manifest()
    assert manifest.inputSchemaId == "spreadsheet-auditor.workbook.v1"
    assert manifest.outputSchemaId == "spreadsheet-auditor.result.v1"
    assert manifest.requiredCapabilities == ("artifact.read",)
    assert manifest.sideEffectClass == "NONE"
    assert manifest.riskClass == "READ_ONLY"
    assert manifest.filesystemWritesPermitted is False
    assert manifest.networkPermitted is False
    assert manifest.externalProvidersPermitted is False


def test_dispatch_runs_auditor_against_one_hash_bound_opaque_input(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    content = _workbook()
    request = _request(execution_payload, content)
    result = dispatch_execution(
        request,
        wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC),
        input_reader=lambda _handle: content,
    )

    assert isinstance(result.output, SpreadsheetAuditProcessorResult)
    assert result.output.artifactVersionId == "11111111-1111-4111-8111-111111111111"
    assert result.output.jobId == "22222222-2222-4222-8222-222222222222"
    assert result.output.resultManifestId == "33333333-3333-4333-8333-333333333333"
    assert result.output.sheets[0].name == "Inventory"
    assert result.output.findings[0].address == "C1"
    assert "SUM(B1:D1)" not in result.model_dump_json()


def test_dispatch_fails_closed_when_auditor_input_is_unavailable(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    request = _request(execution_payload, _workbook())
    with pytest.raises(EngineDispatchError, match="INPUT_UNAVAILABLE"):
        dispatch_execution(request, wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC))


def test_dispatch_rejects_auditor_input_hash_mismatch(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    content = _workbook()
    request = _request(execution_payload, content)
    with pytest.raises(EngineDispatchError, match="INPUT_HASH_MISMATCH"):
        dispatch_execution(
            request,
            wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC),
            input_reader=lambda _handle: b"changed workbook",
        )


def test_dispatch_rejects_malformed_workbook_without_exposing_parser_details(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    content = b"not an xlsx archive"
    request = _request(execution_payload, content)
    with pytest.raises(EngineDispatchError, match="VALIDATION_FAILED"):
        dispatch_execution(
            request,
            wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC),
            input_reader=lambda _handle: content,
        )


def test_dispatch_rejects_wrong_handle_schema_and_parameter_shape(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    content = _workbook()
    manifest = _manifest()
    request = _request(
        execution_payload,
        content,
        inputHandles=[
            {
                "handleId": "workbook-input",
                "byteLength": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
                "schemaId": "foundation.metadata-fixture.v1",
            }
        ],
    )
    with pytest.raises(EngineDispatchError, match="VALIDATION_FAILED"):
        dispatch_execution(
            request,
            wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC),
            input_reader=lambda _handle: content,
        )

    payload = execution_payload(
        action={
            "type": manifest.actionType,
            "version": manifest.actionVersion,
            "handlerDigest": manifest.handlerDigest,
        }
    )
    mismatched = EngineExecutionRequest.model_validate(payload)
    with pytest.raises(EngineDispatchError, match="VALIDATION_FAILED"):
        dispatch_execution(
            mismatched,
            wall_clock=lambda: datetime(2026, 1, 1, tzinfo=UTC),
            input_reader=lambda _handle: content,
        )
