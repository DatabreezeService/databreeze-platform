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
    "dda_etl_execute.py": "sha256:5b9bb2148286c767d5b32b00b2686df77981692aeab6711d97554ccf5ab0a76e",
    "dda_etl_intake.py": "sha256:2852ac22e1ce885c9765eab2f14dd30a4fbcc2389564c3b16e7300583230a083",
    "dda_etl_preview.py": "sha256:f22b59a952cbe7ed810410c9929a8cfedf8bf1954be9d27733ca911fd0671dc9",
    "dda_etl_profile.py": "sha256:5a6f4d8daf6ac886e62bd909465c6edbc3e2ca027a9762f2542ac7044c02c063",
    "dda_folder_intake.py": (
        "sha256:89893d80e9dcf38ef5b6d6a618e38e980ecf65f1a52c4b256111bada5246bca2"
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
        "dda.materialize.widget-result",
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
