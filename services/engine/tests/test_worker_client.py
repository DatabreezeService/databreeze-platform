from __future__ import annotations

import hashlib
import json
import time
from datetime import UTC, datetime, timedelta
from threading import Event

import pytest

from databreeze_engine.models import JsonWorkerOutput
from databreeze_engine.registry import REVIEWED_METADATA_HANDLER_DIGEST
from databreeze_engine.worker_client import MAX_LEASE_SECONDS, WorkerClient, WorkerClientError


class FakeTransport:
    def __init__(self, heartbeat_error: Exception | None = None) -> None:
        self.heartbeat_error = heartbeat_error
        self.calls: list[tuple[str, str, dict[str, object]]] = []
        self.heartbeat_revision = 2
        self.claim_expiry = (
            (datetime.now(UTC) + timedelta(seconds=60))
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )

    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        self.calls.append((method, path, payload))
        if path.endswith("/heartbeat") and self.heartbeat_error:
            raise self.heartbeat_error
        if path.endswith("/claim"):
            return {
                "attemptId": "a",
                "jobId": "j",
                "leaseExpiresAt": self.claim_expiry,
                "revision": 2,
                "inputGrant": {
                    "grantType": "JOB_INPUT",
                    "attemptId": "a",
                    "jobId": "j",
                    "workerId": "w",
                    "securityEpoch": 4,
                    "tenantScope": {
                        "scopeType": "workspace",
                        "organizationId": "organization-1",
                        "workspaceId": "workspace-1",
                    },
                    "objectIds": ["object-1"],
                    "expiresAt": self.claim_expiry,
                },
            }
        if path.endswith("/heartbeat"):
            self.heartbeat_revision += 1
            return {
                "attemptId": "a",
                "revision": self.heartbeat_revision,
                "leaseExpiresAt": payload["nextLeaseExpiresAt"],
            }
        return {"attemptId": "a", "revision": 4, "outcome": "SUCCEEDED", "resultReferences": []}


class StatusTransportError(WorkerClientError):
    def __init__(self, status_code: int, problem_code: str = "WORKER_ATTEMPT_REJECTED") -> None:
        super().__init__(f"worker HTTP {status_code}")
        self.status_code = status_code
        self.problem_code = problem_code


class StatusTransport:
    def __init__(self, error: Exception) -> None:
        self.error = error
        self.calls = 0

    def request(self, _method: str, _path: str, _payload: dict[str, object]) -> dict[str, object]:
        self.calls += 1
        raise self.error


class CompletionRaceTransport(FakeTransport):
    def __init__(self) -> None:
        super().__init__()
        self.complete_started = Event()
        self.heartbeat_after_complete = 0

    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        if path.endswith("/heartbeat") and self.complete_started.is_set():
            self.heartbeat_after_complete += 1
        if path.endswith("/complete"):
            self.complete_started.set()
            time.sleep(0.05)
        return super().request(method, path, payload)


class AssignmentTransport(FakeTransport):
    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        if path.endswith("/assignment"):
            self.calls.append((method, path, payload))
            return {
                "assignment": {
                    "attemptId": "attempt-1",
                    "jobId": "job-1",
                    "leaseToken": "lease-token-1",
                    "leaseExpiresAt": (datetime.now(UTC) + timedelta(seconds=60))
                    .isoformat(timespec="milliseconds")
                    .replace("+00:00", "Z"),
                    "expectedRevision": 1,
                    "descriptorId": "descriptor-1",
                    "descriptorHash": "a" * 64,
                    "attemptBindingHash": "b" * 64,
                    "action": {
                        "type": "foundation.metadata-digest",
                        "version": 1,
                        "handlerDigest": "sha256:" + "a" * 64,
                        "inputSchemaId": "foundation.metadata-fixture.v1",
                        "outputSchemaId": "foundation.metadata-digest-result.v1",
                        "requiredCapabilities": ["metadata.read"],
                        "sideEffectClass": "NONE",
                        "riskClass": "READ_ONLY",
                    },
                }
            }
        return super().request(method, path, payload)


