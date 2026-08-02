from __future__ import annotations

import ast
from pathlib import Path


def test_engine_source_has_no_database_network_or_provider_imports() -> None:
    forbidden = {"boto3", "httpx", "psycopg", "redis", "requests", "socket", "sqlalchemy"}
    imported: set[str] = set()
    for source in (Path(__file__).parents[1] / "src" / "databreeze_engine").rglob("*.py"):
        tree = ast.parse(source.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(alias.name.split(".", 1)[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".", 1)[0])
    assert imported.isdisjoint(forbidden)


def test_engine_source_has_no_dynamic_code_or_import_primitives() -> None:
    forbidden_calls = {"__import__", "compile", "eval", "exec"}
    found: set[str] = set()
    for source in (Path(__file__).parents[1] / "src" / "databreeze_engine").rglob("*.py"):
        tree = ast.parse(source.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id in forbidden_calls
            ):
                found.add(node.func.id)
    assert found == set()
