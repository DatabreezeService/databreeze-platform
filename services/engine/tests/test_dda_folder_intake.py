from databreeze_engine.processors.dda_folder_intake import FolderIntakeRequest, admit_folder_file


def _request(**overrides: object) -> FolderIntakeRequest:
    payload = {
        "relativePath": "sales/2026Q1.csv",
        "profile": "CSV",
        "schemaFingerprint": "a" * 64,
        "contentFingerprint": "sha256:" + "b" * 64,
        "pinnedSchemaFingerprints": ("a" * 64,),
        "supportedProfiles": ("CSV", "XLSX"),
        "sizeBytes": 128,
    }
    payload.update(overrides)
    return FolderIntakeRequest.model_validate(payload)


def test_admits_manifest_pinned_compatible_csv() -> None:
    result = admit_folder_file(_request())
    assert result.disposition == "ADMITTED"
    assert result.profile == "CSV"
    assert result.contentFingerprint == "sha256:" + "b" * 64
    assert result.reason is None


def test_quarantines_path_escape_unsupported_and_schema_drift() -> None:
    escape = admit_folder_file(_request(relativePath="../secrets.csv"))
    assert escape.disposition == "QUARANTINE"
    assert escape.reason == "PATH_ESCAPE"

    unsupported = admit_folder_file(_request(profile="JS", relativePath="sales/code.js"))
    assert unsupported.disposition == "QUARANTINE"
    assert unsupported.reason == "UNSUPPORTED_PROFILE"

    drift = admit_folder_file(_request(schemaFingerprint="c" * 64))
    assert drift.disposition == "QUARANTINE"
    assert drift.reason == "SCHEMA_DRIFT"


def test_quarantines_empty_malformed_content_without_source_mutation_hooks() -> None:
    result = admit_folder_file(_request(sizeBytes=0))
    assert result.disposition == "QUARANTINE"
    assert result.reason == "MALFORMED_CONTENT"