class RunnableAssignmentTransport(AssignmentTransport):
    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        if path.endswith("/assignment"):
            self.calls.append((method, path, payload))
            return {
                "assignment": {
                    "attemptId": "a",
                    "jobId": "j",
                    "leaseToken": "lease-token",
                    "leaseExpiresAt": self.claim_expiry,
                    "expectedRevision": 1,
                    "descriptorId": "descriptor-1",
                    "descriptorHash": "a" * 64,
                    "attemptBindingHash": "b" * 64,
                    "action": {
                        "type": "foundation.metadata-digest",
                        "version": 1,
                        "handlerDigest": REVIEWED_METADATA_HANDLER_DIGEST,
                        "inputSchemaId": "foundation.metadata-fixture.v1",
                        "outputSchemaId": "foundation.metadata-digest-result.v1",
                        "requiredCapabilities": ["metadata.read"],
                        "sideEffectClass": "NONE",
                        "riskClass": "READ_ONLY",
                    },
                }
            }
        return super().request(method, path, payload)


class WorkloadTransport(FakeTransport):
    def __init__(self, *, tamper: bool = False) -> None:
        super().__init__()
        without_hash: dict[str, object] = {
            "schemaVersion": 1,
            "workloadId": "workload-1",
            "descriptorId": "descriptor-1",
            "descriptorHash": "a" * 64,
            "attemptId": "attempt-1",
            "attemptBindingHash": "b" * 64,
            "tenantScope": {
                "scopeType": "workspace",
                "organizationId": "organization-1",
                "workspaceId": "workspace-1",
            },
            "jobId": "job-1",
            "action": {
                "type": "foundation.metadata-digest",
                "version": 1,
                "handlerDigest": "sha256:" + "c" * 64,
                "inputSchemaId": "foundation.metadata-fixture.v1",
                "outputSchemaId": "foundation.metadata-digest-result.v1",
                "requiredCapabilities": ["metadata.read"],
                "sideEffectClass": "NONE",
                "riskClass": "READ_ONLY",
            },
            "inputHandles": [
                {
                    "objectId": "object-1",
                    "schemaId": "foundation.metadata-fixture.v1",
                    "contentSha256": "d" * 64,
                    "byteLength": 12,
                }
            ],
            "inputManifestHash": "e" * 64,
            "parameters": {"limit": 100},
            "outputPolicy": {
                "outputObjectId": "object-out",
                "maxBytes": 1024,
                "mediaType": "application/json",
            },
            "deadline": "2099-01-01T00:10:00.000Z",
            "locale": "vi-VN",
            "timezone": "UTC",
            "subjectBindings": {"dashboardId": "dashboard-1"},
            "createdAt": "2026-08-19T00:00:00.000Z",
        }
        canonical = hashlib.sha256(
            json.dumps(
                without_hash, ensure_ascii=False, separators=(",", ":"), sort_keys=True
            ).encode("utf-8")
        ).hexdigest()
        self.response = {**without_hash, "canonicalHash": "f" * 64 if tamper else canonical}

    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        if path.endswith("/workload"):
            self.calls.append((method, path, payload))
            return self.response
        return super().request(method, path, payload)


class ProductionGrantTransport(FakeTransport):
    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        response = super().request(method, path, payload)
        if path.endswith("/claim"):
            grant = response["inputGrant"]
            assert isinstance(grant, dict)
            grant.update(
                {
                    "capabilityId": "capability-1",
                    "actions": ["READ"],
                    "maxBytes": 1024,
                    "issuedAt": datetime.now(UTC)
                    .isoformat(timespec="milliseconds")
                    .replace("+00:00", "Z"),
                    "signedCapability": "signed-capability-token",
                }
            )
        return response


def test_rejects_non_https_endpoint_and_oversized_result() -> None:
    with pytest.raises(WorkerClientError, match="HTTPS"):
        WorkerClient("http://worker.internal", "secret", FakeTransport())
    client = WorkerClient("https://worker.internal", "secret", FakeTransport())
    with pytest.raises(WorkerClientError, match="bounded"):
        client.complete("a", "secret", 3, "SUCCEEDED", "b" * 64, ["x" * 257] * 129)


