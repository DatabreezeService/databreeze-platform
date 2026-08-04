from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError

from databreeze_contracts.v1 import (
    ActorMetadata,
    AutopilotFolderBinding,
    CommandEnvelope,
    CorrelationMetadata,
    CursorPage,
    EventEnvelope,
    FolderAutopilotProfile,
    Identifier,
    ProblemDetails,
    RecipeAssignment,
    Revision,
    TenantScope,
    UtcTimestamp,
)

SCHEMA_BASE = "https://schemas.databreeze.dev/contracts/v1"
ADAPTERS: dict[str, TypeAdapter[Any]] = {
    f"{SCHEMA_BASE}/actor-metadata": TypeAdapter(ActorMetadata),
    f"{SCHEMA_BASE}/autopilot-folder-binding": TypeAdapter(AutopilotFolderBinding),
    f"{SCHEMA_BASE}/command-envelope": TypeAdapter(CommandEnvelope[dict[str, Any]]),
    f"{SCHEMA_BASE}/correlation-metadata": TypeAdapter(CorrelationMetadata),
    f"{SCHEMA_BASE}/cursor-page": TypeAdapter(CursorPage[Any]),
    f"{SCHEMA_BASE}/event-envelope": TypeAdapter(EventEnvelope[dict[str, Any]]),
    f"{SCHEMA_BASE}/folder-autopilot-profile": TypeAdapter(FolderAutopilotProfile),
    f"{SCHEMA_BASE}/identifier": TypeAdapter(Identifier),
    f"{SCHEMA_BASE}/problem-details": TypeAdapter(ProblemDetails),
    f"{SCHEMA_BASE}/recipe-assignment": TypeAdapter(RecipeAssignment),
    f"{SCHEMA_BASE}/revision": TypeAdapter(Revision),
    f"{SCHEMA_BASE}/tenant-scope": TypeAdapter(TenantScope),
    f"{SCHEMA_BASE}/utc-timestamp": TypeAdapter(UtcTimestamp),
}


def read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def accepts_fixture(schema_id: str, payload: Any) -> bool:
    adapter = ADAPTERS.get(schema_id)
    if adapter is None:
        raise ValueError(f"No generated Pydantic model for {schema_id}")
    try:
        adapter.validate_python(payload)
    except ValidationError:
        return False
    return True


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    fixture_manifest_path = arguments.fixture_manifest.resolve()
    fixture_root = fixture_manifest_path.parent
    manifest = read_json(fixture_manifest_path)
    results = []
    for fixture_case in manifest["cases"]:
        payload = read_json(fixture_root / fixture_case["source"])
        results.append(
            {
                "caseId": fixture_case["id"],
                "accepted": accepts_fixture(fixture_case["schemaId"], payload),
            }
        )
    document = {"runtime": "python", "results": results}
    arguments.output.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
