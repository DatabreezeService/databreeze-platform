"""Strict, content-bounded protocol and action-manifest models."""

from __future__ import annotations

import math
import re
from typing import Annotated, Any, Literal, Self

from databreeze_contracts.v1 import CorrelationMetadata, Identifier, UtcTimestamp
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    StringConstraints,
    model_validator,
)

MAX_PARAMETER_DEPTH = 8
MAX_PARAMETER_COLLECTION = 256
MAX_PARAMETER_STRING = 4096
MAX_HANDLES = 32
PROHIBITED_PARAMETER_KEYS = frozenset(
    {
        "callable",
        "command",
        "credential",
        "credentials",
        "environment",
        "env",
        "filesystempath",
        "module",
        "path",
        "script",
        "shell",
        "url",
    }
)
_KEY_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
_WINDOWS_PATH = re.compile(r"^[A-Za-z]:[\\/]")
_COMMAND_PREFIX = re.compile(r"^(?:cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh|sh|bash)\b", re.I)


def _normalized_key(value: str) -> str:
    return re.sub(r"[^a-z]", "", value.lower())


def validate_safe_json(value: Any, *, depth: int = 0) -> None:
    """Reject non-JSON, unbounded, executable, locator, and environment shapes."""
    if depth > MAX_PARAMETER_DEPTH:
        raise ValueError("parameter nesting exceeds the protocol limit")
    if value is None:
        raise ValueError("null is not allowed")
    if isinstance(value, bool):
        return
    if isinstance(value, int):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("non-finite numbers are not allowed")
        return
    if isinstance(value, str):
        if len(value) > MAX_PARAMETER_STRING:
            raise ValueError("parameter string exceeds the protocol limit")
        try:
            value.encode("utf-8", "strict")
        except UnicodeEncodeError as error:
            raise ValueError("invalid Unicode is not allowed") from error
        if (
            "://" in value
            or value.startswith(("/", "\\\\"))
            or _WINDOWS_PATH.match(value)
            or _COMMAND_PREFIX.match(value)
        ):
            raise ValueError("locator and command values are not allowed")
        return
    if isinstance(value, list):
        if len(value) > MAX_PARAMETER_COLLECTION:
            raise ValueError("parameter list exceeds the protocol limit")
        for item in value:
            validate_safe_json(item, depth=depth + 1)
        return
    if isinstance(value, dict):
        if len(value) > MAX_PARAMETER_COLLECTION:
            raise ValueError("parameter object exceeds the protocol limit")
        for key, item in value.items():
            if not isinstance(key, str) or not _KEY_PATTERN.fullmatch(key):
                raise ValueError("parameter keys must use the safe protocol grammar")
            if _normalized_key(key) in PROHIBITED_PARAMETER_KEYS:
                raise ValueError("prohibited parameter shape")
            validate_safe_json(item, depth=depth + 1)
        return
    raise ValueError("non-JSON values are not allowed")


class ClosedModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        frozen=True,
        allow_inf_nan=False,
        validate_default=True,
    )

    @model_validator(mode="before")
    @classmethod
    def reject_unexpected_nulls(cls, value: Any) -> Any:
        if isinstance(value, dict) and any(item is None for item in value.values()):
            raise ValueError("null is not allowed")
        return value


