"""Immutable closed registry of reviewed, versioned handlers."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
from types import MappingProxyType

from .handler import ActionHandler
from .models import ActionManifest, ResourceLimits
from .processors.metadata_digest import HANDLER_DIGEST, handle


class RegistryError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class ActionDefinition:
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


class ActionRegistry:
    def __init__(self, definitions: tuple[ActionDefinition, ...]) -> None:
        actions: dict[tuple[str, str], ActionDefinition] = {}
        action_types: set[str] = set()
        for definition in definitions:
            manifest = ActionManifest.model_validate(definition.manifest)
            action_boundary = manifest.actionType.replace("_", "-").split(".")
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
            key = (manifest.actionType, manifest.actionVersion)
            if key in actions:
                raise RegistryError("DUPLICATE_ACTION_VERSION")
            actions[key] = ActionDefinition(manifest=manifest, handler=definition.handler)
            action_types.add(manifest.actionType)
        self._actions: Mapping[tuple[str, str], ActionDefinition] = MappingProxyType(actions)
        self._action_types = frozenset(action_types)
        self._manifests = tuple(
            definition.manifest
            for _, definition in sorted(actions.items(), key=lambda item: item[0])
        )

    @property
    def actions(self) -> Mapping[tuple[str, str], ActionDefinition]:
        return self._actions

    @property
    def manifests(self) -> tuple[ActionManifest, ...]:
        return self._manifests

    def resolve(self, action_type: str, version: str, handler_digest: str) -> ActionDefinition:
        key = (action_type, version)
        definition = self._actions.get(key)
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
    manifest = ActionManifest(
        actionType="foundation.metadata-digest",
        actionVersion="1.0.0",
        handlerDigest=HANDLER_DIGEST,
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
    return ActionRegistry((ActionDefinition(manifest=manifest, handler=handle),))
