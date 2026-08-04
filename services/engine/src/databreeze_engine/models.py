"""Strict, content-bounded protocol and action-manifest models."""

from __future__ import annotations

from typing import Annotated, Any, Literal, Self

from databreeze_contracts.v1 import CorrelationMetadata, Identifier, UtcTimestamp
from pydantic import (
    BaseModel,
    BeforeValidator,
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


def _tuple_from_json(value: Any) -> Any:
    """Accept JSON arrays at the wire boundary while retaining tuple state internally."""
    return tuple(value) if isinstance(value, list) else value


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


class SpreadsheetAuditParameters(ClosedModel):
    """Opaque, versioned identifiers binding a workbook audit to JRA/IAE state."""

    schemaVersion: Literal[1]
    artifactVersionId: Identifier
    jobId: Identifier
    resultManifestId: Identifier


ActionParameters = FoundationMetadataParameters | SpreadsheetAuditParameters


class EngineExecutionRequest(ClosedModel):
    protocolVersion: Literal["1.0"]
    requestId: Identifier
    attemptId: Identifier
    correlation: CorrelationMetadata
    action: ActionReference
    inputHandles: Annotated[list[OpaqueHandle], Field(max_length=MAX_HANDLES)]
    outputHandle: OpaqueHandle
    parameters: FoundationMetadataParameters | SpreadsheetAuditParameters
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


class SpreadsheetAuditSheetSummary(ClosedModel):
    """Value-free workbook geometry returned by the safe auditor processor."""

    name: Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]
    maxRow: Annotated[StrictInt, Field(ge=0, le=1_048_576)]
    maxColumn: Annotated[StrictInt, Field(ge=0, le=16_384)]
    formulaCount: Annotated[StrictInt, Field(ge=0, le=1_000_000)]


class SpreadsheetAuditFindingSummary(ClosedModel):
    """Value-free, exact workbook evidence without formulas or source cell values."""

    sheet: Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]
    address: Annotated[StrictStr, StringConstraints(pattern=r"^[A-Z]{1,3}[1-9][0-9]*$")]
    kind: Literal["FORMULA_FAMILY_OUTLIER", "FORMULA_GAP"]
    severity: Literal["INFO", "WARNING", "ERROR"]
    formulaFingerprint: Sha256Hex


class SpreadsheetAuditProcessorResult(ClosedModel):
    """Deterministic, immutable processor output for the JRA result manifest boundary."""

    schemaVersion: Literal[1]
    artifactVersionId: Identifier
    jobId: Identifier
    resultManifestId: Identifier
    workbookSha256: Sha256Hex
    sheets: Annotated[
        tuple[SpreadsheetAuditSheetSummary, ...],
        BeforeValidator(_tuple_from_json),
        Field(min_length=1, max_length=512),
    ]
    findings: Annotated[
        tuple[SpreadsheetAuditFindingSummary, ...],
        BeforeValidator(_tuple_from_json),
        Field(max_length=10_000),
    ]
    blockedReasons: Annotated[
        tuple[Literal["MACRO", "EXTERNAL_LINK", "UNSUPPORTED_XML"], ...],
        BeforeValidator(_tuple_from_json),
        Field(max_length=3),
    ]
    processorVersion: Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]


ActionOutput = FoundationDigestResult | SpreadsheetAuditProcessorResult


class EngineResult(ClosedModel):
    attemptId: Identifier
    status: Literal["SUCCEEDED"]
    output: FoundationDigestResult | SpreadsheetAuditProcessorResult


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
    "INPUT_UNAVAILABLE",
    "INPUT_HASH_MISMATCH",
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
        -32009,
        -32010,
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
        "Input unavailable",
        "Input hash mismatch",
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
    requiredCapabilities: tuple[Literal["metadata.read", "artifact.read"], ...]
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
