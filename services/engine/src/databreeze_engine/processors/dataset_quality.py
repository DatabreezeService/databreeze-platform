"""Deterministic, value-free dataset quality evaluation (DSM-013, DSM-015, DSM-020)."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from .dataset_profile import DatasetProfile

QualitySeverity = Literal["INFO", "WARNING", "ERROR"]
QualityState = Literal["PASS", "PASS_WITH_WARNINGS", "BLOCKED", "INCOMPLETE"]


class QualityFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    ruleId: StrictStr = Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    severity: QualitySeverity
    messageCode: StrictStr = Field(pattern=r"^[A-Z][A-Z0-9_.-]{0,95}$")
    occurrenceCount: StrictInt = Field(ge=0)
    detailHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")


class DatasetQualityEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    profileFingerprint: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    rowCountScanned: StrictInt = Field(ge=0)
    qualityState: QualityState
    findings: tuple[QualityFinding, ...]
    resultFingerprint: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")


def _digest(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def profile_fingerprint(profile: DatasetProfile) -> str:
    """Return a stable digest of profile metadata, never source values."""
    return _digest(profile.model_dump(mode="json"))


def _required_count(profile: DatasetProfile, field: str) -> int | None:
    for summary in profile.fields:
        if summary.field == field:
            return (
                summary.stateCounts["MISSING"]
                + summary.stateCounts["NULL"]
                + summary.stateCounts["BLANK"]
            )
    return None


def evaluate_required_fields(
    profile: DatasetProfile,
    required_rules: Sequence[Mapping[str, object]],
) -> DatasetQualityEvaluation:
    """Evaluate bounded REQUIRED rules from a profile without receiving row values."""
    findings: list[QualityFinding] = []
    for rule in required_rules:
        rule_id = rule.get("ruleId")
        field = rule.get("field")
        severity = rule.get("severity", "ERROR")
        if not isinstance(rule_id, str) or not isinstance(field, str):
            raise ValueError("required rules need a ruleId and field")
        if severity not in {"ERROR", "WARNING"}:
            raise ValueError("required rule severity is invalid")
        missing_count = _required_count(profile, field)
        occurrence_count = profile.sourceRowCount if missing_count is None else missing_count
        message_code = "FIELD_NOT_PROFILED" if missing_count is None else "REQUIRED_VALUE_MISSING"
        finding_digest = _digest(
            {
                "ruleId": rule_id,
                "field": field,
                "occurrenceCount": occurrence_count,
                "messageCode": message_code,
            }
        )
        if occurrence_count > 0 or missing_count is None:
            findings.append(
                QualityFinding(
                    ruleId=rule_id,
                    severity=severity,
                    messageCode=message_code,
                    occurrenceCount=occurrence_count,
                    detailHash=finding_digest,
                )
            )
    quality_state: QualityState
    if any(finding.severity == "ERROR" for finding in findings):
        quality_state = "BLOCKED"
    elif any(finding.severity == "WARNING" for finding in findings):
        quality_state = "PASS_WITH_WARNINGS"
    else:
        quality_state = "PASS"
    profile_digest = profile_fingerprint(profile)
    result_digest = _digest(
        {
            "profileFingerprint": profile_digest,
            "rowCountScanned": profile.rowCountScanned,
            "qualityState": quality_state,
            "findings": [finding.model_dump(mode="json") for finding in findings],
        }
    )
    return DatasetQualityEvaluation(
        profileFingerprint=profile_digest,
        rowCountScanned=profile.rowCountScanned,
        qualityState=quality_state,
        findings=tuple(findings),
        resultFingerprint=result_digest,
    )
