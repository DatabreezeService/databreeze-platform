from __future__ import annotations

import pytest

import databreeze_engine.dda_processor_digests as digests
from databreeze_engine.dda_processor_digests import (
    DDA_ACTION_TYPES,
    DDA_PROCESSOR_DIGESTS,
    verify_dda_processor_digests,
)
from databreeze_engine.registry import RegistryError


def test_dda_processor_digest_pins_match_reviewed_artifacts() -> None:
    verified = verify_dda_processor_digests()
    assert set(verified) == set(DDA_PROCESSOR_DIGESTS)
    assert verified == DDA_PROCESSOR_DIGESTS
    assert "dda.etl.intake" in DDA_ACTION_TYPES
    assert "dda.materialize.query" in DDA_ACTION_TYPES


def test_dda_processor_digest_fails_closed_on_drift(monkeypatch: pytest.MonkeyPatch) -> None:
    original = digests.DDA_PROCESSOR_DIGESTS

    class BrokenFiles:
        def joinpath(self, filename: str):  # noqa: ANN201
            class Handle:
                def read_bytes(self) -> bytes:
                    return b"tampered-processor-bytes"

            return Handle()

    monkeypatch.setattr(digests, "files", lambda _package: BrokenFiles())
    monkeypatch.setattr(
        digests,
        "DDA_PROCESSOR_DIGESTS",
        {"dda_etl_intake.py": next(iter(original.values()))},
    )
    with pytest.raises(RegistryError, match="HANDLER_ARTIFACT_DIGEST_MISMATCH"):
        verify_dda_processor_digests()