def test_requests_one_typed_assignment_without_tenant_or_database_input() -> None:
    transport = AssignmentTransport()
    client = WorkerClient("https://worker.internal", "secret", transport)

    assignment = client.assignment()

    assert assignment is not None
    assert assignment["attemptId"] == "attempt-1"
    assert assignment["action"]["type"] == "foundation.metadata-digest"
    assert transport.calls == [("POST", "/internal/worker/assignment", {})]
    serialized = repr(assignment).lower()
    assert "workspace" not in serialized
    assert "database" not in serialized
    assert "command" not in serialized
    assert "path" not in serialized


def test_accepts_the_complete_signed_job_bound_input_grant() -> None:
    client = WorkerClient("https://worker.internal", "secret", ProductionGrantTransport())

    claim = client.claim("a", "lease-token", 1)

    grant = claim["inputGrant"]
    assert isinstance(grant, dict)
    assert grant["actions"] == ["READ"]
    assert grant["signedCapability"] == "signed-capability-token"


def test_resolves_only_the_exact_server_authored_workload_and_rejects_tamper() -> None:
    transport = WorkloadTransport()
    client = WorkerClient("https://worker.internal", "secret", transport)
    workload = client.workload(
        attempt_id="attempt-1",
        lease_token="lease-token",
        expected_revision=2,
        descriptor_id="descriptor-1",
        descriptor_hash="a" * 64,
        attempt_binding_hash="b" * 64,
    )
    assert workload["parameters"] == {"limit": 100}
    assert transport.calls == [
        (
            "POST",
            "/internal/worker/workload",
            {
                "attemptId": "attempt-1",
                "leaseToken": "lease-token",
                "expectedRevision": 2,
                "descriptorId": "descriptor-1",
                "descriptorHash": "a" * 64,
                "attemptBindingHash": "b" * 64,
            },
        )
    ]
    with pytest.raises(WorkerClientError, match="workload"):
        WorkerClient(
            "https://worker.internal",
            "secret",
            WorkloadTransport(tamper=True),
        ).workload(
            attempt_id="attempt-1",
            lease_token="lease-token",
            expected_revision=2,
            descriptor_id="descriptor-1",
            descriptor_hash="a" * 64,
            attempt_binding_hash="b" * 64,
        )


def test_runs_only_a_closed_registry_assignment_through_claim_heartbeat_and_completion() -> None:
    transport = RunnableAssignmentTransport()
    client = WorkerClient(
        "https://worker.internal",
        "secret",
        transport,
        heartbeat_interval_seconds=0,
    )
    observed: list[tuple[dict[str, object], dict[str, object]]] = []

    ran = client.run_next(
        lambda assignment, grant, _cancellation: (
            observed.append((assignment, grant)) or {"outcome": "SUCCEEDED", "resultReferences": []}
        )
    )

    assert ran is True
    assert observed[0][0]["action"]["handlerDigest"] == REVIEWED_METADATA_HANDLER_DIGEST
    assert observed[0][1]["grantType"] == "JOB_INPUT"
    assert [call[1] for call in transport.calls] == [
        "/internal/worker/assignment",
        "/internal/worker/claim",
        "/internal/worker/complete",
    ]


def test_rejects_assignment_digest_drift_before_claiming_a_lease() -> None:
    transport = AssignmentTransport()
    client = WorkerClient("https://worker.internal", "secret", transport)

    with pytest.raises(WorkerClientError, match="registry"):
        client.run_next(lambda *_args: {"outcome": "SUCCEEDED", "resultReferences": []})

    assert [call[1] for call in transport.calls] == ["/internal/worker/assignment"]


