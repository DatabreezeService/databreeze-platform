from __future__ import annotations

import pytest

import databreeze_engine.cloud as cloud
from databreeze_engine.json_codec import JsonCodecError, decode_json


@pytest.mark.parametrize("encoded", [b"1e999999", b"-1e999999"])
def test_decoder_rejects_short_exponents_that_overflow_to_infinity(encoded: bytes) -> None:
    with pytest.raises(JsonCodecError, match="NON_FINITE_NUMBER"):
        decode_json(encoded)


@pytest.mark.parametrize("encoded", [b'{"value":1e999999}', b'{"value":-1e999999}'])
def test_cloud_adapter_decoder_rejects_exponent_overflow(encoded: bytes) -> None:
    with pytest.raises(JsonCodecError, match="NON_FINITE_NUMBER"):
        cloud.decode_json(encoded)
