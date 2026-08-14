from __future__ import annotations

import json

from databreeze_engine.dispatcher import (
    DASHBOARD_WIDGET_OUTPUT_SCHEMA_ID,
    serialize_dashboard_widget_output,
    serialize_worker_output,
)
from databreeze_engine.models import (
    DashboardWidgetSubjectBindings,
    FoundationDigestResult,
    JsonWorkerOutput,
)
from databreeze_engine.processors.dda_materialize_query import (
    DdaWidgetMaterializationResult,
    DdaWidgetMaterializationRow,
    DdaWidgetResultProvenance,
)


def test_dispatcher_serializes_a_closed_typed_json_worker_output_without_paths() -> None:
    result = FoundationDigestResult(
        canonicalDigest="a" * 64,
        canonicalizationVersion="foundation-metadata-v1",
        itemCount=2,
        tagCount=1,
    )

    output = serialize_worker_output(
        result,
        output_name="primary",
        schema_id="foundation.metadata-digest-result.v1",
        source_lineage_hash="b" * 64,
    )

    assert isinstance(output, JsonWorkerOutput)
    assert output.content == (
        b'{"canonicalDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",'
        b'"canonicalizationVersion":"foundation-metadata-v1","itemCount":2,"tagCount":1}'
    )
    assert output.byte_length == len(output.content)
    assert (
        output.content_sha256 == "07a42c00bb00688589c29465191bf6c6e524afd05fc7f94121c259ad8524207f"
    )
    assert "path" not in output.model_dump(mode="json")
    assert "url" not in output.model_dump(mode="json")


def test_dashboard_widget_serializer_uses_one_closed_v4_artifact_with_exact_subject_bindings() -> (
    None
):
    widget_id = "50000000-0000-4000-8000-000000000001"
    plan_id = "50000000-0000-4000-8000-000000000002"
    metric_id = "50000000-0000-4000-8000-000000000003"
    dataset_id = "50000000-0000-4000-8000-000000000004"
    widget = DdaWidgetMaterializationResult(
        widgetId=widget_id,
        resultState="READY",
        rows=[
            DdaWidgetMaterializationRow(
                label="Doanh thu",
                displayValue="42 VND",
                numericValue=42.0,
                unit="VND",
                provenance=DdaWidgetResultProvenance(
                    resultCellId="50000000-0000-4000-8000-000000000005",
                    planVersionId=plan_id,
                    metricVersionId=metric_id,
                    datasetVersionId=dataset_id,
                    evidenceRefs=["50000000-0000-4000-8000-000000000006"],
                ),
            )
        ],
    )
    bindings = DashboardWidgetSubjectBindings(
        dashboardId="50000000-0000-4000-8000-000000000007",
        dashboardVersionId="50000000-0000-4000-8000-000000000008",
        widgetId=widget_id,
        planVersionId=plan_id,
        metricVersionId=metric_id,
        datasetVersionId=dataset_id,
        permissionProjectionVersionId="50000000-0000-4000-8000-000000000009",
        policyVersionId="50000000-0000-4000-8000-000000000010",
        locale="vi-VN",
        timezone="Asia/Ho_Chi_Minh",
        inputSelectorHash="a" * 64,
        engineVersion="0.1.0",
        handlerDigest="sha256:" + "b" * 64,
    )

    output = serialize_dashboard_widget_output(widget, subject_bindings=bindings)

    assert output.schemaId == DASHBOARD_WIDGET_OUTPUT_SCHEMA_ID
    assert output.outputName == "widget-result"
    artifact = json.loads(output.content)
    assert set(artifact) == {"schemaVersion", "kind", "widgetResult", "subjectBindings"}
    assert artifact["schemaVersion"] == 4
    assert artifact["kind"] == "DASHBOARD_WIDGET_RESULT"
    assert artifact["widgetResult"] == widget.model_dump(mode="json")
    assert artifact["subjectBindings"] == bindings.model_dump(mode="json")
    assert "attestation" not in output.content.decode()
    assert "objectId" not in output.content.decode()
