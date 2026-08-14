"""Strict, content-bounded protocol and action-manifest models."""

from __future__ import annotations

import hashlib
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

MAX_HANDLES = 32


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
OutputName = Annotated[StrictStr, StringConstraints(pattern=r"^[a-z][a-z0-9_.-]{0,127}$")]
LineageHash = Annotated[StrictStr, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
StableIdentifier = Annotated[
    StrictStr,
    StringConstraints(
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    ),
]


class ActionReference(ClosedModel):
    type: SafeName
    version: Annotated[StrictStr, StringConstraints(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$")]
    handlerDigest: Digest


class OpaqueHandle(ClosedModel):
    handleId: Annotated[StrictStr, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")]
    byteLength: Annotated[StrictInt, Field(ge=0, le=16 * 1024 * 1024)]
    sha256: Sha256Hex
    schemaId: SchemaId


class FoundationMetadataItem(ClosedModel):
    key: Literal["category", "priority"]
    value: Annotated[StrictStr, StringConstraints(pattern=r"^[a-z][a-z0-9_-]{0,63}$")]


class FoundationMetadataParameters(ClosedModel):
    items: Annotated[list[FoundationMetadataItem], Field(min_length=1, max_length=2)]
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


class EngineExecutionRequest(ClosedModel):
    protocolVersion: Literal["1.0"]
    requestId: Identifier
    attemptId: Identifier
    correlation: CorrelationMetadata
    action: ActionReference
    inputHandles: Annotated[list[OpaqueHandle], Field(max_length=MAX_HANDLES)]
    outputHandle: OpaqueHandle
    parameters: FoundationMetadataParameters
    deadline: UtcTimestamp
    locale: Literal["vi-VN", "en"]


class JsonRpcRequest(ClosedModel):
    jsonrpc: Literal["2.0"]
    id: (
        Annotated[StrictInt, Field(ge=0)]
        | Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]
    )
    method: Literal["engine.execute"]
    params: EngineExecutionRequest


class FoundationDigestResult(ClosedModel):
    canonicalDigest: Sha256Hex
    canonicalizationVersion: Literal["foundation-metadata-v1"]
    itemCount: Annotated[StrictInt, Field(ge=1, le=64)]
    tagCount: Annotated[StrictInt, Field(ge=0, le=64)]


class JsonWorkerOutput(ClosedModel):
    """Bounded typed bytes for one JSON result; never serialized into JRA control requests."""

    kind: Literal["JSON_RESULT"]
    outputName: OutputName
    schemaId: SchemaId
    sourceLineageHash: LineageHash
    content: Annotated[bytes, Field(min_length=1, max_length=1024 * 1024 * 1024)]

    @property
    def media_type(self) -> str:
        return "application/json"

    @property
    def byte_length(self) -> int:
        return len(self.content)

    @property
    def content_sha256(self) -> str:
        return hashlib.sha256(self.content).hexdigest()


class BinaryWorkerOutput(ClosedModel):
    """Bounded typed opaque bytes for one descriptor-declared binary result."""

    kind: Literal["BINARY_RESULT"]
    outputName: OutputName
    schemaId: SchemaId
    mediaType: Annotated[
        StrictStr,
        StringConstraints(pattern=r"^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$"),
    ]
    sourceLineageHash: LineageHash
    content: Annotated[bytes, Field(min_length=1, max_length=1024 * 1024 * 1024)]

    @property
    def media_type(self) -> str:
        return self.mediaType

    @property
    def byte_length(self) -> int:
        return len(self.content)

    @property
    def content_sha256(self) -> str:
        return hashlib.sha256(self.content).hexdigest()


WorkerOutput = Annotated[JsonWorkerOutput | BinaryWorkerOutput, Field(discriminator="kind")]


class DashboardWidgetSubjectBindings(ClosedModel):
    dashboardId: StableIdentifier
    dashboardVersionId: StableIdentifier
    widgetId: StableIdentifier
    planVersionId: StableIdentifier
    metricVersionId: StableIdentifier
    datasetVersionId: StableIdentifier
    permissionProjectionVersionId: StableIdentifier
    policyVersionId: StableIdentifier
    locale: Literal["vi-VN", "en"]
    timezone: Annotated[
        StrictStr,
        StringConstraints(pattern=r"^[A-Za-z_+-]+(?:/[A-Za-z0-9_+.-]+)+$"),
    ]
    inputSelectorHash: Sha256Hex
    engineVersion: Literal["0.1.0"]
    handlerDigest: Digest


class EngineResult(ClosedModel):
    attemptId: Identifier
    status: Literal["SUCCEEDED"]
    output: FoundationDigestResult


EngineErrorCode = Literal[
    "PARSE_ERROR",
    "MALFORMED_FRAME",
    "MALFORMED_REQUEST",
    "METHOD_NOT_FOUND",
    "UNSUPPORTED_PROTOCOL",
    "UNSUPPORTED_ACTION",
    "UNSUPPORTED_ACTION_VERSION",
    "HANDLER_DIGEST_MISMATCH",
    "VALIDATION_FAILED",
    "DEADLINE_EXCEEDED",
    "RESOURCE_LIMIT_EXCEEDED",
    "DURATION_EXCEEDED",
    "INTERNAL_ERROR",
]


class EngineErrorData(ClosedModel):
    engineCode: EngineErrorCode


class EngineError(ClosedModel):
    code: Literal[
        -32700,
        -32600,
        -32601,
        -32602,
        -32603,
        -32001,
        -32002,
        -32003,
        -32004,
        -32005,
        -32006,
        -32007,
        -32008,
    ]
    message: Literal[
        "Parse error",
        "Invalid Request",
        "Method not found",
        "Invalid params",
        "Internal error",
        "Unsupported protocol",
        "Unsupported action",
        "Unsupported action version",
        "Handler digest mismatch",
        "Validation failed",
        "Deadline exceeded",
        "Resource limit exceeded",
        "Duration exceeded",
    ]
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
