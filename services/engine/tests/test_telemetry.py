import pytest

from databreeze_engine.telemetry import sanitize_attributes


def test_engine_telemetry_keeps_allowlisted_scalars_only() -> None:
    assert sanitize_attributes({"jobId": "job-1", "durationMs": 12, "payload": "secret"}) == {
        "jobId": "job-1",
        "durationMs": 12,
    }


@pytest.mark.parametrize("attributes", [{"path": "C:/secret.xlsx"}, {"jobId": "x" * 257}])
def test_engine_telemetry_drops_content_and_unbounded_values(attributes: dict[str, object]) -> None:
    result = sanitize_attributes(attributes)
    assert result == {} or "path" not in result
