"""Immutable closed registry of reviewed, versioned handlers."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from importlib.resources import files
from types import MappingProxyType

from .folder_autopilot_contracts import AutopilotPlan, AutopilotPlanRequest
from .handler import ActionHandler
from .models import (
    ActionManifest,
    FoundationDigestResult,
    FoundationMetadataParameters,
    ResourceLimits,
    SpreadsheetAuditParameters,
    SpreadsheetAuditProcessorResult,
)
from .processors import handle_spreadsheet_auditor, metadata_digest
from .processors.folder_autopilot_action import (
    ACTION_TYPE as FOLDER_AUTOPILOT_ACTION_TYPE,
)
from .processors.folder_autopilot_action import (
    ACTION_VERSION as FOLDER_AUTOPILOT_ACTION_VERSION,
)
from .processors.folder_autopilot_action import (
    INPUT_SCHEMA_ID as FOLDER_AUTOPILOT_INPUT_SCHEMA_ID,
)
from .processors.folder_autopilot_action import (
    OUTPUT_SCHEMA_ID as FOLDER_AUTOPILOT_OUTPUT_SCHEMA_ID,
)
from .processors.folder_autopilot_action import handle as handle_folder_autopilot
from .processors.spreadsheet_auditor_action import (
    ACTION_TYPE as SPREADSHEET_AUDITOR_ACTION_TYPE,
)
from .processors.spreadsheet_auditor_action import (
    ACTION_VERSION as SPREADSHEET_AUDITOR_ACTION_VERSION,
)
from .processors.spreadsheet_auditor_action import (
    INPUT_SCHEMA_ID as SPREADSHEET_AUDITOR_INPUT_SCHEMA_ID,
)
from .processors.spreadsheet_auditor_action import (
    OUTPUT_SCHEMA_ID as SPREADSHEET_AUDITOR_OUTPUT_SCHEMA_ID,
)

REVIEWED_METADATA_HANDLER_DIGEST = (
    "sha256:6de342f9b36d0e1e05a4908ea7796e1564c45504f96256e2b4957aa8d0bbd9be"
)
REVIEWED_SPREADSHEET_AUDITOR_HANDLER_DIGEST = (
    "sha256:9f2f92194aa2e08e79afaeb791f67a481e35c183b2b359f83348eea67389b079"
)
REVIEWED_FOLDER_AUTOPILOT_HANDLER_DIGEST = (
    "sha256:9507d317afda56244aed2fd675333cd940c7e2fd180ddac20a7acff05239dbba"
)


class RegistryError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class _ActionDefinition:
    manifest: ActionManifest
    handler: ActionHandler


def canonical_manifest_bytes(manifest: ActionManifest) -> bytes:
    return json.dumps(
        manifest.model_dump(mode="json"),
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def manifest_digest(manifest: ActionManifest) -> str:
    return "sha256:" + hashlib.sha256(canonical_manifest_bytes(manifest)).hexdigest()


def _verify_reviewed_handler_artifact(content: bytes | None = None) -> None:
    artifact = content
    if artifact is None:
        try:
            artifact = (
                files("databreeze_engine.processors").joinpath("metadata_digest.py").read_bytes()
            )
        except OSError:
            raise RegistryError("HANDLER_ARTIFACT_UNAVAILABLE") from None
    actual = "sha256:" + hashlib.sha256(artifact).hexdigest()
    if actual != REVIEWED_METADATA_HANDLER_DIGEST:
        raise RegistryError("HANDLER_ARTIFACT_DIGEST_MISMATCH")


def _verify_reviewed_spreadsheet_auditor_artifact(content: bytes | None = None) -> None:
    artifact = content
    if artifact is None:
        try:
            action = (
                files("databreeze_engine.processors")
                .joinpath("spreadsheet_auditor_action.py")
                .read_bytes()
            )
            parser = (
                files("databreeze_engine.processors")
                .joinpath("spreadsheet_auditor.py")
                .read_bytes()
            )
            artifact = action + b"\0" + parser
        except OSError:
            raise RegistryError("HANDLER_ARTIFACT_UNAVAILABLE") from None
    actual = "sha256:" + hashlib.sha256(artifact).hexdigest()
    if actual != REVIEWED_SPREADSHEET_AUDITOR_HANDLER_DIGEST:
        raise RegistryError("HANDLER_ARTIFACT_DIGEST_MISMATCH")


def _verify_reviewed_folder_autopilot_artifact(content: bytes | None = None) -> None:
    artifact = content
    if artifact is None:
        try:
            processors = files("databreeze_engine.processors")
            artifact = b"\0".join(
                processors.joinpath(name).read_bytes()
                for name in (
                    "folder_autopilot_action.py",
                    "folder_autopilot.py",
                    "folder_autopilot_plan.py",
                )
            )
        except OSError:
            raise RegistryError("HANDLER_ARTIFACT_UNAVAILABLE") from None
    actual = "sha256:" + hashlib.sha256(artifact).hexdigest()
    if actual != REVIEWED_FOLDER_AUTOPILOT_HANDLER_DIGEST:
        raise RegistryError("HANDLER_ARTIFACT_DIGEST_MISMATCH")


def _validate_action_boundary(action_type: str) -> None:
    action_boundary = action_type.replace("_", "-").split(".")
    prohibited_tokens = {
        "billing",
        "funds",
        "payment",
        "reversal",
        "settlement",
        "transfer",
        "withholding",
    }
    if any(
        token in prohibited_tokens
        for component in action_boundary
        for token in component.split("-")
    ):
        raise RegistryError("PROHIBITED_ACTION_BOUNDARY")


def _reviewed_definition() -> _ActionDefinition:
    _verify_reviewed_handler_artifact()
    manifest = ActionManifest(
        actionType="foundation.metadata-digest",
        actionVersion="1.0.0",
        handlerDigest=REVIEWED_METADATA_HANDLER_DIGEST,
        engineVersion="0.1.0",
        protocolVersion="1.0",
        inputSchemaId="foundation.metadata-fixture.v1",
        outputSchemaId="foundation.metadata-digest-result.v1",
        executionModes=("LOCAL", "CLOUD"),
        executionTargets=("DESKTOP", "CLOUD_WORKER"),
        dataModes=("LOCAL", "CLOUD", "HYBRID"),
        requiredCapabilities=("metadata.read",),
        sideEffectClass="NONE",
        riskClass="READ_ONLY",
        determinism="DETERMINISTIC",
        seedPolicy="NONE",
        resources=ResourceLimits(
            maxInputBytes=16 * 1024 * 1024,
            maxOutputBytes=1024 * 1024,
            maxMemoryBytes=64 * 1024 * 1024,
            maxTemporaryStorageBytes=0,
            maxDurationMilliseconds=5_000,
            progressCadenceMilliseconds=500,
        ),
        networkPermitted=False,
        filesystemWritesPermitted=False,
        externalProvidersPermitted=False,
    )
    return _ActionDefinition(manifest=manifest, handler=metadata_digest.handle)


def _reviewed_spreadsheet_auditor_definition() -> _ActionDefinition:
    _verify_reviewed_spreadsheet_auditor_artifact()
    manifest = ActionManifest(
        actionType=SPREADSHEET_AUDITOR_ACTION_TYPE,
        actionVersion=SPREADSHEET_AUDITOR_ACTION_VERSION,
        handlerDigest=REVIEWED_SPREADSHEET_AUDITOR_HANDLER_DIGEST,
        engineVersion="0.1.0",
        protocolVersion="1.0",
        inputSchemaId=SPREADSHEET_AUDITOR_INPUT_SCHEMA_ID,
        outputSchemaId=SPREADSHEET_AUDITOR_OUTPUT_SCHEMA_ID,
        executionModes=("LOCAL", "CLOUD"),
        executionTargets=("DESKTOP", "CLOUD_WORKER"),
        dataModes=("LOCAL", "CLOUD", "HYBRID"),
        requiredCapabilities=("artifact.read",),
        sideEffectClass="NONE",
        riskClass="READ_ONLY",
        determinism="DETERMINISTIC",
        seedPolicy="NONE",
        resources=ResourceLimits(
            maxInputBytes=16 * 1024 * 1024,
            maxOutputBytes=1024 * 1024,
            maxMemoryBytes=256 * 1024 * 1024,
            maxTemporaryStorageBytes=0,
            maxDurationMilliseconds=30_000,
            progressCadenceMilliseconds=500,
        ),
        networkPermitted=False,
        filesystemWritesPermitted=False,
        externalProvidersPermitted=False,
    )
    return _ActionDefinition(manifest=manifest, handler=handle_spreadsheet_auditor)


def _reviewed_folder_autopilot_definition() -> _ActionDefinition:
    _verify_reviewed_folder_autopilot_artifact()
    manifest = ActionManifest(
        actionType=FOLDER_AUTOPILOT_ACTION_TYPE,
        actionVersion=FOLDER_AUTOPILOT_ACTION_VERSION,
        handlerDigest=REVIEWED_FOLDER_AUTOPILOT_HANDLER_DIGEST,
        engineVersion="0.1.0",
        protocolVersion="1.0",
        inputSchemaId=FOLDER_AUTOPILOT_INPUT_SCHEMA_ID,
        outputSchemaId=FOLDER_AUTOPILOT_OUTPUT_SCHEMA_ID,
        executionModes=("LOCAL",),
        executionTargets=("DESKTOP",),
        dataModes=("LOCAL",),
        requiredCapabilities=("metadata.read",),
        sideEffectClass="NONE",
        riskClass="READ_ONLY",
        determinism="DETERMINISTIC",
        seedPolicy="NONE",
        resources=ResourceLimits(
            maxInputBytes=16 * 1024 * 1024,
            maxOutputBytes=1024 * 1024,
            maxMemoryBytes=64 * 1024 * 1024,
            maxTemporaryStorageBytes=0,
            maxDurationMilliseconds=5_000,
            progressCadenceMilliseconds=500,
        ),
        networkPermitted=False,
        filesystemWritesPermitted=False,
        externalProvidersPermitted=False,
    )
    return _ActionDefinition(manifest=manifest, handler=handle_folder_autopilot)


def validate_action_parameters(manifest: ActionManifest, parameters: object) -> bool:
    if manifest.inputSchemaId == "foundation.metadata-fixture.v1":
        return isinstance(parameters, FoundationMetadataParameters)
    if manifest.inputSchemaId == SPREADSHEET_AUDITOR_INPUT_SCHEMA_ID:
        return isinstance(parameters, SpreadsheetAuditParameters)
    if manifest.inputSchemaId == FOLDER_AUTOPILOT_INPUT_SCHEMA_ID:
        return isinstance(parameters, AutopilotPlanRequest)
    return True


def validate_action_output(manifest: ActionManifest, output: object) -> bool:
    if manifest.outputSchemaId == "foundation.metadata-digest-result.v1":
        return isinstance(output, FoundationDigestResult)
    if manifest.outputSchemaId == SPREADSHEET_AUDITOR_OUTPUT_SCHEMA_ID:
        return isinstance(output, SpreadsheetAuditProcessorResult)
    if manifest.outputSchemaId == FOLDER_AUTOPILOT_OUTPUT_SCHEMA_ID:
        return isinstance(output, AutopilotPlan)
    return True


@dataclass(frozen=True, slots=True, init=False)
class ActionRegistry:
    """Closed built-in registry; callers cannot provide definitions or callables."""

    _actions: Mapping[tuple[str, str], _ActionDefinition] = field(init=False, repr=False)
    _action_types: frozenset[str] = field(init=False, repr=False)
    _manifests: tuple[ActionManifest, ...] = field(init=False, repr=False)

    def __init__(self) -> None:
        definitions = (
            _reviewed_definition(),
            _reviewed_spreadsheet_auditor_definition(),
            _reviewed_folder_autopilot_definition(),
        )
        for definition in definitions:
            _validate_action_boundary(definition.manifest.actionType)
        actions = {
            (definition.manifest.actionType, definition.manifest.actionVersion): definition
            for definition in definitions
        }
        object.__setattr__(
            self,
            "_actions",
            MappingProxyType(actions),
        )
        object.__setattr__(
            self,
            "_action_types",
            frozenset(definition.manifest.actionType for definition in definitions),
        )
        object.__setattr__(
            self,
            "_manifests",
            tuple(definition.manifest for definition in definitions),
        )

    @property
    def manifests(self) -> tuple[ActionManifest, ...]:
        return self._manifests

    def resolve(self, action_type: str, version: str, handler_digest: str) -> _ActionDefinition:
        definition = self._actions.get((action_type, version))
        if definition is None:
            code = (
                "UNSUPPORTED_ACTION_VERSION"
                if action_type in self._action_types
                else "UNSUPPORTED_ACTION"
            )
            raise RegistryError(code)
        if definition.manifest.handlerDigest != handler_digest:
            raise RegistryError("HANDLER_DIGEST_MISMATCH")
        return definition


@lru_cache(maxsize=1)
def default_registry() -> ActionRegistry:
    return ActionRegistry()
