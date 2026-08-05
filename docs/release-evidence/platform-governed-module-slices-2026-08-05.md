# Governed product-module slices — 2026-08-05

This is an implementation checkpoint for the canonical `databreeze-platform` repository. It is
deliberately marked **partial**. It does not release all ten product modules, does not change the
requirement traceability manifest to claim full coverage, and does not substitute for deployment,
provider, database, or device-backed release gates.

## Included in this checkpoint

- A frozen, deterministic ten-module catalog in `packages/domain/src/module-catalog/v1.ts`, with
  Vietnamese and English labels, stable IDs, requirement families, lifecycle state, platform
  responsibilities, and workflow stages. The read-only API projection is available at
  `GET /v1/system/modules`.
- Deterministic, value-free domain slices tied to the following requirement families:
  - Folder Autopilot: `FA-001`, `FA-005`, `FA-006`, `FA-009`, `FA-014`, `FA-015`, `FA-016`,
    `FA-019` (scoped recipe, relative allowlisted preview, approval and source-change gate).
  - Data Quality Guard: `DQG-001`, `DQG-006`, `DQG-014`, `DQG-015`, `DQG-021`, `DQG-022`
    (bounded rules, value-free findings, repair preview and immutable derived projection).
  - Quote Intelligence: `QI-001`, `QI-010`, `QI-011`, `QI-012`, `QI-014`, `QI-018`
    (versioned currency, landed cost, deterministic scoring and missing-rate blocking).
  - Invoice Leak Detector: `ILD-001`, `ILD-008`, `ILD-010`, `ILD-011`, `ILD-012`, `ILD-014`,
    `ILD-015` (immutable invoice signals, variance findings, duplicates and incomplete governing
    data).
  - Client Report Factory: `CRF-004`, `CRF-007`, `CRF-008`, `CRF-015`, `CRF-016`, `CRF-020`
    (deterministic facts, evidence manifests and exact approval-subject release binding).
  - Operations Capture: `OC-001`, `OC-006`, `OC-007`, `OC-014` (versioned typed forms and bounded
    submission validation).
  - Embedded Importer: `EI-001`, `EI-004`, `EI-006`, `EI-009`, `EI-012` (HTTPS origin allowlist,
    bounded typed payload and required-field accounting).
  - Private Data Analyst: `PDA-007`, `PDA-009`, `PDA-013`, `PDA-014`, `PDA-016`, `PDA-018`
    (typed bounded plans, deterministic local execution, provenance and local-only egress).
  - Migration Ready: `MR-001`, `MR-002`, `MR-010`, `MR-011`, `MR-016`, `MR-017` (scoped dry-run,
    source/target hashes, conflict dispositions and no source mutation).
- A Web workbench that exposes all ten destinations with Vietnamese-default/complete-English
  copy, keyboard/focus semantics, responsive navigation, honest lifecycle states, and disabled
  actions for unwired server mutations. It intentionally loads no fake module data.
- A native Android read-only workbench with the same ten-module order, Vietnamese/English
  resources, accessible module descriptions, and an Operations Capture handoff to the existing
  scoped offline-draft flow. The mobile catalog is presentation-only; the service remains the
  authority for access, work, and decisions.

## Evidence collected

- Domain build, public API smoke test, and domain suite: **174 tests passed** after the module
  slices were added.
- Web suite: **24 tests passed**; Web typecheck passed. The UI worker also recorded a production
  build, ESLint, Prettier, bundle-budget, desktop/mobile browser QA run with no console errors or
  horizontal overflow.
- API typecheck, lint, OpenAPI validation, and the full API suite: **494 tests passed**. The four
  new stateless preview routes (Folder Autopilot, Data Quality Guard, Quote Intelligence, and
  Invoice Leak Detector) are covered by focused endpoint tests and the generated OpenAPI artifact.
- Desktop: **28 Vitest tests and 16 Node architecture/build tests passed**; the security suite
  passed **24 tests**, and the renderer stayed within its 184,320-byte gzip budget.
- Android unit tests, debug assembly, and Android-test compilation passed. No emulator/device was
  attached, so connected instrumentation was not executed.
- Shared contracts passed generation/compatibility/parity checks (**47 contract tests**, 28 runtime
  fixtures across TypeScript, Python, and Kotlin).

## Explicit non-claims

The catalog lifecycle remains `partial` for Spreadsheet Auditor and Operations Capture and
`planned` for the other modules until their complete API, persistence, engine, client, approval, and release-evidence
requirements are implemented. These domain functions are deterministic policy primitives, not a
claim that every corresponding production workflow is live. External integrations, deployment,
secrets, database migrations, observability, provider credentials, and connected-device behavior
remain outside this local checkpoint.

## Rollback

The changes are isolated on the feature branch `codex/platform-feature-implementation`. Revert the
feature commit or remove the branch after review; no production database or external service was
mutated by this checkpoint.
