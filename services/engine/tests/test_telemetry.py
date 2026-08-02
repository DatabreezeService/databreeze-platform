import pytest

from databreeze_engine.telemetry import (
    CorrelationContext,
    assert_safe_attributes,
    correlation_from_headers,
    correlation_headers,
    create_correlation_context,
    emit_record,
    sanitize_attributes,
)


def test_engine_telemetry_keeps_allowlisted_scalars_only() -> None:
    assert sanitize_attributes({"jobId": "job-1", "durationMs": 12, "payload": "secret"}) == {
        "jobId": "job-1",
        "durationMs": 12,
    }


@pytest.mark.parametrize("attributes", [{"path": "C:/secret.xlsx"}, {"jobId": "x" * 257}])
def test_engine_telemetry_drops_content_and_unbounded_values(attributes: dict[str, object]) -> None:
    result = sanitize_attributes(attributes)
    assert result == {} or "path" not in result


@pytest.mark.parametrize(
    "attributes",
    [
        {"status": r"C:\Users\someone\source.xlsx"},
        {"outcome": "customer@example.com"},
        {"reasonCode": "invoice total 123"},
        {"dataClass": "source.xlsx"},
    ],
)
def test_engine_telemetry_drops_sensitive_values_in_allowed_fields(
    attributes: dict[str, object],
) -> None:
    assert sanitize_attributes(attributes) == {}
    with pytest.raises(ValueError):
        assert_safe_attributes(attributes)


def test_engine_correlation_and_record_round_trip() -> None:
    context = create_correlation_context(
        "00000000-0000-4000-8000-000000000001",
        trace_id="0123456789abcdef0123456789abcdef",
        span_id="0123456789abcdef",
        trace_flags="01",
    )
    assert correlation_from_headers(correlation_headers(context)) == context
    record = emit_record("info", "request.completed", "engine", context, {"status": 200})
    assert record["traceId"] == context.trace_id
    assert record["spanId"] == context.span_id
    assert record["attributes"] == {"status": 200}


def test_engine_rejects_ambiguous_or_zero_trace_headers() -> None:
    correlation_id = "00000000-0000-4000-8000-000000000001"
    with pytest.raises(ValueError):
        correlation_from_headers({"x-correlation-id": [correlation_id, correlation_id]})
    with pytest.raises(ValueError):
        correlation_from_headers(
            {
                "x-correlation-id": correlation_id,
                "traceparent": "00-00000000000000000000000000000000-0123456789abcdef-01",
            }
        )


def test_engine_telemetry_does_not_execute_hostile_mapping_items() -> None:
    class HostileMapping(dict[str, object]):
        def items(self):  # type: ignore[override]
            raise RuntimeError("provider cause must not escape")

    assert sanitize_attributes(HostileMapping()) == {}
    with pytest.raises(ValueError, match="not readable"):
        assert_safe_attributes(HostileMapping())


def test_engine_telemetry_normalizes_provider_value_errors() -> None:
    class ValueErrorMapping(dict[str, object]):
        def items(self):  # type: ignore[override]
            raise ValueError("provider value error must not escape")

    assert sanitize_attributes(ValueErrorMapping()) == {}
    with pytest.raises(ValueError, match="not readable") as error:
        assert_safe_attributes(ValueErrorMapping())
    assert "provider value error" not in str(error.value)


def test_engine_telemetry_rejects_hostile_or_non_string_header_values() -> None:
    class HostileHeaders(dict[str, object]):
        def items(self):  # type: ignore[override]
            raise RuntimeError("provider header cause must not escape")

    with pytest.raises(ValueError, match="not readable"):
        correlation_from_headers(HostileHeaders())
    with pytest.raises(ValueError, match="not readable"):
        correlation_from_headers(
            {
                "x-correlation-id": [1, 2],
            }
        )

    class ValueErrorHeaders(dict[str, object]):
        def items(self):  # type: ignore[override]
            raise ValueError("provider header value error must not escape")

    with pytest.raises(ValueError, match="not readable") as error:
        correlation_from_headers(ValueErrorHeaders())
    assert "provider header value error" not in str(error.value)


def test_engine_accepts_mixed_case_header_names() -> None:
    context = CorrelationContext(
        "00000000-0000-4000-8000-000000000001",
        "0123456789abcdef0123456789abcdef",
        "0123456789abcdef",
        "00",
    )
    assert (
        correlation_from_headers(
            {
                "X-Correlation-Id": context.correlation_id,
                "TrAcEpArEnT": "00-0123456789abcdef0123456789abcdef-0123456789abcdef-00",
            }
        )
        == context
    )