def test_retries_only_transport_and_retryable_http_statuses() -> None:
    rejected = StatusTransport(StatusTransportError(409))
    client = WorkerClient("https://worker.internal", "secret", rejected)
    with pytest.raises(WorkerClientError) as rejected_error:
        client.claim("a", "secret", 1)
    assert rejected_error.value.status_code == 409
    assert rejected_error.value.problem_code == "WORKER_ATTEMPT_REJECTED"
    assert rejected.calls == 1

    rate_limited = StatusTransport(StatusTransportError(429))
    client = WorkerClient("https://worker.internal", "secret", rate_limited)
    with pytest.raises(WorkerClientError):
        client.claim("a", "secret", 1)
    assert rate_limited.calls == 3

    server_error = StatusTransport(StatusTransportError(500))
    client = WorkerClient("https://worker.internal", "secret", server_error)
    with pytest.raises(WorkerClientError):
        client.claim("a", "secret", 1)
    assert server_error.calls == 3

    request_timeout = StatusTransport(StatusTransportError(408))
    client = WorkerClient("https://worker.internal", "secret", request_timeout)
    with pytest.raises(WorkerClientError):
        client.claim("a", "secret", 1)
    assert request_timeout.calls == 3

    client_error = StatusTransport(StatusTransportError(400))
    client = WorkerClient("https://worker.internal", "secret", client_error)
    with pytest.raises(WorkerClientError):
        client.claim("a", "secret", 1)
    assert client_error.calls == 1


def test_retry_jitter_is_bounded_and_injected_for_deterministic_verification() -> None:
    transport = StatusTransport(StatusTransportError(503))
    sleeps: list[float] = []
    client = WorkerClient(
        "https://worker.internal",
        "secret",
        transport,
        sleep=sleeps.append,
        random_value=lambda: 1.0,
    )
    with pytest.raises(WorkerClientError):
        client.claim("a", "secret", 1)
    assert sleeps == pytest.approx([0.05, 0.1])
    assert all(0 < delay <= 0.5 for delay in sleeps)


def test_rejects_malformed_claim_response_with_bounded_client_error() -> None:
    class MalformedTransport:
        def request(
            self, _method: str, _path: str, _payload: dict[str, object]
        ) -> dict[str, object]:
            return {"attemptId": "a"}

    client = WorkerClient("https://worker.internal", "secret", MalformedTransport())
    with pytest.raises(WorkerClientError, match="response"):
        client.claim("a", "secret", 1)

    class ExtraScopeTransport(FakeTransport):
        def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
            value = super().request(method, path, payload)
            if path.endswith("/claim"):
                scope = value["inputGrant"]["tenantScope"]
                assert isinstance(scope, dict)
                scope["secret"] = "must-not-be-forwarded"
            return value

    with pytest.raises(WorkerClientError, match="response"):
        WorkerClient("https://worker.internal", "secret", ExtraScopeTransport()).claim(
            "a", "secret", 1
        )


def test_rejects_claim_response_bound_to_another_attempt_or_long_lease() -> None:
    class WrongAttemptTransport(FakeTransport):
        def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
            value = super().request(method, path, payload)
            if path.endswith("/claim"):
                value["attemptId"] = "another-attempt"
            return value

    with pytest.raises(WorkerClientError, match="response"):
        WorkerClient("https://worker.internal", "secret", WrongAttemptTransport()).claim(
            "a", "secret", 1
        )

    class LongLeaseTransport(FakeTransport):
        def __init__(self) -> None:
            super().__init__()
            self.claim_expiry = (
                (datetime.now(UTC) + timedelta(seconds=MAX_LEASE_SECONDS + 1))
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            )

    with pytest.raises(WorkerClientError, match="response"):
        WorkerClient("https://worker.internal", "secret", LongLeaseTransport()).claim(
            "a", "secret", 1
        )


def test_heartbeats_during_processing_and_never_commits_after_lease_loss() -> None:
    transport = FakeTransport(TimeoutError("timeout"))
    client = WorkerClient(
        "https://worker.internal", "secret", transport, heartbeat_interval_seconds=0
    )
    with pytest.raises(WorkerClientError, match="lease"):
        client.run(
            "a",
            "secret",
            1,
            lambda _grant: (
                time.sleep(0.1),
                {"resultManifestHash": "b" * 64, "resultReferences": []},
            )[1],
        )
    assert not any(path.endswith("/complete") for _, path, _ in transport.calls)


