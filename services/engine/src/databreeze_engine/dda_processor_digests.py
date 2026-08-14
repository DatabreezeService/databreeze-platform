"""Closed digest pins for DDA processor artifacts (plan 400 / prototype gap).

Full ActionHandler enrollment remains blocked on a typed multi-action handler
protocol beyond foundation.metadata-digest. Until that lands, production
composition must verify these pins before dispatching DDA processors.
"""

from __future__ import annotations

import hashlib
from importlib.resources import files

# sha256 digests of reviewed processor source bytes (computed 2026-08-12).
DDA_PROCESSOR_DIGESTS: dict[str, str] = {
    "dda_etl_execute.py": "sha256:a3506729ef6a6f324151b57432a930e06fb486abfa567d4c0b151406a79a3953",
    "dda_etl_intake.py": "sha256:d354320fce2a33d6b24226398be23c18ebc6ecaaf6b84e8485fca81f2b68e0ab",
    "dda_etl_preview.py": "sha256:f22b59a952cbe7ed810410c9929a8cfedf8bf1954be9d27733ca911fd0671dc9",
    "dda_etl_profile.py": "sha256:5a6f4d8daf6ac886e62bd909465c6edbc3e2ca027a9762f2542ac7044c02c063",
    "dda_folder_intake.py": (
        "sha256:8b497ed6731a1eb9f6ad379f08e11b209d87472b437bc16e0fd4d1a8ac3d795b"
    ),
    "dda_materialize_query.py": (
        "sha256:4418b6da9b59b7d3c7694599c2ffd4b5af89c6f097e69fc5160941842200e272"
    ),
    "dda_materialize_snapshot.py": (
        "sha256:48864f745a48877ebe153adb32f811490b5aa79928e78af3884852f37454b550"
    ),
}

DDA_ACTION_TYPES: frozenset[str] = frozenset(
    {
        "dda.etl.execute",
        "dda.etl.intake",
        "dda.etl.preview",
        "dda.etl.profile",
        "dda.folder.intake",
        "dda.materialize.query",
        "dda.materialize.snapshot",
    }
)


def _digest_bytes(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


def verify_dda_processor_digests() -> dict[str, str]:
    """Fail closed when any reviewed DDA processor artifact drifts."""
    from .registry import RegistryError

    verified: dict[str, str] = {}
    for filename, expected in DDA_PROCESSOR_DIGESTS.items():
        try:
            artifact = files("databreeze_engine.processors").joinpath(filename).read_bytes()
        except OSError as error:
            raise RegistryError("HANDLER_ARTIFACT_UNAVAILABLE") from error
        actual = _digest_bytes(artifact)
        if actual != expected:
            raise RegistryError("HANDLER_ARTIFACT_DIGEST_MISMATCH")
        verified[filename] = actual
    return verified
