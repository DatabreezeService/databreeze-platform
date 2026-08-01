from __future__ import annotations

import pytest
from pydantic import ValidationError

from databreeze_engine.registry import (
    ActionRegistry,
    RegistryError,
    default_registry,
    manifest_digest,
)


def test_default_manifest_is_bounded_safe_and_byte_stable() -> None:
    manifest = default_registry().manifests[0]
    assert manifest.networkPermitted is False
    assert manifest.filesystemWritesPermitted is False
    assert manifest.externalProvidersPermitted is False
    assert manifest.resources.maxDurationMilliseconds == 5_000
    assert manifest_digest(manifest) == manifest_digest(manifest.model_copy())


def test_registry_and_manifests_are_immutable() -> None:
    registry = default_registry()
    with pytest.raises(TypeError):
        registry.actions[("other", "1.0.0")] = registry.actions[
            ("foundation.metadata-digest", "1.0.0")
        ]
    with pytest.raises(ValidationError):
        registry.manifests[0].resources.maxInputBytes = 1


def test_registry_rejects_duplicate_action_versions() -> None:
    definition = next(iter(default_registry().actions.values()))
    with pytest.raises(RegistryError, match="DUPLICATE_ACTION_VERSION"):
        ActionRegistry((definition, definition))


def test_manifest_rejects_prohibited_effect_and_unknown_capability() -> None:
    manifest = default_registry().manifests[0]
    with pytest.raises(ValidationError):
        manifest.model_copy(update={"sideEffectClass": "BILLING_PROVIDER_EFFECT"}).model_validate(
            {**manifest.model_dump(), "sideEffectClass": "BILLING_PROVIDER_EFFECT"}
        )
    with pytest.raises(ValidationError):
        type(manifest).model_validate(
            {**manifest.model_dump(), "requiredCapabilities": ["arbitrary.execute"]}
        )


def test_registry_rejects_customer_payment_or_funds_transfer_actions() -> None:
    definition = next(iter(default_registry().actions.values()))
    for action_type in ("customer.payment", "funds-transfer.execute"):
        unsafe = definition.manifest.model_copy(update={"actionType": action_type})
        with pytest.raises(RegistryError, match="PROHIBITED_ACTION_BOUNDARY"):
            ActionRegistry((type(definition)(manifest=unsafe, handler=definition.handler),))


def test_registry_fails_closed_for_unknown_action_version_and_digest() -> None:
    registry = default_registry()
    with pytest.raises(RegistryError, match="UNSUPPORTED_ACTION"):
        registry.resolve("unknown.action", "1.0.0", "sha256:" + "0" * 64)
    with pytest.raises(RegistryError, match="UNSUPPORTED_ACTION_VERSION"):
        registry.resolve("foundation.metadata-digest", "2.0.0", "sha256:" + "0" * 64)
    with pytest.raises(RegistryError, match="HANDLER_DIGEST_MISMATCH"):
        registry.resolve("foundation.metadata-digest", "1.0.0", "sha256:" + "0" * 64)
