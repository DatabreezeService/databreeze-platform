"""Harmless deterministic processor for a bounded synthetic metadata shape."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from ..handler import HandlerContext
from ..models import EngineProgress, FoundationDigestResult, FoundationMetadataParameters

HANDLER_DIGEST = "sha256:57b38f34972333a47d14bd84fc01a37d836673fe636bcfb699d5bfba12f9fb14"


def handle(context: HandlerContext, parameters: dict[str, Any]) -> FoundationDigestResult:
    validated = FoundationMetadataParameters.model_validate(parameters)
    canonical = {
        "items": sorted(
            ({"key": item.key, "value": item.value} for item in validated.items),
            key=lambda item: (item["key"], item["value"]),
        ),
        "tags": sorted(validated.tags),
    }
    encoded = json.dumps(
        canonical, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    context.progress.emit(
        EngineProgress(
            attemptId=context.attempt_id,
            sequence=1,
            phaseKey="foundation.metadata_digest.completed",
            completedUnits=1,
            totalUnits=1,
        )
    )
    return FoundationDigestResult(
        canonicalDigest=hashlib.sha256(encoded).hexdigest(),
        canonicalizationVersion="foundation-metadata-v1",
        itemCount=len(validated.items),
        tagCount=len(validated.tags),
    )
