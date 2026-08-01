from __future__ import annotations

from importlib.util import find_spec


def test_engine_package_is_importable() -> None:
    """Removing the installable src package must fail this import smoke test."""
    assert find_spec("databreeze_engine") is not None