def test_first_heartbeat_renews_an_ordinary_lease_and_completion_uses_latest_revision() -> None:
    transport = FakeTransport()
    client = WorkerClient(
        "https://worker.internal", "secret", transport, heartbeat_interval_seconds=0.01
    )
    result = client.run(
        "a",
        "secret",
        1,
        lambda _grant: (
            time.sleep(0.08),
            {"resultManifestHash": "b" * 64, "resultReferences": []},
        )[1],
    )
    heartbeat_calls = [call for call in transport.calls if call[1].endswith("/heartbeat")]
    complete_calls = [call for call in transport.calls if call[1].endswith("/complete")]
    assert heartbeat_calls
    assert complete_calls
    assert complete_calls[0][2]["expectedRevision"] >= 3
    assert result["outcome"] == "SUCCEEDED"


def test_malformed_heartbeat_response_loses_the_lease_and_prevents_completion() -> None:
    class MalformedHeartbeatTransport(FakeTransport):
        def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
            if path.endswith("/heartbeat"):
                super().request(method, path, payload)
                return {"attemptId": "a", "revision": 3}
            return super().request(method, path, payload)

    transport = MalformedHeartbeatTransport()
    client = WorkerClient(
        "https://worker.internal", "secret", transport, heartbeat_interval_seconds=0.01
    )
    with pytest.raises(WorkerClientError, match="lease"):
        client.run(
            "a",
            "secret",
            1,
            lambda _grant: (
                time.sleep(0.1),
                {"resultManifestHash": "b" * 64, "resultReferences": []},
            )[1],
        )
    assert not any(path.endswith("/complete") for _, path, _ in transport.calls)


def test_stops_and_joins_heartbeat_before_completion() -> None:
    transport = CompletionRaceTransport()
    client = WorkerClient(
        "https://worker.internal", "secret", transport, heartbeat_interval_seconds=0
    )
    result = client.run(
        "a",
        "secret",
        1,
        lambda _grant: (
            time.sleep(0.02),
            {"resultManifestHash": "b" * 64, "resultReferences": []},
        )[1],
    )
    assert result["outcome"] == "SUCCEEDED"
    assert transport.heartbeat_after_complete == 0


def test_exposes_lease_loss_to_processing_when_callback_accepts_cancellation_event() -> None:
    transport = FakeTransport(TimeoutError("timeout"))
    client = WorkerClient(
        "https://worker.internal", "secret", transport, heartbeat_interval_seconds=0
    )
    observed = Event()

    def process(_grant: dict[str, object], cancelled: Event) -> dict[str, object]:
        for _ in range(1000):
            if cancelled.is_set():
                observed.set()
                break
            time.sleep(0.001)
        return {"resultManifestHash": "b" * 64, "resultReferences": []}

    with pytest.raises(WorkerClientError, match="lease"):
        client.run("a", "secret", 1, process)
    assert observed.is_set()


def test_successful_run_completes_once_with_bounded_typed_metadata() -> None:
    transport = FakeTransport()
    client = WorkerClient(
        "https://worker.internal", "secret", transport, heartbeat_interval_seconds=60
    )
    result = client.run(
        "a", "secret", 1, lambda grant: {"resultManifestHash": "b" * 64, "resultReferences": []}
    )
    assert result["outcome"] == "SUCCEEDED"
    assert [method for method, _, _ in transport.calls] == ["POST", "POST"]


def test_successful_run_allows_optional_manifest_hash() -> None:
    transport = FakeTransport()
    client = WorkerClient("https://worker.internal", "secret", transport)
    result = client.run("a", "secret", 1, lambda _grant: {"resultReferences": []})
    assert result["outcome"] == "SUCCEEDED"


