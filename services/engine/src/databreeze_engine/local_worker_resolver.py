"""Local execution resolver for the approved dashboard widget path.

This adapter intentionally handles one reviewed action.  It obtains the CSV
bytes and every execution parameter from the authenticated workload, builds the
same typed engine request used by cloud workers, and returns only a typed
result artifact.  It never accepts browser values, filesystem paths, or object
storage locators.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
from collections.abc import Mapping
from threading import Event
from typing import Literal, cast

from databreeze_contracts.v1 import CorrelationMetadata
from databreeze_contracts.v4 import PreparedOutput
from pydantic import ValidationError

from .dispatcher import (
    DASHBOARD_WIDGET_OUTPUT_SCHEMA_ID,
    dispatch_execution,
    serialize_dashboard_widget_output,
)
from .models import (
    ActionReference,
    DashboardWidgetSubjectBindings,
    EngineExecutionRequest,
    EngineResult,
    JsonWorkerOutput,
    OpaqueHandle,
)
from .processors.dda_materialize_query import (
    DdaWidgetMaterializationInput,
    DdaWidgetMaterializationResult,
)
from .worker_client import WorkerClient, WorkerClientError

LOCAL_WIDGET_ACTION = "dda.materialize.widget-result"
LOCAL_WIDGET_OUTPUT_SCHEMA = DASHBOARD_WIDGET_OUTPUT_SCHEMA_ID
LOCAL_WIDGET_PARAMETER_KEYS = {
    "widgetId",
    "planVersionId",
    "metricVersionId",
    "datasetVersionId",
    "unit",
    "resultState",
    "maximumRows",
    "labelColumn",
    "valueColumn",
    "cellIds",
    "evidenceRefs",
}
LOCAL_LINEAGE_PARAMETER_KEYS = {
    "engineVersion",
    "dataMode",
    "payloadClass",
}
LOCAL_SUBJECT_BINDING_PARAMETER_KEYS = {
    "dashboardId",
    "dashboardVersionId",
    "permissionProjectionVersionId",
    "policyVersionId",
    "inputSelectorHash",
    "timezone",
}
LOCAL_WORKLOAD_PARAMETER_KEYS = (
    LOCAL_WIDGET_PARAMETER_KEYS
    | LOCAL_LINEAGE_PARAMETER_KEYS
    | LOCAL_SUBJECT_BINDING_PARAMETER_KEYS
)


def _string_parameter(parameters: Mapping[str, object], key: str) -> str:
    value = parameters.get(key)
    if not isinstance(value, str) or not value:
        raise WorkerClientError("local widget workload parameters are invalid")
    return value


def _column_parameter(parameters: Mapping[str, object], key: str) -> str:
    value = _string_parameter(parameters, key)
    if len(value) > 128 or "\n" in value or "\r" in value:
        raise WorkerClientError("local widget workload parameters are invalid")
    return value


def _bounded_ids(parameters: Mapping[str, object]) -> list[str]:
    values = parameters.get("cellIds")
    if not isinstance(values, list) or len(values) > 1000:
        raise WorkerClientError("local widget workload parameters are invalid")
    if any(not isinstance(value, str) or not value for value in values):
        raise WorkerClientError("local widget workload parameters are invalid")
    return cast(list[str], values)


def _evidence_refs(parameters: Mapping[str, object]) -> list[str]:
    values = parameters.get("evidenceRefs")
    if not isinstance(values, list) or len(values) > 32:
        raise WorkerClientError("local widget workload parameters are invalid")
    if any(not isinstance(value, str) or not value or len(value) > 512 for value in values):
        raise WorkerClientError("local widget workload parameters are invalid")
    return cast(list[str], values)


def _subject_bindings(
    workload: Mapping[str, object], parameters: Mapping[str, object]
) -> DashboardWidgetSubjectBindings:
    """Build the proof binding from the immutable flat workload fields.

    The local workload contract intentionally keeps execution parameters flat;
    accepting a worker-supplied nested binding would create a second authority
    surface. The server-owned action/locale plus the validated parameters are
    the only inputs used here.
    """
    action = workload.get("action")
    if not isinstance(action, dict):
        raise WorkerClientError("local worker subject bindings are unavailable")
    values: dict[str, object] = {
        "dashboardId": parameters.get("dashboardId"),
        "dashboardVersionId": parameters.get("dashboardVersionId"),
        "widgetId": parameters.get("widgetId"),
        "planVersionId": parameters.get("planVersionId"),
        "metricVersionId": parameters.get("metricVersionId"),
        "datasetVersionId": parameters.get("datasetVersionId"),
        "permissionProjectionVersionId": parameters.get("permissionProjectionVersionId"),
        "policyVersionId": parameters.get("policyVersionId"),
        "locale": workload.get("locale"),
        "timezone": parameters.get("timezone"),
        "inputSelectorHash": parameters.get("inputSelectorHash"),
        "engineVersion": parameters.get("engineVersion"),
        "handlerDigest": action.get("handlerDigest"),
    }
    try:
        return DashboardWidgetSubjectBindings.model_validate(values)
    except ValidationError as error:
        raise WorkerClientError("local worker subject bindings are invalid") from error


def _numeric(value: object) -> float:
    if not isinstance(value, str) or not value.strip():
        raise WorkerClientError("local widget input contains an invalid number")
    try:
        parsed = float(value.strip())
    except ValueError as error:
        raise WorkerClientError("local widget input contains an invalid number") from error
    if not math.isfinite(parsed):
        raise WorkerClientError("local widget input contains an invalid number")
    return parsed


def _widget_parameters(
    parameters: Mapping[str, object],
    content: bytes,
) -> DdaWidgetMaterializationInput:
    if set(parameters) != LOCAL_WORKLOAD_PARAMETER_KEYS:
        raise WorkerClientError("local widget workload parameters are invalid")
    if parameters.get("engineVersion") != "0.1.0":
        raise WorkerClientError("local widget workload parameters are invalid")
    if parameters.get("dataMode") not in {"Hybrid", "CLOUD"}:
        raise WorkerClientError("local widget workload parameters are invalid")
    if parameters.get("payloadClass") != "APPROVED_DERIVED_RESULT":
        raise WorkerClientError("local widget workload parameters are invalid")
    for key in LOCAL_SUBJECT_BINDING_PARAMETER_KEYS:
        _string_parameter(parameters, key)
    label_column = _column_parameter(parameters, "labelColumn")
    value_column = _column_parameter(parameters, "valueColumn")
    cell_ids = _bounded_ids(parameters)
    evidence_refs = _evidence_refs(parameters)
    maximum_rows = parameters.get("maximumRows")
    if (
        isinstance(maximum_rows, bool)
        or not isinstance(maximum_rows, int)
        or maximum_rows < 1
        or maximum_rows > 1000
    ):
        raise WorkerClientError("local widget workload parameters are invalid")
    try:
        text = content.decode("utf-8-sig", "strict")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        if (
            reader.fieldnames is None
            or label_column not in reader.fieldnames
            or value_column not in reader.fieldnames
        ):
            raise WorkerClientError("local widget input columns are unavailable")
        rows = list(reader)
    except UnicodeDecodeError as error:
        raise WorkerClientError("local widget input is not UTF-8 CSV") from error
    except csv.Error as error:
        raise WorkerClientError("local widget input is malformed CSV") from error
    if len(rows) > len(cell_ids):
        raise WorkerClientError("local widget workload cell bindings are insufficient")
    result_state = parameters.get("resultState")
    if len(rows) > maximum_rows:
        if result_state != "TRUNCATED":
            raise WorkerClientError("local widget result state is invalid")
        rows = rows[:maximum_rows]
    elif (len(rows) == 0 and result_state != "EMPTY") or (
        len(rows) > 0 and result_state == "EMPTY"
    ):
        raise WorkerClientError("local widget result state is invalid")
    cells: list[dict[str, object]] = []
    for index, row in enumerate(rows):
        label = row.get(label_column)
        if not isinstance(label, str) or not label.strip() or len(label) > 512:
            raise WorkerClientError("local widget input contains an invalid label")
        cells.append(
            {
                "resultCellId": cell_ids[index],
                "label": label.strip(),
                "numericValue": _numeric(row.get(value_column)),
                "evidenceRefs": evidence_refs,
            }
        )
    try:
        return DdaWidgetMaterializationInput.model_validate(
            {
                "widgetId": _string_parameter(parameters, "widgetId"),
                "planVersionId": _string_parameter(parameters, "planVersionId"),
                "metricVersionId": _string_parameter(parameters, "metricVersionId"),
                "datasetVersionId": _string_parameter(parameters, "datasetVersionId"),
                "unit": _string_parameter(parameters, "unit"),
                "resultState": result_state,
                "maximumRows": maximum_rows,
                "rows": cells,
            }
        )
    except ValidationError as error:
        raise WorkerClientError("local widget workload parameters are invalid") from error


def _engine_request(
    workload: Mapping[str, object],
    parameters: DdaWidgetMaterializationInput,
) -> EngineExecutionRequest:
    action = workload.get("action")
    if not isinstance(action, dict) or action.get("type") != LOCAL_WIDGET_ACTION:
        raise WorkerClientError("local worker action is not supported")
    version = action.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise WorkerClientError("local worker action is invalid")
    handles_value = workload.get("inputHandles")
    if not isinstance(handles_value, list) or len(handles_value) != 1:
        raise WorkerClientError("local worker input handles are invalid")
    handle = handles_value[0]
    if not isinstance(handle, dict):
        raise WorkerClientError("local worker input handle is invalid")
    output_policy = workload.get("outputPolicy")
    if not isinstance(output_policy, dict):
        raise WorkerClientError("local worker output policy is invalid")
    action_digest = action.get("handlerDigest")
    input_schema = handle.get("schemaId")
    output_schema = action.get("outputSchemaId")
    object_id = handle.get("objectId")
    output_object_id = output_policy.get("outputObjectId")
    if not all(
        isinstance(value, str)
        for value in (action_digest, input_schema, output_schema, object_id, output_object_id)
    ):
        raise WorkerClientError("local worker action bindings are invalid")
    max_output = output_policy.get("maxBytes")
    if isinstance(max_output, bool) or not isinstance(max_output, int) or max_output < 1:
        raise WorkerClientError("local worker output policy is invalid")
    try:
        input_handle = OpaqueHandle(
            handleId=cast(str, object_id),
            byteLength=cast(int, handle.get("byteLength")),
            sha256=cast(str, handle.get("contentSha256")),
            schemaId=cast(str, input_schema),
        )
        # The server policy may be broader than the closed action manifest. The
        # widget processor is currently capped at 1 MiB; advertise that effective
        # engine limit to the dispatcher so a valid 4 MiB transfer policy does not
        # fail before the handler runs.
        output_handle = OpaqueHandle(
            handleId=cast(str, output_object_id),
            byteLength=min(max_output, 1024 * 1024),
            sha256="0" * 64,
            schemaId=cast(str, output_schema),
        )
        return EngineExecutionRequest(
            protocolVersion="1.0",
            requestId=cast(str, workload["attemptId"]),
            attemptId=cast(str, workload["attemptId"]),
            correlation=CorrelationMetadata(correlationId=cast(str, workload["attemptId"])),
            action=ActionReference(
                type=LOCAL_WIDGET_ACTION,
                version=f"{version}.0.0",
                handlerDigest=cast(str, action_digest),
            ),
            inputHandles=[input_handle],
            outputHandle=output_handle,
            parameters=parameters,
            deadline=cast(str, workload["deadline"]),
            locale=cast(Literal["vi-VN", "en"], workload["locale"]),
        )
    except (ValidationError, KeyError, TypeError) as error:
        raise WorkerClientError("local worker execution request is invalid") from error


class LocalDashboardWidgetWorkloadResolver:
    """Execute the server-authored local dashboard widget workload."""

    def execute(self, client: object, assignment: dict[str, object]) -> None:
        if not isinstance(client, WorkerClient):
            raise WorkerClientError("local worker client is unavailable")
        WorkerClient._verify_assignment_registry(assignment)
        attempt_id = assignment.get("attemptId")
        lease_token = assignment.get("leaseToken")
        expected_revision = assignment.get("expectedRevision")
        descriptor_id = assignment.get("descriptorId")
        descriptor_hash = assignment.get("descriptorHash")
        attempt_binding_hash = assignment.get("attemptBindingHash")
        if (
            not all(
                isinstance(value, str)
                for value in (
                    attempt_id,
                    lease_token,
                    descriptor_id,
                    descriptor_hash,
                    attempt_binding_hash,
                )
            )
            or isinstance(expected_revision, bool)
            or not isinstance(expected_revision, int)
        ):
            raise WorkerClientError("local worker assignment binding is unavailable")

        def process(
            grant: dict[str, object],
            cancellation: Event,
            workload: dict[str, object],
        ) -> tuple[JsonWorkerOutput, ...]:
            if cancellation.is_set():
                raise WorkerClientError("worker lease was lost")
            signed_capability = grant.get("signedCapability")
            object_ids = grant.get("objectIds")
            handles = workload.get("inputHandles")
            if (
                not isinstance(signed_capability, str)
                or not isinstance(object_ids, list)
                or not isinstance(handles, list)
            ):
                raise WorkerClientError("local worker input grant is unavailable")
            if len(handles) != 1 or not isinstance(handles[0], dict):
                raise WorkerClientError("local worker input grant is unavailable")
            if handles[0].get("objectId") not in object_ids:
                raise WorkerClientError("local worker input grant is unavailable")
            handle = cast(dict[str, object], handles[0])
            content, digest = client.read_object(
                object_id=cast(str, handle["objectId"]),
                signed_capability=signed_capability,
                attempt_id=cast(str, attempt_id),
                max_bytes=cast(int, handle["byteLength"]),
            )
            if digest != handle.get("contentSha256") or len(content) != handle.get("byteLength"):
                raise WorkerClientError("local worker input binding mismatch")
            typed_parameters = _widget_parameters(
                cast(Mapping[str, object], workload["parameters"]), content
            )
            request = _engine_request(workload, typed_parameters)
            dispatched = dispatch_execution(request)
            if not isinstance(dispatched, EngineResult) or not isinstance(
                dispatched.output, DdaWidgetMaterializationResult
            ):
                raise WorkerClientError("local worker result is invalid")
            subject_bindings = _subject_bindings(
                workload, cast(Mapping[str, object], workload["parameters"])
            )
            workload_parameters = cast(Mapping[str, object], workload["parameters"])
            source_object_ids = [
                cast(str, value["objectId"])
                for value in handles
                if isinstance(value, dict) and isinstance(value.get("objectId"), str)
            ]
            processor_version = workload_parameters.get("engineVersion")
            if not source_object_ids or not isinstance(processor_version, str):
                raise WorkerClientError("local worker lineage binding is unavailable")
            source_lineage_hash = hashlib.sha256(
                json.dumps(
                    {
                        "sourceArtifactVersionIds": source_object_ids,
                        "processorVersion": processor_version,
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest()
            return (
                serialize_dashboard_widget_output(
                    dispatched.output,
                    subject_bindings=subject_bindings,
                    source_lineage_hash=source_lineage_hash,
                ),
            )

        def transfer(policy: PreparedOutput, output: JsonWorkerOutput, submission_id: str) -> str:
            object_id = policy.objectId
            signed_capability = policy.writeCapability
            client.write_object(
                object_id=object_id,
                signed_capability=signed_capability,
                attempt_id=cast(str, attempt_id),
                content=output.content,
                media_type=output.media_type,
            )
            return client.finalize_object(
                submission_id=submission_id,
                signed_capability=signed_capability,
                attempt_id=cast(str, attempt_id),
                execution_descriptor_id=cast(str, descriptor_id),
                object_id=object_id,
                content_sha256=output.content_sha256,
                content_length=output.byte_length,
                media_type=output.media_type,
            )

        result = client.run_result_v2(
            cast(str, attempt_id),
            cast(str, lease_token),
            expected_revision,
            process,
            transfer,
            prepare_idempotency_key=f"local-result-prepare-{attempt_id}",
            finalize_idempotency_key=f"local-result-finalize-{attempt_id}",
            descriptor_id=cast(str, descriptor_id),
            descriptor_hash=cast(str, descriptor_hash),
            attempt_binding_hash=cast(str, attempt_binding_hash),
        )
        if result.accepted is not True or result.outcome != "SUCCEEDED":
            raise WorkerClientError("local worker result was not accepted")
