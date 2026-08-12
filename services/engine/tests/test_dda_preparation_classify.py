from __future__ import annotations

from databreeze_engine.processors.dda_preparation_classify import classify_preparation


def test_safe_non_lossy_auto_accepts_reversible_plan() -> None:
    result = classify_preparation(
        plan={
            "steps": [
                {"kind": "RENAME_COLUMNS", "reversible": True, "omitsRows": False},
                {"kind": "TRIM_TEXT", "reversible": True, "omitsRows": False},
            ]
        },
        profile={
            "policy": "SAFE_NON_LOSSY",
            "omittedRows": 0,
            "ambiguousMappings": 0,
            "incompatibleTypes": 0,
            "unaccountedRejects": 0,
            "sourceOverlap": False,
            "changedDuplicateKey": False,
            "currencyInference": False,
            "timezoneInference": False,
            "externalEnrichment": False,
            "blockedQualityDimensions": [],
            "sampledOnly": False,
            "sourceDrift": False,
            "accounting": {
                "input": 5,
                "output": 5,
                "unchanged": 4,
                "changed": 1,
                "rejected": 0,
                "quarantined": 0,
                "unsupported": 0,
            },
        },
    )
    assert result["decision"] == "AUTO_ACCEPT_SAFE"
    assert result["reasonCodes"] == []


def test_filter_and_incomplete_accounting_are_blocked() -> None:
    blocked = classify_preparation(
        plan={"steps": [{"kind": "FILTER_ROWS", "reversible": False, "omitsRows": True}]},
        profile={
            "policy": "SAFE_NON_LOSSY",
            "omittedRows": 0,
            "ambiguousMappings": 0,
            "incompatibleTypes": 0,
            "unaccountedRejects": 0,
            "sourceOverlap": False,
            "changedDuplicateKey": False,
            "currencyInference": False,
            "timezoneInference": False,
            "externalEnrichment": False,
            "blockedQualityDimensions": [],
            "sampledOnly": False,
            "sourceDrift": False,
            "accounting": {
                "input": 5,
                "output": 5,
                "unchanged": 5,
                "changed": 0,
                "rejected": 0,
                "quarantined": 0,
                "unsupported": 0,
            },
        },
    )
    assert blocked["decision"] == "BLOCKED"
    incomplete = classify_preparation(
        plan={"steps": [{"kind": "TRIM_TEXT", "reversible": True, "omitsRows": False}]},
        profile={
            "policy": "SAFE_NON_LOSSY",
            "omittedRows": 0,
            "ambiguousMappings": 0,
            "incompatibleTypes": 0,
            "unaccountedRejects": 0,
            "sourceOverlap": False,
            "changedDuplicateKey": False,
            "currencyInference": False,
            "timezoneInference": False,
            "externalEnrichment": False,
            "blockedQualityDimensions": [],
            "sampledOnly": False,
            "sourceDrift": False,
            "accounting": {
                "input": 5,
                "output": 4,
                "unchanged": 3,
                "changed": 1,
                "rejected": 0,
                "quarantined": 0,
                "unsupported": 0,
            },
        },
    )
    assert incomplete["decision"] == "BLOCKED"
    assert "INCOMPLETE_ACCOUNTING" in incomplete["reasonCodes"]