class ResultV2Transport:
    attempt_id = "10000000-0000-4000-8000-000000000001"
    submission_id = "20000000-0000-4000-8000-000000000001"
    descriptor_hash = "c" * 64

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, object]]] = []
        self.heartbeat_after_prepare = 0
        self.prepare_started = False
        self.expiry = (
            (datetime.now(UTC) + timedelta(seconds=60))
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )

    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        self.calls.append((method, path, payload))
        if path.endswith("/claim"):
            return {
                "attemptId": self.attempt_id,
                "jobId": "10000000-0000-4000-8000-000000000002",
                "leaseExpiresAt": self.expiry,
                "revision": 2,
                "inputGrant": {
                    "grantType": "JOB_INPUT",
                    "attemptId": self.attempt_id,
                    "jobId": "10000000-0000-4000-8000-000000000002",
                    "workerId": "10000000-0000-4000-8000-000000000003",
                    "securityEpoch": 4,
                    "tenantScope": {
                        "scopeType": "workspace",
                        "organizationId": "10000000-0000-4000-8000-000000000004",
                        "workspaceId": "10000000-0000-4000-8000-000000000005",
                    },
                    "objectIds": ["10000000-0000-4000-8000-000000000006"],
                    "expiresAt": self.expiry,
                },
            }
        if path.endswith("/heartbeat"):
            if self.prepare_started:
                self.heartbeat_after_prepare += 1
            return {
                "attemptId": self.attempt_id,
                "revision": int(payload["expectedRevision"]) + 1,
                "leaseExpiresAt": payload["nextLeaseExpiresAt"],
            }
        if path.endswith("/results/prepare"):
            self.prepare_started = True
            return {
                "schemaVersion": 4,
                "accepted": True,
                "submissionId": self.submission_id,
                "attemptId": self.attempt_id,
                "descriptorBindingHash": self.descriptor_hash,
                "expiresAt": self.expiry,
                "outputs": [
                    {
                        "outputName": "primary",
                        "capabilityId": "20000000-0000-4000-8000-000000000001",
                        "objectId": "20000000-0000-4000-8000-000000000002",
                        "maxBytes": 1_048_576,
                        "allowedMediaTypes": ["application/json"],
                        "writeCapability": "signed_capability_1234",
                    }
                ],
            }
        if path.endswith("/results/finalize"):
            return {
                "schemaVersion": 4,
                "accepted": True,
                "submissionId": self.submission_id,
                "attemptId": self.attempt_id,
                "resultManifestId": "40000000-0000-4000-8000-000000000001",
                "resultManifestHash": "d" * 64,
                "outcome": "SUCCEEDED",
                "revision": 5,
            }
        raise AssertionError(path)


def test_result_v2_stops_heartbeat_then_prepares_transfers_and_finalizes_typed_outputs() -> None:
    transport = ResultV2Transport()
    client = WorkerClient(
        "https://worker.internal",
        "secret",
        transport,
        heartbeat_interval_seconds=0,
    )
    output = JsonWorkerOutput(
        kind="JSON_RESULT",
        outputName="primary",
        schemaId="dda.materialize-query-result.v1",
        sourceLineageHash="b" * 64,
        content=b'{"value":1}',
    )
    transferred: list[tuple[str, str, str]] = []

    result = client.run_result_v2(
        ResultV2Transport.attempt_id,
        "lease_token_opaque_1234",
        1,
        lambda _grant, _cancelled: (output,),
        lambda prepared, candidate: (
            transferred.append((prepared.capabilityId, prepared.outputName, candidate.outputName))
            or "30000000-0000-4000-8000-000000000001"
        ),
        prepare_idempotency_key="result-prepare-10000000",
        finalize_idempotency_key="result-finalize-10000000",
    )

    assert result.outcome == "SUCCEEDED"
    assert transferred == [("20000000-0000-4000-8000-000000000001", "primary", "primary")]
    assert transport.heartbeat_after_prepare == 0
    prepare_payload = next(
        payload for _, path, payload in transport.calls if path.endswith("/results/prepare")
    )
    assert prepare_payload["outputs"] == [
        {
            "kind": "JSON_RESULT",
            "outputName": "primary",
            "schemaId": "dda.materialize-query-result.v1",
            "mediaType": "application/json",
            "contentSha256": "48208f9428d64634bd8e28ff345bf0eab60d53c18fa2fbdb0b9bc1e84df2b5f6",
            "byteLength": 11,
            "sourceLineageHash": "b" * 64,
        }
    ]
    serialized = repr(transport.calls).lower()
    assert "s3://" not in serialized
    assert "database" not in serialized
    assert "c:\\" not in serialized


