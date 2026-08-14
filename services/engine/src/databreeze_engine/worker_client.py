"""Authenticated, bounded client for the internal JRA worker API (JRA-007/JRA-023)."""

from __future__ import annotations

import inspect
import json
import random
import re
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from databreeze_contracts.v4 import (
    JraWorkerResultFinalizeAccepted,
    JraWorkerResultFinalizeCommand,
    JraWorkerResultPrepareAccepted,
    JraWorkerResultPrepareCommand,
    PreparedOutput,
)
from pydantic import ValidationError

from .models import BinaryWorkerOutput, JsonWorkerOutput, WorkerOutput
from .registry import RegistryError, default_registry

MAX_BODY_BYTES = 1_048_576
MAX_REFERENCES = 128
MAX_REFERENCE_BYTES = 256
MAX_RETRIES = 2
MAX_LEASE_SECONDS = 15 * 60
RETRY_BASE_SECONDS = 0.05
RETRY_MAX_SECONDS = 0.5
STRICT_TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
OPAQUE_REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$")
SAFE_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_.-]{0,127}$")
HANDLER_DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")


class WorkerClientError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        problem_code: str | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.problem_code = problem_code
        self.retryable = retryable


class WorkerHttpError(WorkerClientError):
    def __init__(self, status_code: int, problem_code: str | None = None) -> None:
        retryable = status_code == 408 or status_code == 429 or 500 <= status_code <= 599
        super().__init__(
            f"worker HTTP request failed with status {status_code}",
            status_code=status_code,
            problem_code=problem_code,
            retryable=retryable,
        )


class WorkerTransport(Protocol):
    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]: ...


def _safe_problem_code(body: bytes) -> str | None:
    try:
        value = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict):
        return None
    code = value.get("code")
    if isinstance(code, str) and 1 <= len(code) <= 96 and code.replace("_", "").isalnum():
        return code
    return None


class HttpsWorkerTransport:
    def __init__(self, endpoint: str, bearer: str, timeout_seconds: float) -> None:
        parsed = urlparse(endpoint)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise WorkerClientError("worker endpoint must use HTTPS")
        if (
            not bearer
            or len(bearer) > 4096
            or any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in bearer)
        ):
            raise WorkerClientError("worker credential is invalid")
        self._endpoint = endpoint.rstrip("/")
        self._bearer = bearer
        self._timeout = timeout_seconds

    def request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        try:
            encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError) as error:
            raise WorkerClientError("worker request payload is invalid") from error
        if len(encoded) > MAX_BODY_BYTES:
            raise WorkerClientError("worker request body exceeds bounded limit")
        request = Request(
            f"{self._endpoint}{path}",
            data=encoded,
            headers={"Authorization": f"Bearer {self._bearer}", "Content-Type": "application/json"},
            method=method,
        )
        try:
            with urlopen(request, timeout=self._timeout) as response:
                status = int(getattr(response, "status", 200))
                body = response.read(MAX_BODY_BYTES + 1)
        except HTTPError as error:
            body = error.read(MAX_BODY_BYTES + 1)
            raise WorkerHttpError(error.code, _safe_problem_code(body)) from None
        except (URLError, TimeoutError, OSError) as error:
            raise WorkerClientError("worker transport failed", retryable=True) from error
        except WorkerClientError:
            raise
        except Exception as error:
            raise WorkerClientError("worker transport failed", retryable=True) from error
        if status < 200 or status >= 300:
            raise WorkerHttpError(status, _safe_problem_code(body))
        if len(body) > MAX_BODY_BYTES:
            raise WorkerClientError("worker response body exceeds bounded limit")
        try:
            value = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise WorkerClientError("worker response is invalid") from error
        if not isinstance(value, dict):
            raise WorkerClientError("worker response is invalid")
        return cast(dict[str, object], value)


