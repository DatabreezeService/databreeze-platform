"""Verify the deterministic build inventory and isolated wheel import smoke."""

from __future__ import annotations

import subprocess
import sys
import tarfile
import zipfile
from configparser import ConfigParser
from pathlib import Path


def require_one(directory: Path, pattern: str) -> Path:
    matches = sorted(directory.glob(pattern))
    if len(matches) != 1:
        raise SystemExit(f"expected one {pattern} artifact")
    return matches[0]


def main() -> int:
    distribution = Path(__file__).parents[1] / "dist"
    wheel = require_one(distribution, "databreeze_engine-*.whl")
    source = require_one(distribution, "databreeze_engine-*.tar.gz")
    with zipfile.ZipFile(wheel) as archive:
        names = frozenset(archive.namelist())
        entry_points = next(name for name in names if name.endswith(".dist-info/entry_points.txt"))
        entries = archive.read(entry_points).decode("utf-8")
        parser = ConfigParser(interpolation=None)
        parser.read_string(entries)
        expected_console_entries = {
            "databreeze-engine-cloud": "databreeze_engine.cloud:main",
            "databreeze-engine-sidecar": "databreeze_engine.sidecar:main",
        }
        actual_console_entries = (
            dict(parser["console_scripts"]) if parser.has_section("console_scripts") else {}
        )
        if actual_console_entries != expected_console_entries:
            raise SystemExit("built wheel has incorrect engine console entries")
        if "databreeze_engine/__init__.py" not in names:
            raise SystemExit("built wheel is missing the engine package")
    with tarfile.open(source, mode="r:gz") as archive:
        source_names = frozenset(archive.getnames())
        if not any(name.endswith("/pyproject.toml") for name in source_names):
            raise SystemExit("source distribution is missing pyproject.toml")
    program = (
        "import sys; sys.path.insert(0, sys.argv[1]); "
        "import databreeze_engine; "
        "assert '.whl' in databreeze_engine.__file__; "
        "assert databreeze_engine.ENGINE_VERSION == '0.1.0'"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-c", program, str(wheel.resolve())],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise SystemExit("isolated built-wheel import failed")
    print(f"verified build inventory: {wheel.name}, {source.name}, 2 console entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