def test_result_v2_rejects_malformed_prepare_binding_and_never_transfers() -> None:
    class WrongAttemptTransport(ResultV2Transport):
        def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
            value = super().request(method, path, payload)
            if path.endswith("/results/prepare"):
                value["attemptId"] = "10000000-0000-4000-8000-000000000099"
            return value

    transport = WrongAttemptTransport()
    client = WorkerClient("https://worker.internal", "secret", transport)
    output = JsonWorkerOutput(
        kind="JSON_RESULT",
        outputName="primary",
        schemaId="dda.materialize-query-result.v1",
        sourceLineageHash="b" * 64,
        content=b"{}",
    )
    transferred = False

    def transfer(_prepared: object, _candidate: object) -> str:
        nonlocal transferred
        transferred = True
        return "30000000-0000-4000-8000-000000000001"

    with pytest.raises(WorkerClientError, match="prepare response"):
        client.run_result_v2(
            ResultV2Transport.attempt_id,
            "lease_token_opaque_1234",
            1,
            lambda _grant: (output,),
            transfer,
            prepare_idempotency_key="result-prepare-10000000",
            finalize_idempotency_key="result-finalize-10000000",
        )
    assert transferred is False


class BinaryTransferTransport:
    def __init__(self, *, tamper_digest: bool = False) -> None:
        self.calls: list[tuple[str, str, dict[str, str], bytes]] = []
        self.content = b'{"value":1}'
        self.tamper_digest = tamper_digest

    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        self.calls.append((method, path, {"payload": repr(payload)}, b""))
        if path.endswith("/results/finalize"):
            return {
                "schemaVersion": 1,
                "accepted": True,
                "attestation": {
                    "attestationId": "attestation-1",
                    "contentSha256": payload["contentSha256"],
                    "contentLength": payload["contentLength"],
                    "mediaType": payload["mediaType"],
                },
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
        self.calls.append((method, path, headers, body))
        if method == "GET":
            digest = hashlib.sha256(self.content).hexdigest()
            if self.tamper_digest:
                digest = "0" * 64
            return self.content, {
                "x-content-sha256": digest,
                "content-length": str(len(self.content)),
            }
        if method == "PUT":
            assert body == self.content
            assert headers["x-content-sha256"] == hashlib.sha256(body).hexdigest()
            return (
                b'{"schemaVersion":1,"accepted":true,"receipt":{"contentSha256":"'
                + headers["x-content-sha256"].encode("ascii")
                + b'","contentLength":11}}',
                {"content-type": "application/json"},
            )
        raise AssertionError(path)


def test_transfers_exact_worker_bytes_and_finalizes_only_an_attestation_reference() -> None:
    transport = BinaryTransferTransport()
    client = WorkerClient("https://worker.internal", "secret", transport)

    content, digest = client.read_object(
        object_id="input-object",
        signed_capability="signed-input-capability",
        attempt_id="attempt-1",
    )
    assert content == transport.content
    assert digest == hashlib.sha256(content).hexdigest()

    receipt = client.write_object(
        object_id="output-object",
        signed_capability="signed-output-capability",
        attempt_id="attempt-1",
        content=content,
        media_type="application/json",
    )
    assert receipt["contentLength"] == len(content)

    attestation_id = client.finalize_object(
        submission_id="submission-1",
        signed_capability="signed-output-capability",
        attempt_id="attempt-1",
        execution_descriptor_id="descriptor-1",
        object_id="output-object",
        content_sha256=digest,
        content_length=len(content),
        media_type="application/json",
    )
    assert attestation_id == "attestation-1"
    assert [call[1] for call in transport.calls] == [
        "/internal/iae/worker/objects/input-object",
        "/internal/iae/worker/objects/output-object",
        "/internal/iae/worker/results/finalize",
    ]
    serialized = repr(transport.calls).lower()
    assert "s3://" not in serialized
    assert "database" not in serialized


def test_rejects_tampered_binary_digest_and_unavailable_binary_transport() -> None:
    client = WorkerClient(
        "https://worker.internal",
        "secret",
        BinaryTransferTransport(tamper_digest=True),
    )
    with pytest.raises(WorkerClientError, match="digest"):
        client.read_object(
            object_id="input-object",
            signed_capability="signed-input-capability",
            attempt_id="attempt-1",
        )

    with pytest.raises(WorkerClientError, match="unavailable"):
        WorkerClient("https://worker.internal", "secret", FakeTransport()).read_object(
            object_id="input-object",
            signed_capability="signed-input-capability",
            attempt_id="attempt-1",
        )
