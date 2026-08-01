"""Harmless deterministic processor for a bounded synthetic metadata shape."""

from __future__ import annotations

import hashlib
import json

from ..handler import HandlerContext
from ..models import EngineProgress, FoundationDigestResult, FoundationMetadataParameters


def handle(
    context: HandlerContext, parameters: FoundationMetadataParameters
) -> FoundationDigestResult:
    canonical = {
        "items": sorted(
            ({"key": item.key, "value": item.value} for item in parameters.items),
            key=lambda item: (item["key"], item["value"]),
        ),
        "tags": sorted(parameters.tags),
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
        itemCount=len(parameters.items),
        tagCount=len(parameters.tags),
    )
