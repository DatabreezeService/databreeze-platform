from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError

from databreeze_contracts.v1 import (
    ActorMetadata,
    CommandEnvelope,
    CorrelationMetadata,
    CursorPage,
    DdaAnalysisPlan,
    DdaDashboardSnapshot,
    DdaDashboardVersion,
    DdaEtlPlan,
    DdaFolderManifest,
    DdaMaterialization,
    DdaReceiptCandidate,
    DdaRefreshEvent,
    EventEnvelope,
    Identifier,
    ProblemDetails,
    Revision,
    TenantScope,
    UtcTimestamp,
)
from databreeze_contracts.v2 import DdaReceiptUpload

SCHEMA_BASE = "https://schemas.databreeze.dev/contracts/v1"
SCHEMA_BASE_V2 = "https://schemas.databreeze.dev/contracts/v2"
ADAPTERS: dict[str, TypeAdapter[Any]] = {
    f"{SCHEMA_BASE}/actor-metadata": TypeAdapter(ActorMetadata),
    f"{SCHEMA_BASE}/command-envelope": TypeAdapter(CommandEnvelope[dict[str, Any]]),
    f"{SCHEMA_BASE}/correlation-metadata": TypeAdapter(CorrelationMetadata),
    f"{SCHEMA_BASE}/cursor-page": TypeAdapter(CursorPage[Any]),
    f"{SCHEMA_BASE}/dda-analysis-plan": TypeAdapter(DdaAnalysisPlan),
    f"{SCHEMA_BASE}/dda-dashboard-snapshot": TypeAdapter(DdaDashboardSnapshot),
    f"{SCHEMA_BASE}/dda-dashboard-version": TypeAdapter(DdaDashboardVersion),
    f"{SCHEMA_BASE}/dda-etl-plan": TypeAdapter(DdaEtlPlan),
    f"{SCHEMA_BASE}/dda-folder-manifest": TypeAdapter(DdaFolderManifest),
    f"{SCHEMA_BASE}/dda-materialization": TypeAdapter(DdaMaterialization),
    f"{SCHEMA_BASE}/dda-receipt-candidate": TypeAdapter(DdaReceiptCandidate),
    f"{SCHEMA_BASE}/dda-refresh-event": TypeAdapter(DdaRefreshEvent),
    f"{SCHEMA_BASE}/event-envelope": TypeAdapter(EventEnvelope[dict[str, Any]]),
    f"{SCHEMA_BASE}/identifier": TypeAdapter(Identifier),
    f"{SCHEMA_BASE}/problem-details": TypeAdapter(ProblemDetails),
    f"{SCHEMA_BASE}/revision": TypeAdapter(Revision),
    f"{SCHEMA_BASE}/tenant-scope": TypeAdapter(TenantScope),
    f"{SCHEMA_BASE}/utc-timestamp": TypeAdapter(UtcTimestamp),
    f"{SCHEMA_BASE_V2}/dda-receipt-upload": TypeAdapter(DdaReceiptUpload),
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
