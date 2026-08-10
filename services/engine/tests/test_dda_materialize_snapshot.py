from __future__ import annotations

import pytest

from databreeze_engine.processors.dda_materialize_snapshot import (
    DdaMaterializeSnapshotError,
    DdaMaterializeSnapshotInput,
    MaterializationManifestRef,
    materialize_snapshot,
)


def _manifest(**overrides: object) -> MaterializationManifestRef:
    payload = {
        "materializationId": "00000000-0000-4000-8000-000000000001",
        "resultManifestHash": "a" * 64,
        "cacheIdentityHash": "b" * 64,
        "datasetVersionId": "00000000-0000-4000-8000-000000000002",
        "permissionProjectionVersionId": "00000000-0000-4000-8000-000000000003",
        "verified": True,
    }
    payload.update(overrides)
    return MaterializationManifestRef.model_validate(payload)


def test_complete_compatible_set_publishes_deterministic_snapshot_identity() -> None:
    first = materialize_snapshot(
        DdaMaterializeSnapshotInput(
            dashboardVersionId="00000000-0000-4000-8000-000000000010",
            inputSelectorHash="c" * 64,
            materializations=(_manifest(),),
        )
    )
    second = materialize_snapshot(
        DdaMaterializeSnapshotInput(
            dashboardVersionId="00000000-0000-4000-8000-000000000010",
            inputSelectorHash="c" * 64,
            materializations=(_manifest(),),
        )
    )
    assert first.complete is True
    assert first.reason == "ATOMIC_COMPLETE_SET"
    assert first.snapshotIdentityHash == second.snapshotIdentityHash


def test_rejects_incomplete_or_mixed_sets() -> None:
    with pytest.raises(DdaMaterializeSnapshotError) as incomplete:
        materialize_snapshot(
            DdaMaterializeSnapshotInput(
                dashboardVersionId="00000000-0000-4000-8000-000000000010",
                inputSelectorHash="c" * 64,
                materializations=(_manifest(verified=False),),
            )
        )
    assert incomplete.value.code == "INCOMPLETE_MATERIALIZATION_SET"

    with pytest.raises(DdaMaterializeSnapshotError) as mixed_input:
        materialize_snapshot(
            DdaMaterializeSnapshotInput(
                dashboardVersionId="00000000-0000-4000-8000-000000000010",
                inputSelectorHash="c" * 64,
                materializations=(
                    _manifest(),
                    _manifest(
                        materializationId="00000000-0000-4000-8000-000000000011",
                        datasetVersionId="00000000-0000-4000-8000-000000000099",
                        resultManifestHash="d" * 64,
                        cacheIdentityHash="e" * 64,
                    ),
                ),
            )
        )
    assert mixed_input.value.code == "MIXED_INPUT_SET"

    with pytest.raises(DdaMaterializeSnapshotError) as mixed_permission:
        materialize_snapshot(
            DdaMaterializeSnapshotInput(
                dashboardVersionId="00000000-0000-4000-8000-000000000010",
                inputSelectorHash="c" * 64,
                materializations=(
                    _manifest(),
                    _manifest(
                        materializationId="00000000-0000-4000-8000-000000000012",
                        permissionProjectionVersionId="00000000-0000-4000-8000-000000000098",
                        resultManifestHash="f" * 64,
                        cacheIdentityHash="1" * 64,
                    ),
                ),
            )
        )
    assert mixed_permission.value.code == "MIXED_PERMISSION_PROJECTION"
