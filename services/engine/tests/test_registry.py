from __future__ import annotations

import inspect
import os
import subprocess
import sys
from types import MappingProxyType

import pytest
from pydantic import ValidationError

import databreeze_engine.registry as registry_module
from databreeze_engine.dda_processor_digests import DDA_PROCESSOR_DIGESTS
from databreeze_engine.dispatcher import dispatch_execution
from databreeze_engine.registry import (
    ActionRegistry,
    RegistryError,
    canonical_manifest_bytes,
    default_registry,
    manifest_digest,
)


def test_default_manifest_has_fixed_canonical_bytes_and_digest() -> None:
    manifest = default_registry().manifests[0]
    assert manifest.networkPermitted is False
    assert manifest.filesystemWritesPermitted is False
    assert manifest.externalProvidersPermitted is False
    assert manifest.resources.maxDurationMilliseconds == 5_000
    assert canonical_manifest_bytes(manifest) == (
        b'{"actionType":"foundation.metadata-digest","actionVersion":"1.0.0",'
        b'"dataModes":["LOCAL","CLOUD","HYBRID"],"determinism":"DETERMINISTIC",'
        b'"engineVersion":"0.1.0","executionModes":["LOCAL","CLOUD"],'
        b'"executionTargets":["DESKTOP","CLOUD_WORKER"],'
        b'"externalProvidersPermitted":false,"filesystemWritesPermitted":false,'
        b'"handlerDigest":"sha256:6de342f9b36d0e1e05a4908ea7796e1564c45504f96256e2b4957aa8d0bbd9be",'
        b'"inputSchemaId":"foundation.metadata-fixture.v1","networkPermitted":false,'
        b'"outputSchemaId":"foundation.metadata-digest-result.v1",'
        b'"protocolVersion":"1.0","requiredCapabilities":["metadata.read"],'
        b'"resources":{"maxDurationMilliseconds":5000,"maxInputBytes":16777216,'
        b'"maxMemoryBytes":67108864,"maxOutputBytes":1048576,'
        b'"maxTemporaryStorageBytes":0,"progressCadenceMilliseconds":500},'
        b'"riskClass":"READ_ONLY","seedPolicy":"NONE","sideEffectClass":"NONE"}'
    )
    assert manifest_digest(manifest) == (
        "sha256:5e528dba025ef289ec1d32b7b1bccdbc46d67d7cc96539af2adbec654068d441"
    )


@pytest.mark.parametrize("hash_seed", ["1", "987654"])
def test_manifest_canonicalization_is_hash_seed_independent(hash_seed: str) -> None:
    program = (
        "from databreeze_engine.registry import canonical_manifest_bytes, default_registry, "
        "manifest_digest; manifest = default_registry().manifests[0]; "
        "print(canonical_manifest_bytes(manifest).hex()); print(manifest_digest(manifest))"
    )
    result = subprocess.run(
        [sys.executable, "-c", program],
        check=True,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONHASHSEED": hash_seed,
        },
        timeout=30,
    )
    encoded_bytes, digest = result.stdout.splitlines()
    manifest = default_registry().manifests[0]
    assert bytes.fromhex(encoded_bytes) == canonical_manifest_bytes(manifest)
    assert digest == "sha256:5e528dba025ef289ec1d32b7b1bccdbc46d67d7cc96539af2adbec654068d441"


def test_registry_and_manifests_are_immutable() -> None:
    registry = default_registry()
    with pytest.raises(ValidationError):
        registry.manifests[0].resources.maxInputBytes = 1


def test_cached_registry_rejects_ordinary_definition_and_state_rebinding() -> None:
    registry = default_registry()
    definition = registry.resolve(
        "foundation.metadata-digest",
        "1.0.0",
        registry.manifests[0].handlerDigest,
    )
    replacement = registry_module._ActionDefinition(
        definition.manifest,
        lambda _context, _parameters: definition.handler(_context, _parameters),
    )
    key = (definition.manifest.actionType, definition.manifest.actionVersion)

    for attribute, value in (
        ("_actions", MappingProxyType({key: replacement})),
        ("_action_types", frozenset({"replacement.action"})),
        ("_manifests", (replacement.manifest,)),
    ):
        with pytest.raises(AttributeError):
            setattr(registry, attribute, value)

    assert not hasattr(registry, "actions")
    assert registry.resolve(*key, definition.manifest.handlerDigest).handler is definition.handler


def test_registry_and_dispatcher_expose_no_callable_or_registry_injection() -> None:
    assert "ActionDefinition" not in vars(registry_module)
    assert tuple(inspect.signature(ActionRegistry).parameters) == ()
    assert "registry" not in inspect.signature(dispatch_execution).parameters
    with pytest.raises(TypeError):
        ActionRegistry((lambda: None,))  # type: ignore[call-arg]


def test_reviewed_handler_artifact_digest_fails_closed_on_changed_bytes() -> None:
    with pytest.raises(RegistryError, match="HANDLER_ARTIFACT_DIGEST_MISMATCH"):
        registry_module._verify_reviewed_handler_artifact(b"changed processor bytes")


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
    for action_type in ("customer.payment", "funds-transfer.execute"):
        with pytest.raises(RegistryError, match="PROHIBITED_ACTION_BOUNDARY"):
            registry_module._validate_action_boundary(action_type)


def test_registry_fails_closed_for_unknown_action_version_and_digest() -> None:
    registry = default_registry()
    with pytest.raises(RegistryError, match="UNSUPPORTED_ACTION"):
        registry.resolve("unknown.action", "1.0.0", "sha256:" + "0" * 64)
    with pytest.raises(RegistryError, match="UNSUPPORTED_ACTION_VERSION"):
        registry.resolve("foundation.metadata-digest", "2.0.0", "sha256:" + "0" * 64)
    with pytest.raises(RegistryError, match="HANDLER_DIGEST_MISMATCH"):
        registry.resolve("foundation.metadata-digest", "1.0.0", "sha256:" + "0" * 64)


@pytest.mark.parametrize(
    ("action_type", "artifact_name"),
    [
        ("dda.etl.execute", "dda_etl_execute.py"),
        ("dda.etl.intake", "dda_etl_intake.py"),
        ("dda.etl.preview", "dda_etl_preview.py"),
        ("dda.etl.profile", "dda_etl_profile.py"),
        ("dda.folder.intake", "dda_folder_intake.py"),
        ("dda.materialize.query", "dda_materialize_query.py"),
        ("dda.materialize.snapshot", "dda_materialize_snapshot.py"),
        ("dda.materialize.widget-result", "dda_materialize_query.py"),
    ],
)
def test_registry_enrolls_reviewed_dda_handlers_with_pinned_digests(
    action_type: str, artifact_name: str
) -> None:
    registry = default_registry()
    digest = DDA_PROCESSOR_DIGESTS[artifact_name]

    definition = registry.resolve(action_type, "1.0.0", digest)

    assert definition.manifest.handlerDigest == digest
    assert callable(definition.handler)
    with pytest.raises(RegistryError, match="HANDLER_DIGEST_MISMATCH"):
        registry.resolve(action_type, "1.0.0", "sha256:" + "0" * 64)
