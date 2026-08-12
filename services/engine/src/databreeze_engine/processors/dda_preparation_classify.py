"""DDA-053: classify automatic preparation before enqueueing accepted jobs."""

from __future__ import annotations

from typing import Any

SAFE_KINDS = {
    "RENAME_COLUMNS",
    "TRIM_TEXT",
    "NORMALIZE_TEXT",
    "CAST_TYPE",
    "SELECT_COLUMNS",
}


def _accounting_complete(counts: dict[str, Any]) -> bool:
    return (
        int(counts.get("unchanged", -1))
        + int(counts.get("changed", -1))
        + int(counts.get("rejected", -1))
        + int(counts.get("quarantined", -1))
        + int(counts.get("unsupported", -1))
        == int(counts.get("input", -2))
    )


def classify_preparation(*, plan: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    reason_codes: list[str] = []
    if profile.get("policy") != "SAFE_NON_LOSSY":
        reason_codes.append("POLICY_DISABLED")
    accounting = profile.get("accounting", {})
    if not isinstance(accounting, dict) or not _accounting_complete(accounting):
        reason_codes.append("INCOMPLETE_ACCOUNTING")
    if int(profile.get("omittedRows", 0)) > 0:
        reason_codes.append("OMITTED_ROWS")
    if int(profile.get("unaccountedRejects", 0)) > 0:
        reason_codes.append("UNACCOUNTED_REJECTS")
    if profile.get("sourceOverlap") is True:
        reason_codes.append("SOURCE_OVERLAP")
    if list(profile.get("blockedQualityDimensions") or []):
        reason_codes.append("QUALITY_BLOCKED")
    if profile.get("externalEnrichment") is True:
        reason_codes.append("EXTERNAL_ENRICHMENT")

    steps = plan.get("steps") or []
    if isinstance(steps, list):
        for step in steps:
            if not isinstance(step, dict):
                reason_codes.append("UNSAFE_STEP")
                break
            if (
                step.get("omitsRows") is True
                or step.get("reversible") is not True
                or step.get("kind") not in SAFE_KINDS
            ):
                reason_codes.append("UNSAFE_STEP")
                break

    blocked = {
        "POLICY_DISABLED",
        "INCOMPLETE_ACCOUNTING",
        "OMITTED_ROWS",
        "UNACCOUNTED_REJECTS",
        "SOURCE_OVERLAP",
        "QUALITY_BLOCKED",
        "EXTERNAL_ENRICHMENT",
        "UNSAFE_STEP",
    }
    unique = list(dict.fromkeys(reason_codes))
    if any(code in blocked for code in unique):
        return {"decision": "BLOCKED", "reasonCodes": unique}

    if int(profile.get("ambiguousMappings", 0)) > 0:
        unique.append("AMBIGUOUS_MAPPING")
    if int(profile.get("incompatibleTypes", 0)) > 0:
        unique.append("INCOMPATIBLE_TYPE")
    if profile.get("changedDuplicateKey") is True:
        unique.append("CHANGED_DUPLICATE_KEY")
    if profile.get("currencyInference") is True:
        unique.append("CURRENCY_INFERENCE")
    if profile.get("timezoneInference") is True:
        unique.append("TIMEZONE_INFERENCE")
    if profile.get("sampledOnly") is True:
        unique.append("SAMPLED_PROFILE")
    if profile.get("sourceDrift") is True:
        unique.append("SOURCE_DRIFT")

    unique = list(dict.fromkeys(unique))
    if unique:
        return {"decision": "REVIEW_REQUIRED", "reasonCodes": unique}
    return {"decision": "AUTO_ACCEPT_SAFE", "reasonCodes": []}
