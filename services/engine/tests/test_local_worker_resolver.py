from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta

from databreeze_engine.dda_processor_digests import DDA_PROCESSOR_DIGESTS
from databreeze_engine.local_worker_resolver import LocalDashboardWidgetWorkloadResolver
from databreeze_engine.worker_client import WorkerClient


def _timestamp() -> str:
    return (
        (datetime.now(UTC) + timedelta(seconds=60))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


class LocalWorkerTransport:
    def __init__(self) -> None:
        self.input_content = b"label,value\nFood,10\nTravel,20\n"
        self.calls: list[tuple[str, str]] = []
        self.expiry = _timestamp()
        self.descriptor_hash = "a" * 64
        self.binding_hash = "b" * 64

        self.workload_without_hash = {
            "schemaVersion": 1,
            "workloadId": "30000000-0000-4000-8000-000000000001",
            "descriptorId": "30000000-0000-4000-8000-000000000002",
            "descriptorHash": self.descriptor_hash,
            "attemptId": "30000000-0000-4000-8000-000000000003",
            "attemptBindingHash": self.binding_hash,
            "tenantScope": {
                "scopeType": "workspace",
                "organizationId": "30000000-0000-4000-8000-000000000004",
                "workspaceId": "30000000-0000-4000-8000-000000000005",
            },
            "jobId": "30000000-0000-4000-8000-000000000006",
            "action": {
                "type": "dda.materialize.widget-result",
                "version": 1,
                "handlerDigest": DDA_PROCESSOR_DIGESTS["dda_materialize_query.py"],
                "inputSchemaId": "dda.dashboard-widget-result-parameters.v1",
                "outputSchemaId": "dda.dashboard-widget-result.v4",
                "requiredCapabilities": ["metadata.read"],
                "sideEffectClass": "NONE",
                "riskClass": "READ_ONLY",
            },
            "inputHandles": [
                {
                    "objectId": "30000000-0000-4000-8000-000000000007",
                    "schemaId": "dda.csv.v1",
                    "contentSha256": hashlib.sha256(self.input_content).hexdigest(),
                    "byteLength": len(self.input_content),
                }
            ],
            "inputManifestHash": "c" * 64,
            "parameters": {
                "engineVersion": "0.1.0",
                "dataMode": "Hybrid",
                "payloadClass": "APPROVED_DERIVED_RESULT",
                "dashboardId": "30000000-0000-4000-8000-00000000000f",
                "dashboardVersionId": "30000000-0000-4000-8000-000000000010",
                "permissionProjectionVersionId": "30000000-0000-4000-8000-000000000011",
                "policyVersionId": "30000000-0000-4000-8000-000000000012",
                "inputSelectorHash": "d" * 64,
                "timezone": "Asia/Ho_Chi_Minh",
                "widgetId": "30000000-0000-4000-8000-000000000008",
                "planVersionId": "30000000-0000-4000-8000-000000000009",
                "metricVersionId": "30000000-0000-4000-8000-00000000000a",
                "datasetVersionId": "30000000-0000-4000-8000-00000000000b",
                "unit": "đ",
                "resultState": "READY",
                "maximumRows": 20,
                "labelColumn": "label",
                "valueColumn": "value",
                "cellIds": [
                    "30000000-0000-4000-8000-00000000000c",
                    "30000000-0000-4000-8000-00000000000d",
                ],
                "evidenceRefs": ["30000000-0000-4000-8000-000000000007"],
            },
            "outputPolicy": {
                "outputObjectId": "30000000-0000-4000-8000-00000000000e",
                "maxBytes": 1_048_576,
                "mediaType": "application/json",
            },
            "deadline": "2099-01-01T00:10:00.000Z",
            "locale": "vi-VN",
            "timezone": "Asia/Ho_Chi_Minh",
            "subjectBindings": {
                "dashboardId": "30000000-0000-4000-8000-00000000000f",
                "dashboardVersionId": "30000000-0000-4000-8000-000000000010",
                "widgetId": "30000000-0000-4000-8000-000000000008",
                "planVersionId": "30000000-0000-4000-8000-000000000009",
                "metricVersionId": "30000000-0000-4000-8000-00000000000a",
                "datasetVersionId": "30000000-0000-4000-8000-00000000000b",
                "permissionProjectionVersionId": "30000000-0000-4000-8000-000000000011",
                "policyVersionId": "30000000-0000-4000-8000-000000000012",
                "locale": "vi-VN",
                "timezone": "Asia/Ho_Chi_Minh",
                "inputSelectorHash": "d" * 64,
                "engineVersion": "0.1.0",
                "handlerDigest": DDA_PROCESSOR_DIGESTS["dda_materialize_query.py"],
            },
            "createdAt": "2026-08-19T00:00:00.000Z",
        }
        self.workload = {
            **self.workload_without_hash,
            "canonicalHash": hashlib.sha256(
                json.dumps(
                    self.workload_without_hash,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    sort_keys=True,
                ).encode()
            ).hexdigest(),
        }

    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        del method
        self.calls.append(("json", path))
        if path.endswith("/claim"):
            return {
                "attemptId": self.workload["attemptId"],
                "jobId": self.workload["jobId"],
                "leaseExpiresAt": self.expiry,
                "revision": 2,
                "inputGrant": {
                    "grantType": "JOB_INPUT",
                    "attemptId": self.workload["attemptId"],
                    "jobId": self.workload["jobId"],
                    "workerId": "30000000-0000-4000-8000-000000000013",
                    "securityEpoch": 1,
                    "tenantScope": self.workload["tenantScope"],
                    "objectIds": [self.workload["inputHandles"][0]["objectId"]],
                    "expiresAt": self.expiry,
                    "capabilityId": "30000000-0000-4000-8000-000000000014",
                    "actions": ["READ"],
                    "maxBytes": 1_048_576,
                    "issuedAt": datetime.now(UTC)
                    .isoformat(timespec="milliseconds")
                    .replace("+00:00", "Z"),
                    "signedCapability": "input-capability",
                },
            }
        if path.endswith("/workload"):
            return self.workload
        if path.endswith("/results/prepare"):
            return {
                "schemaVersion": 4,
                "accepted": True,
                "submissionId": "30000000-0000-4000-8000-000000000015",
                "attemptId": self.workload["attemptId"],
                "descriptorBindingHash": self.descriptor_hash,
                "expiresAt": self.expiry,
                "outputs": [
                    {
                        "outputName": "widget-result",
                        "capabilityId": "30000000-0000-4000-8000-000000000016",
                        "objectId": "30000000-0000-4000-8000-000000000017",
                        "maxBytes": 1_048_576,
                        "allowedMediaTypes": ["application/json"],
                        "writeCapability": "output-capability",
                    }
                ],
            }
        if path.endswith("/internal/iae/worker/results/finalize"):
            return {
                "schemaVersion": 1,
                "accepted": True,
                "attestation": {
                    "attestationId": "30000000-0000-4000-8000-000000000019",
                    "contentSha256": payload["contentSha256"],
                    "contentLength": payload["contentLength"],
                    "mediaType": payload["mediaType"],
                },
            }
        if path.endswith("/internal/worker/results/finalize"):
            return {
                "schemaVersion": 4,
                "accepted": True,
                "submissionId": "30000000-0000-4000-8000-000000000015",
                "attemptId": self.workload["attemptId"],
                "resultManifestId": "30000000-0000-4000-8000-000000000018",
                "resultManifestHash": "e" * 64,
                "outcome": "SUCCEEDED",
                "revision": 5,
            }
        raise AssertionError(path)

    def request_bytes(
        self,
        method: str,
        path: str,
        headers: dict[str, str],
        body: bytes = b"",
        *,
        max_response_bytes: int = 64 * 1024 * 1024,
    ) -> tuple[bytes, dict[str, str]]:
        del max_response_bytes
        self.calls.append((method, path))
        if method == "GET":
            return self.input_content, {
                "x-content-sha256": hashlib.sha256(self.input_content).hexdigest(),
                "content-length": str(len(self.input_content)),
            }
        if method == "PUT":
            return (
                b'{"schemaVersion":1,"accepted":true,"receipt":{"contentLength":'
                + str(len(body)).encode()
                + b"}}",
                {"content-type": "application/json"},
            )
        raise AssertionError(path)


def test_local_dashboard_resolver_reads_csv_dispatches_typed_output_and_finalizes() -> None:
    transport = LocalWorkerTransport()
    client = WorkerClient("https://worker.internal", "worker-secret", transport)
    assignment = {
        "attemptId": transport.workload["attemptId"],
        "jobId": transport.workload["jobId"],
        "leaseToken": "lease-token-opaque-1234",
        "leaseExpiresAt": transport.expiry,
        "expectedRevision": 1,
        "descriptorId": transport.workload["descriptorId"],
        "descriptorHash": transport.descriptor_hash,
        "attemptBindingHash": transport.binding_hash,
        "action": transport.workload["action"],
    }

    LocalDashboardWidgetWorkloadResolver().execute(client, assignment)

    assert (
        "GET",
        "/internal/iae/worker/objects/30000000-0000-4000-8000-000000000007",
    ) in transport.calls
    assert (
        "PUT",
        "/internal/iae/worker/objects/30000000-0000-4000-8000-000000000017",
    ) in transport.calls
    assert ("json", "/internal/worker/results/prepare") in transport.calls
    assert ("json", "/internal/worker/results/finalize") in transport.calls
