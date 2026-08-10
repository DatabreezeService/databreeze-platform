"""Immutable closed registry of reviewed, versioned handlers."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from functools import lru_cache
from importlib.resources import files
from types import MappingProxyType
from typing import Any, cast

from pydantic import BaseModel

from .dda_processor_digests import DDA_PROCESSOR_DIGESTS, verify_dda_processor_digests
from .handler import AnyActionHandler, HandlerContext
from .models import ActionManifest, ResourceLimits
from .processors import (
    dda_etl_execute,
    dda_etl_intake,
    dda_etl_preview,
    dda_etl_profile,
    dda_folder_intake,
    dda_materialize_query,
    dda_materialize_snapshot,
    metadata_digest,
)

REVIEWED_METADATA_HANDLER_DIGEST = (
    "sha256:6de342f9b36d0e1e05a4908ea7796e1564c45504f96256e2b4957aa8d0bbd9be"
)


class RegistryError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class _ActionDefinition:
    manifest: ActionManifest
    handler: AnyActionHandler


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


def _keyword_handler(processor: Callable[..., BaseModel]) -> AnyActionHandler:
    def handle(_context: HandlerContext, parameters: Any) -> BaseModel:
        if not isinstance(parameters, BaseModel):
            raise TypeError("ACTION_PARAMETERS_INVALID")
        return processor(**parameters.model_dump())

    return cast(AnyActionHandler, handle)


def _model_handler(processor: Callable[[Any], BaseModel]) -> AnyActionHandler:
    def handle(_context: HandlerContext, parameters: Any) -> BaseModel:
        if not isinstance(parameters, BaseModel):
            raise TypeError("ACTION_PARAMETERS_INVALID")
        return processor(parameters)

    return cast(AnyActionHandler, handle)


def _reviewed_dda_definitions() -> tuple[_ActionDefinition, ...]:
    """Build the fixed DDA definitions only after every artifact pin verifies."""
    verify_dda_processor_digests()
    definitions = (
        (
            "dda.etl.execute",
            "dda_etl_execute.py",
            "dda.etl-execute-parameters.v1",
            "dda.etl-execute-result.v1",
            _keyword_handler(dda_etl_execute.execute_etl),
        ),
        (
            "dda.etl.intake",
            "dda_etl_intake.py",
            "dda.etl-intake-parameters.v1",
            "dda.etl-intake-result.v1",
            _keyword_handler(dda_etl_intake.inspect_tabular_bytes),
        ),
        (
            "dda.etl.preview",
            "dda_etl_preview.py",
            "dda.etl-preview-parameters.v1",
            "dda.etl-preview-result.v1",
            _keyword_handler(dda_etl_preview.preview_etl),
        ),
        (
            "dda.etl.profile",
            "dda_etl_profile.py",
            "dda.etl-profile-parameters.v1",
            "dda.etl-profile-result.v1",
            _keyword_handler(dda_etl_profile.profile_quality),
        ),
        (
            "dda.folder.intake",
            "dda_folder_intake.py",
            "dda.folder-intake-parameters.v1",
            "dda.folder-intake-result.v1",
            _model_handler(dda_folder_intake.admit_folder_file),
        ),
        (
            "dda.materialize.query",
            "dda_materialize_query.py",
            "dda.materialize-query-parameters.v1",
            "dda.materialize-query-result.v1",
            _model_handler(dda_materialize_query.materialize_query),
        ),
        (
            "dda.materialize.snapshot",
            "dda_materialize_snapshot.py",
            "dda.materialize-snapshot-parameters.v1",
            "dda.materialize-snapshot-result.v1",
            _model_handler(dda_materialize_snapshot.materialize_snapshot),
        ),
    )
    resources = ResourceLimits(
        maxInputBytes=16 * 1024 * 1024,
        maxOutputBytes=1024 * 1024,
        maxMemoryBytes=64 * 1024 * 1024,
        maxTemporaryStorageBytes=0,
        maxDurationMilliseconds=5_000,
        progressCadenceMilliseconds=500,
    )
    return tuple(
        _ActionDefinition(
            manifest=ActionManifest(
                actionType=action_type,
                actionVersion="1.0.0",
                handlerDigest=DDA_PROCESSOR_DIGESTS[artifact_name],
                engineVersion="0.1.0",
                protocolVersion="1.0",
                inputSchemaId=input_schema_id,
                outputSchemaId=output_schema_id,
                executionModes=("LOCAL", "CLOUD"),
                executionTargets=("DESKTOP", "CLOUD_WORKER"),
                dataModes=("LOCAL", "CLOUD", "HYBRID"),
                requiredCapabilities=("metadata.read",),
                sideEffectClass="NONE",
                riskClass="READ_ONLY",
                determinism="DETERMINISTIC",
                seedPolicy="NONE",
                resources=resources,
                networkPermitted=False,
                filesystemWritesPermitted=False,
                externalProvidersPermitted=False,
            ),
            handler=handler,
        )
        for action_type, artifact_name, input_schema_id, output_schema_id, handler in definitions
    )


@dataclass(frozen=True, slots=True, init=False)
class ActionRegistry:
    """Closed built-in registry; callers cannot provide definitions or callables."""

    _actions: Mapping[tuple[str, str], _ActionDefinition] = field(init=False, repr=False)
    _action_types: frozenset[str] = field(init=False, repr=False)
    _manifests: tuple[ActionManifest, ...] = field(init=False, repr=False)

    def __init__(self) -> None:
        definitions = (_reviewed_definition(), *_reviewed_dda_definitions())
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