SafeName = Annotated[StrictStr, StringConstraints(pattern=r"^[a-z][a-z0-9_.-]{0,127}$")]
Digest = Annotated[StrictStr, StringConstraints(pattern=r"^sha256:[0-9a-f]{64}$")]
Sha256Hex = Annotated[StrictStr, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
SchemaId = Annotated[StrictStr, StringConstraints(pattern=r"^[a-z][a-z0-9_.-]{0,127}$")]


class ActionReference(ClosedModel):
    type: SafeName
    version: Annotated[StrictStr, StringConstraints(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$")]
    handlerDigest: Digest


class OpaqueHandle(ClosedModel):
    handleId: Annotated[StrictStr, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")]
    byteLength: Annotated[StrictInt, Field(ge=0, le=16 * 1024 * 1024)]
    sha256: Sha256Hex
    schemaId: SchemaId


class EngineExecutionRequest(ClosedModel):
    protocolVersion: Literal["1.0"]
    requestId: Identifier
    attemptId: Identifier
    correlation: CorrelationMetadata
    action: ActionReference
    inputHandles: Annotated[list[OpaqueHandle], Field(max_length=MAX_HANDLES)]
    outputHandle: OpaqueHandle
    parameters: dict[str, Any]
    deadline: UtcTimestamp
    locale: Literal["vi-VN", "en"]

    @model_validator(mode="after")
    def validate_parameters(self) -> Self:
        validate_safe_json(self.parameters)
        return self


class JsonRpcRequest(ClosedModel):
    jsonrpc: Literal["2.0"]
    id: (
        Annotated[StrictInt, Field(ge=0)]
        | Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]
    )
    method: Literal["engine.execute"]
    params: EngineExecutionRequest


class FoundationMetadataItem(ClosedModel):
    key: Annotated[StrictStr, StringConstraints(pattern=r"^[a-z][a-z0-9_-]{0,63}$")]
    value: Annotated[StrictStr, StringConstraints(min_length=1, max_length=512)]


class FoundationMetadataParameters(ClosedModel):
    items: Annotated[list[FoundationMetadataItem], Field(min_length=1, max_length=64)]
    tags: Annotated[
        list[Annotated[StrictStr, StringConstraints(pattern=r"^[a-z][a-z0-9_-]{0,63}$")]],
        Field(max_length=64),
    ]

    @model_validator(mode="after")
    def reject_duplicates(self) -> Self:
        if len({item.key for item in self.items}) != len(self.items):
            raise ValueError("metadata item keys must be unique")
        if len(set(self.tags)) != len(self.tags):
            raise ValueError("metadata tags must be unique")
        return self


class FoundationDigestResult(ClosedModel):
    canonicalDigest: Sha256Hex
    canonicalizationVersion: Literal["foundation-metadata-v1"]
    itemCount: Annotated[StrictInt, Field(ge=1, le=64)]
    tagCount: Annotated[StrictInt, Field(ge=0, le=64)]


class EngineResult(ClosedModel):
    attemptId: Identifier
    status: Literal["SUCCEEDED"]
    output: FoundationDigestResult


EngineErrorCode = Literal[
    "MALFORMED_FRAME",
    "MALFORMED_REQUEST",
    "UNSUPPORTED_PROTOCOL",
    "UNSUPPORTED_ACTION",
    "UNSUPPORTED_ACTION_VERSION",
    "HANDLER_DIGEST_MISMATCH",
    "VALIDATION_FAILED",
    "DEADLINE_EXCEEDED",
    "INTERNAL_ERROR",
]


class EngineErrorData(ClosedModel):
    pass


class EngineError(ClosedModel):
    code: EngineErrorCode
    data: EngineErrorData


class JsonRpcSuccessResponse(ClosedModel):
    jsonrpc: Literal["2.0"]
    id: (
        Annotated[StrictInt, Field(ge=0)]
        | Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]
    )
    result: EngineResult


class JsonRpcErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True, allow_inf_nan=False)

    jsonrpc: Literal["2.0"]
    id: (
        Annotated[StrictInt, Field(ge=0)]
        | Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]
        | None
    )
    error: EngineError


class EngineProgress(ClosedModel):
    attemptId: Identifier
    sequence: Annotated[StrictInt, Field(ge=1, le=1_000_000)]
    phaseKey: SafeName
    completedUnits: Annotated[StrictInt, Field(ge=0)]
    totalUnits: Annotated[StrictInt, Field(ge=1)]

    @model_validator(mode="after")
    def completed_does_not_exceed_total(self) -> Self:
        if self.completedUnits > self.totalUnits:
            raise ValueError("completed units exceed total units")
        return self


class ResourceLimits(ClosedModel):
    maxInputBytes: Annotated[StrictInt, Field(gt=0, le=16 * 1024 * 1024)]
    maxOutputBytes: Annotated[StrictInt, Field(gt=0, le=1024 * 1024)]
    maxMemoryBytes: Annotated[StrictInt, Field(ge=16 * 1024 * 1024, le=1024 * 1024 * 1024)]
    maxTemporaryStorageBytes: Annotated[StrictInt, Field(ge=0, le=1024 * 1024 * 1024)]
    maxDurationMilliseconds: Annotated[StrictInt, Field(gt=0, le=60_000)]
    progressCadenceMilliseconds: Annotated[StrictInt, Field(ge=100, le=10_000)]


class ActionManifest(ClosedModel):
    actionType: SafeName
    actionVersion: Annotated[StrictStr, StringConstraints(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$")]
    handlerDigest: Digest
    engineVersion: Literal["0.1.0"]
    protocolVersion: Literal["1.0"]
    inputSchemaId: SchemaId
    outputSchemaId: SchemaId
    executionModes: tuple[Literal["LOCAL", "CLOUD"], ...]
    executionTargets: tuple[Literal["DESKTOP", "CLOUD_WORKER"], ...]
    dataModes: tuple[Literal["LOCAL", "CLOUD", "HYBRID"], ...]
    requiredCapabilities: tuple[Literal["metadata.read"], ...]
    sideEffectClass: Literal["NONE", "REVERSIBLE", "EXTERNAL", "DESTRUCTIVE"]
    riskClass: Literal["READ_ONLY", "LOW", "CONSEQUENTIAL", "RESTRICTED"]
    determinism: Literal["DETERMINISTIC", "SEEDED"]
    seedPolicy: Literal["NONE", "REQUEST_BOUND"]
    resources: ResourceLimits
    networkPermitted: StrictBool
    filesystemWritesPermitted: StrictBool
    externalProvidersPermitted: StrictBool

    @model_validator(mode="after")
    def enforce_foundation_safety(self) -> Self:
        collection_fields = (
            self.executionModes,
            self.executionTargets,
            self.dataModes,
            self.requiredCapabilities,
        )
        if any(not values or len(set(values)) != len(values) for values in collection_fields):
            raise ValueError("manifest collections must be non-empty and unique")
        if self.determinism == "DETERMINISTIC" and self.seedPolicy != "NONE":
            raise ValueError("deterministic actions cannot accept a seed")
        return self