def _strict_timestamp(value: object) -> datetime:
    if not isinstance(value, str) or not STRICT_TIMESTAMP_PATTERN.fullmatch(value):
        raise WorkerClientError("worker response is invalid")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise WorkerClientError("worker response is invalid") from error
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise WorkerClientError("worker response is invalid")
    return parsed.astimezone(UTC)


def _opaque_reference(value: object) -> bool:
    return (
        isinstance(value, str)
        and len(value.encode("utf-8")) <= MAX_REFERENCE_BYTES
        and OPAQUE_REFERENCE_PATTERN.fullmatch(value) is not None
        and ".." not in value
    )


def _required_int(value: object) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < 1
        or value > 9_007_199_254_740_991
    ):
        raise WorkerClientError("worker response is invalid")
    return value


def _validate_tenant_scope(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise WorkerClientError("worker response is invalid")
    scope_type = value.get("scopeType")
    if not isinstance(scope_type, str):
        raise WorkerClientError("worker response is invalid")
    expected = {
        "organization": {"scopeType", "organizationId"},
        "workspace": {"scopeType", "organizationId", "workspaceId"},
        "project": {"scopeType", "organizationId", "workspaceId", "projectId"},
    }.get(scope_type)
    if expected is None or set(value) != expected:
        raise WorkerClientError("worker response is invalid")
    if any(not _opaque_reference(value.get(key)) for key in expected if key != "scopeType"):
        raise WorkerClientError("worker response is invalid")
    return value


def _validate_input_grant(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise WorkerClientError("worker response is invalid")
    expected = {
        "grantType",
        "attemptId",
        "jobId",
        "workerId",
        "securityEpoch",
        "tenantScope",
        "objectIds",
        "expiresAt",
    }
    extension = {"capabilityId", "actions", "maxBytes", "issuedAt", "signedCapability"}
    if set(value) not in (expected, expected | extension) or value.get("grantType") != "JOB_INPUT":
        raise WorkerClientError("worker response is invalid")
    for key in ("attemptId", "jobId", "workerId"):
        if not _opaque_reference(value.get(key)):
            raise WorkerClientError("worker response is invalid")
    _required_int(value.get("securityEpoch"))
    _validate_tenant_scope(value.get("tenantScope"))
    objects = value.get("objectIds")
    if not isinstance(objects, list) or len(objects) > MAX_REFERENCES:
        raise WorkerClientError("worker response is invalid")
    if any(not _opaque_reference(object_id) for object_id in objects):
        raise WorkerClientError("worker response is invalid")
    expires_at = _strict_timestamp(value.get("expiresAt"))
    if extension.issubset(value):
        if not _opaque_reference(value.get("capabilityId")) or value.get("actions") != ["READ"]:
            raise WorkerClientError("worker response is invalid")
        max_bytes = value.get("maxBytes")
        if (
            isinstance(max_bytes, bool)
            or not isinstance(max_bytes, int)
            or max_bytes < 1
            or max_bytes > 10 * 1024 * 1024 * 1024
        ):
            raise WorkerClientError("worker response is invalid")
        issued_at = _strict_timestamp(value.get("issuedAt"))
        capability = value.get("signedCapability")
        if (
            issued_at >= expires_at
            or not isinstance(capability, str)
            or not capability
            or len(capability) > 4096
            or any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in capability)
            or capability.lower().startswith("file:")
            or capability.startswith("\\\\")
        ):
            raise WorkerClientError("worker response is invalid")
    return value


def _validate_claim(value: object, attempt_id: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != {
        "attemptId",
        "jobId",
        "leaseExpiresAt",
        "revision",
        "inputGrant",
    }:
        raise WorkerClientError("worker response is invalid")
    if (
        not _opaque_reference(value.get("attemptId"))
        or value.get("attemptId") != attempt_id
        or not _opaque_reference(value.get("jobId"))
    ):
        raise WorkerClientError("worker response is invalid")
    _required_int(value.get("revision"))
    lease_expires_at = _strict_timestamp(value.get("leaseExpiresAt"))
    now = datetime.now(UTC)
    if lease_expires_at <= now or lease_expires_at > now + timedelta(seconds=MAX_LEASE_SECONDS):
        raise WorkerClientError("worker response is invalid")
    grant = _validate_input_grant(value.get("inputGrant"))
    if (
        grant.get("attemptId") != value.get("attemptId")
        or grant.get("jobId") != value.get("jobId")
        or _strict_timestamp(grant["expiresAt"]) <= now
        or _strict_timestamp(grant["expiresAt"]) > lease_expires_at
    ):
        raise WorkerClientError("worker response is invalid")
    return cast(dict[str, object], value)


def _validate_heartbeat(value: object, attempt_id: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != {"attemptId", "leaseExpiresAt", "revision"}:
        raise WorkerClientError("worker response is invalid")
    if not _opaque_reference(value.get("attemptId")) or value.get("attemptId") != attempt_id:
        raise WorkerClientError("worker response is invalid")
    _required_int(value.get("revision"))
    lease_expires_at = _strict_timestamp(value.get("leaseExpiresAt"))
    now = datetime.now(UTC)
    if lease_expires_at <= now or lease_expires_at > now + timedelta(seconds=MAX_LEASE_SECONDS):
        raise WorkerClientError("worker response is invalid")
    return cast(dict[str, object], value)


def _validate_completion(value: object, attempt_id: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise WorkerClientError("worker response is invalid")
    expected = {"attemptId", "revision", "outcome", "resultReferences"}
    if "resultManifestHash" in value:
        expected.add("resultManifestHash")
    if set(value) != expected:
        raise WorkerClientError("worker response is invalid")
    if not _opaque_reference(value.get("attemptId")) or value.get("attemptId") != attempt_id:
        raise WorkerClientError("worker response is invalid")
    _required_int(value.get("revision"))
    if value.get("outcome") not in {"SUCCEEDED", "FAILED", "CANCELLED"}:
        raise WorkerClientError("worker response is invalid")
    if "resultManifestHash" in value and (
        not isinstance(value.get("resultManifestHash"), str)
        or len(cast(str, value["resultManifestHash"])) != 64
        or any(
            character not in "0123456789abcdef"
            for character in cast(str, value["resultManifestHash"])
        )
    ):
        raise WorkerClientError("worker response is invalid")
    references = value.get("resultReferences")
    if not isinstance(references, list) or len(references) > MAX_REFERENCES:
        raise WorkerClientError("worker response is invalid")
    if any(not _opaque_reference(reference) for reference in references):
        raise WorkerClientError("worker response is invalid")
    return cast(dict[str, object], value)


def _validate_assignment_action(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != {
        "type",
        "version",
        "handlerDigest",
        "inputSchemaId",
        "outputSchemaId",
        "requiredCapabilities",
        "sideEffectClass",
        "riskClass",
    }:
        raise WorkerClientError("worker assignment is invalid")
    if any(
        not isinstance(value.get(key), str)
        or SAFE_NAME_PATTERN.fullmatch(cast(str, value[key])) is None
        for key in ("type", "inputSchemaId", "outputSchemaId")
    ):
        raise WorkerClientError("worker assignment is invalid")
    version = value.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise WorkerClientError("worker assignment is invalid")
    digest = value.get("handlerDigest")
    if not isinstance(digest, str) or HANDLER_DIGEST_PATTERN.fullmatch(digest) is None:
        raise WorkerClientError("worker assignment is invalid")
    capabilities = value.get("requiredCapabilities")
    if (
        not isinstance(capabilities, list)
        or not capabilities
        or len(capabilities) > 64
        or len(set(capabilities)) != len(capabilities)
        or any(
            not isinstance(capability, str) or SAFE_NAME_PATTERN.fullmatch(capability) is None
            for capability in capabilities
        )
    ):
        raise WorkerClientError("worker assignment is invalid")
    if value.get("sideEffectClass") not in {"NONE", "REVERSIBLE", "EXTERNAL", "DESTRUCTIVE"}:
        raise WorkerClientError("worker assignment is invalid")
    if value.get("riskClass") not in {"READ_ONLY", "LOW", "CONSEQUENTIAL", "RESTRICTED"}:
        raise WorkerClientError("worker assignment is invalid")
    return cast(dict[str, object], value)


def _validate_assignment(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict) or set(value) != {"assignment"}:
        raise WorkerClientError("worker assignment response is invalid")
    assignment = value.get("assignment")
    if assignment is None:
        return None
    if not isinstance(assignment, dict) or set(assignment) != {
        "attemptId",
        "jobId",
        "leaseToken",
        "leaseExpiresAt",
        "expectedRevision",
        "action",
    }:
        raise WorkerClientError("worker assignment is invalid")
    if any(not _opaque_reference(assignment.get(key)) for key in ("attemptId", "jobId")):
        raise WorkerClientError("worker assignment is invalid")
    lease_token = assignment.get("leaseToken")
    if (
        not isinstance(lease_token, str)
        or not lease_token
        or len(lease_token) > 512
        or any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in lease_token)
    ):
        raise WorkerClientError("worker assignment is invalid")
    _required_int(assignment.get("expectedRevision"))
    lease_expires_at = _strict_timestamp(assignment.get("leaseExpiresAt"))
    now = datetime.now(UTC)
    if lease_expires_at <= now or lease_expires_at > now + timedelta(seconds=MAX_LEASE_SECONDS):
        raise WorkerClientError("worker assignment is invalid")
    _validate_assignment_action(assignment.get("action"))
    return cast(dict[str, object], assignment)


class WorkerClient:
    def __init__(
        self,
        endpoint: str,
        bearer: str,
        transport: WorkerTransport | None = None,
        *,
        timeout_seconds: float = 10.0,
        heartbeat_interval_seconds: float = 30.0,
        sleep: Callable[[float], None] = time.sleep,
        random_value: Callable[[], float] = random.random,
    ) -> None:
        parsed_endpoint = urlparse(endpoint)
        if (
            parsed_endpoint.scheme != "https"
            or not parsed_endpoint.netloc
            or parsed_endpoint.username is not None
            or parsed_endpoint.password is not None
        ):
            raise WorkerClientError("worker endpoint must use HTTPS")
        if (
            not bearer
            or len(bearer) > 4096
            or any(ord(character) < 32 or 127 <= ord(character) <= 159 for character in bearer)
        ):
            raise WorkerClientError("worker credential is invalid")
        if timeout_seconds <= 0 or timeout_seconds > 60:
            raise WorkerClientError("worker timeout is outside bounded limit")
        if heartbeat_interval_seconds < 0 or heartbeat_interval_seconds > 300:
            raise WorkerClientError("worker heartbeat interval is outside bounded limit")
        self._transport = transport or HttpsWorkerTransport(endpoint, bearer, timeout_seconds)
        self._heartbeat_interval = heartbeat_interval_seconds
        self._sleep = sleep
        self._random = random_value

    def _request(self, method: str, path: str, payload: dict[str, object]) -> dict[str, object]:
        try:
            encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError) as error:
            raise WorkerClientError("worker request payload is invalid") from error
        if len(encoded) > MAX_BODY_BYTES:
            raise WorkerClientError("worker request body exceeds bounded limit")
        last: WorkerClientError | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                value = self._transport.request(method, path, payload)
                if not isinstance(value, dict):
                    raise WorkerClientError("worker response is invalid")
                return value
            except WorkerClientError as error:
                last = error
            except Exception as error:
                last = WorkerClientError("worker transport failed", retryable=True)
                last.__cause__ = error
            status_retryable = (
                (
                    last.status_code is not None
                    and (
                        last.status_code == 408
                        or last.status_code == 429
                        or 500 <= last.status_code <= 599
                    )
                )
                if last is not None
                else False
            )
            transport_retryable = last is not None and last.status_code is None and last.retryable
            if (
                last is None
                or (not transport_retryable and not status_retryable)
                or attempt == MAX_RETRIES
            ):
                break
            bounded = min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * (2**attempt))
            jitter = 0.5 + max(0.0, min(1.0, self._random())) * 0.5
            self._sleep(bounded * jitter)
        raise last or WorkerClientError("worker request failed")

    def claim(self, attempt_id: str, lease_token: str, expected_revision: int) -> dict[str, object]:
        value = self._request(
            "POST",
            "/internal/worker/claim",
            {
                "attemptId": attempt_id,
                "leaseToken": lease_token,
                "expectedRevision": expected_revision,
            },
        )
        return _validate_claim(value, attempt_id)

    def assignment(self) -> dict[str, object] | None:
        """Request one identity-scoped PostgreSQL assignment without workspace enumeration."""
        value = self._request("POST", "/internal/worker/assignment", {})
        return _validate_assignment(value)

    @staticmethod
    def _verify_assignment_registry(assignment: dict[str, object]) -> None:
        action = cast(dict[str, object], assignment["action"])
        action_type = cast(str, action["type"])
        version = cast(int, action["version"])
        handler_digest = cast(str, action["handlerDigest"])
        try:
            definition = default_registry().resolve(
                action_type,
                f"{version}.0.0",
                handler_digest,
            )
        except RegistryError as error:
            raise WorkerClientError("worker assignment registry mismatch") from error
        manifest = definition.manifest
        if (
            manifest.inputSchemaId != action["inputSchemaId"]
            or manifest.outputSchemaId != action["outputSchemaId"]
            or list(manifest.requiredCapabilities) != action["requiredCapabilities"]
            or manifest.sideEffectClass != action["sideEffectClass"]
            or manifest.riskClass != action["riskClass"]
        ):
            raise WorkerClientError("worker assignment registry mismatch")

    def run_next(
        self,
        process: Callable[
            [dict[str, object], dict[str, object], threading.Event],
            dict[str, Any],
        ],
    ) -> bool:
        """Claim and run at most one closed-registry assignment; return false when idle."""
        assignment = self.assignment()
        if assignment is None:
            return False
        self._verify_assignment_registry(assignment)
        attempt_id = cast(str, assignment["attemptId"])
        lease_token = cast(str, assignment["leaseToken"])
        expected_revision = cast(int, assignment["expectedRevision"])

        def run_assignment(
            grant: dict[str, object], cancellation: threading.Event
        ) -> dict[str, Any]:
            return process(dict(assignment), grant, cancellation)

        self.run(attempt_id, lease_token, expected_revision, run_assignment)
        return True

    def heartbeat(
        self, attempt_id: str, lease_token: str, expected_revision: int, next_lease_expires_at: str
    ) -> dict[str, object]:
        value = self._request(
            "POST",
            "/internal/worker/heartbeat",
            {
                "attemptId": attempt_id,
                "leaseToken": lease_token,
                "expectedRevision": expected_revision,
                "nextLeaseExpiresAt": next_lease_expires_at,
            },
        )
        return _validate_heartbeat(value, attempt_id)

    def prepare_result(
        self,
        attempt_id: str,
        lease_token: str,
        expected_revision: int,
        outputs: tuple[WorkerOutput, ...],
        idempotency_key: str,
    ) -> JraWorkerResultPrepareAccepted:
        try:
            command = JraWorkerResultPrepareCommand.model_validate(
                {
                    "schemaVersion": 4,
                    "attemptId": attempt_id,
                    "leaseToken": lease_token,
                    "expectedRevision": expected_revision,
                    "idempotencyKey": idempotency_key,
                    "outputs": [
                        {
                            "kind": output.kind,
                            "outputName": output.outputName,
                            "schemaId": output.schemaId,
                            "mediaType": output.media_type,
                            "contentSha256": output.content_sha256,
                            "byteLength": output.byte_length,
                            "sourceLineageHash": output.sourceLineageHash,
                        }
                        for output in outputs
                    ],
                }
            )
        except ValidationError as error:
            raise WorkerClientError("worker prepare request is invalid") from error
        value = self._request(
            "POST",
            "/internal/worker/results/prepare",
            cast(dict[str, object], command.model_dump(mode="json")),
        )
        try:
            accepted = JraWorkerResultPrepareAccepted.model_validate(value)
        except ValidationError as error:
            raise WorkerClientError("worker prepare response is invalid") from error
        if accepted.attemptId != attempt_id or _strict_timestamp(
            accepted.expiresAt
        ) <= datetime.now(UTC):
            raise WorkerClientError("worker prepare response is invalid")
        declarations = {output.outputName: output for output in outputs}
        prepared = {output.outputName: output for output in accepted.outputs}
        capability_ids = {output.capabilityId for output in accepted.outputs}
        if (
            len(declarations) != len(outputs)
            or len(prepared) != len(accepted.outputs)
            or len(capability_ids) != len(accepted.outputs)
        ):
            raise WorkerClientError("worker prepare response is invalid")
        if set(declarations) != set(prepared):
            raise WorkerClientError("worker prepare response is invalid")
        for name, output in declarations.items():
            policy = prepared[name]
            if (
                output.byte_length > policy.maxBytes
                or output.media_type not in policy.allowedMediaTypes
            ):
                raise WorkerClientError("worker prepare response is invalid")
        return accepted

    def finalize_result(
        self,
        *,
        submission_id: str,
        attempt_id: str,
        lease_token: str,
        expected_revision: int,
        descriptor_binding_hash: str,
        idempotency_key: str,
        attestations: list[dict[str, str]],
        output_schema_id: str,
        output_names: list[str],
    ) -> JraWorkerResultFinalizeAccepted:
        try:
            command = JraWorkerResultFinalizeCommand.model_validate(
                {
                    "schemaVersion": 4,
                    "submissionId": submission_id,
                    "attemptId": attempt_id,
                    "leaseToken": lease_token,
                    "expectedRevision": expected_revision,
                    "descriptorBindingHash": descriptor_binding_hash,
                    "idempotencyKey": idempotency_key,
                    "attestations": attestations,
                    "resultBinding": {
                        "kind": "OUTPUT_SET",
                        "outputSchemaId": output_schema_id,
                        "outputNames": output_names,
                    },
                }
            )
        except ValidationError as error:
            raise WorkerClientError("worker finalize request is invalid") from error
        value = self._request(
            "POST",
            "/internal/worker/results/finalize",
            cast(dict[str, object], command.model_dump(mode="json")),
        )
        try:
            accepted = JraWorkerResultFinalizeAccepted.model_validate(value)
        except ValidationError as error:
            raise WorkerClientError("worker finalize response is invalid") from error
        if accepted.attemptId != attempt_id or accepted.submissionId != submission_id:
            raise WorkerClientError("worker finalize response is invalid")
        return accepted

    def complete(
        self,
        attempt_id: str,
        lease_token: str,
        expected_revision: int,
        outcome: str,
        result_manifest_hash: str | None,
        result_references: list[str],
    ) -> dict[str, object]:
        if len(result_references) > MAX_REFERENCES or any(
            not _opaque_reference(reference) for reference in result_references
        ):
            raise WorkerClientError("worker result metadata exceeds bounded limit")
        if result_manifest_hash is not None and (
            len(result_manifest_hash) != 64
            or any(character not in "0123456789abcdef" for character in result_manifest_hash)
        ):
            raise WorkerClientError("worker result metadata is invalid")
        payload: dict[str, object] = {
            "attemptId": attempt_id,
            "leaseToken": lease_token,
            "expectedRevision": expected_revision,
            "outcome": outcome,
            "resultReferences": result_references,
        }
        if result_manifest_hash is not None:
            payload["resultManifestHash"] = result_manifest_hash
        value = self._request("POST", "/internal/worker/complete", payload)
        return _validate_completion(value, attempt_id)

    @staticmethod
    def _process_accepts_cancellation(
        process: Callable[..., object],
        grant: dict[str, object],
        cancellation: threading.Event,
    ) -> bool:
        try:
            inspect.signature(process).bind(grant, cancellation)
            return True
        except (TypeError, ValueError):
            return False

    def run(
        self,
        attempt_id: str,
        lease_token: str,
        expected_revision: int,
        process: Callable[..., dict[str, Any]],
    ) -> dict[str, object]:
        claimed = self.claim(attempt_id, lease_token, expected_revision)
        lost = threading.Event()
        cancellation = threading.Event()
        stop = threading.Event()
        revision_lock = threading.Lock()
        current_revision = int(cast(int, claimed["revision"]))
        current_lease_expires_at = _strict_timestamp(claimed["leaseExpiresAt"])

        def heartbeat_loop() -> None:
            nonlocal current_revision, current_lease_expires_at
            while not stop.wait(self._heartbeat_interval or 0.01):
                try:
                    with revision_lock:
                        revision_snapshot = current_revision
                        lease_snapshot = current_lease_expires_at
                    now = datetime.now(UTC)
                    next_expiry = max(lease_snapshot, now) + timedelta(seconds=60)
                    bounded_expiry = min(next_expiry, now + timedelta(seconds=MAX_LEASE_SECONDS))
                    if bounded_expiry <= lease_snapshot:
                        continue
                    heartbeat = self.heartbeat(
                        attempt_id,
                        lease_token,
                        revision_snapshot,
                        bounded_expiry.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                    )
                    heartbeat_revision = _required_int(heartbeat["revision"])
                    heartbeat_lease_expires_at = _strict_timestamp(heartbeat["leaseExpiresAt"])
                    if (
                        heartbeat_revision <= revision_snapshot
                        or heartbeat_lease_expires_at <= lease_snapshot
                    ):
                        raise WorkerClientError("worker heartbeat is stale")
                    with revision_lock:
                        current_revision = heartbeat_revision
                        current_lease_expires_at = heartbeat_lease_expires_at
                except Exception:
                    lost.set()
                    cancellation.set()
                    return

        thread = threading.Thread(target=heartbeat_loop, daemon=True)
        thread.start()
        try:
            grant = cast(dict[str, object], claimed["inputGrant"])
            if self._process_accepts_cancellation(process, grant, cancellation):
                result = process(dict(grant), cancellation)
            else:
                result = process(dict(grant))
        finally:
            stop.set()
            thread.join()

        if lost.is_set() or cancellation.is_set():
            raise WorkerClientError("worker lease was lost; result was not committed")
        if not isinstance(result, dict):
            raise WorkerClientError("worker result metadata is invalid")
        manifest = result.get("resultManifestHash")
        references = result.get("resultReferences", [])
        outcome = result.get("outcome", "SUCCEEDED")
        if (
            (manifest is not None and not isinstance(manifest, str))
            or not isinstance(references, list)
            or not isinstance(outcome, str)
        ):
            raise WorkerClientError("worker result metadata is invalid")
        if any(not isinstance(reference, str) for reference in references):
            raise WorkerClientError("worker result metadata is invalid")
        with revision_lock:
            completion_revision = current_revision
        return self.complete(
            attempt_id,
            lease_token,
            completion_revision,
            outcome,
            manifest,
            references,
        )

    def run_result_v2(
        self,
        attempt_id: str,
        lease_token: str,
        expected_revision: int,
        process: Callable[..., tuple[WorkerOutput, ...]],
        transfer: Callable[[PreparedOutput, WorkerOutput], str],
        *,
        prepare_idempotency_key: str,
        finalize_idempotency_key: str,
    ) -> JraWorkerResultFinalizeAccepted:
        """Run, stop lease heartbeats, then prepare/transfer/finalize one typed output set."""
        claimed = self.claim(attempt_id, lease_token, expected_revision)
        lost = threading.Event()
        cancellation = threading.Event()
        stop = threading.Event()
        revision_lock = threading.Lock()
        current_revision = int(cast(int, claimed["revision"]))
        current_lease_expires_at = _strict_timestamp(claimed["leaseExpiresAt"])

        def heartbeat_loop() -> None:
            nonlocal current_revision, current_lease_expires_at
            while not stop.wait(self._heartbeat_interval or 0.01):
                try:
                    with revision_lock:
                        revision_snapshot = current_revision
                        lease_snapshot = current_lease_expires_at
                    now = datetime.now(UTC)
                    next_expiry = max(lease_snapshot, now) + timedelta(seconds=60)
                    bounded_expiry = min(next_expiry, now + timedelta(seconds=MAX_LEASE_SECONDS))
                    if bounded_expiry <= lease_snapshot:
                        continue
                    heartbeat = self.heartbeat(
                        attempt_id,
                        lease_token,
                        revision_snapshot,
                        bounded_expiry.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                    )
                    next_revision = _required_int(heartbeat["revision"])
                    next_lease = _strict_timestamp(heartbeat["leaseExpiresAt"])
                    if next_revision <= revision_snapshot or next_lease <= lease_snapshot:
                        raise WorkerClientError("worker heartbeat is stale")
                    with revision_lock:
                        current_revision = next_revision
                        current_lease_expires_at = next_lease
                except Exception:
                    lost.set()
                    cancellation.set()
                    return

        thread = threading.Thread(target=heartbeat_loop, daemon=True)
        thread.start()
        try:
            grant = cast(dict[str, object], claimed["inputGrant"])
            if self._process_accepts_cancellation(process, grant, cancellation):
                outputs = process(dict(grant), cancellation)
            else:
                outputs = process(dict(grant))
        finally:
            stop.set()
            thread.join()
        if lost.is_set() or cancellation.is_set():
            raise WorkerClientError("worker lease was lost; result was not prepared")
        if (
            not isinstance(outputs, tuple)
            or not outputs
            or len(outputs) > 32
            or any(
                not isinstance(output, (JsonWorkerOutput, BinaryWorkerOutput)) for output in outputs
            )
        ):
            raise WorkerClientError("worker typed outputs are invalid")
        typed_outputs = outputs
        output_names = [output.outputName for output in typed_outputs]
        schema_ids = {output.schemaId for output in typed_outputs}
        if len(set(output_names)) != len(output_names) or len(schema_ids) != 1:
            raise WorkerClientError("worker typed outputs are invalid")
        with revision_lock:
            result_revision = current_revision
        prepared = self.prepare_result(
            attempt_id,
            lease_token,
            result_revision,
            typed_outputs,
            prepare_idempotency_key,
        )
        policies = {policy.outputName: policy for policy in prepared.outputs}
        attestations = [
            {
                "outputName": output.outputName,
                "attestationId": transfer(policies[output.outputName], output),
            }
            for output in typed_outputs
        ]
        return self.finalize_result(
            submission_id=prepared.submissionId,
            attempt_id=attempt_id,
            lease_token=lease_token,
            expected_revision=result_revision,
            descriptor_binding_hash=prepared.descriptorBindingHash,
            idempotency_key=finalize_idempotency_key,
            attestations=attestations,
            output_schema_id=next(iter(schema_ids)),
            output_names=output_names,
        )
