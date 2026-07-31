# Testing and Delivery Architecture

**Status:** Product specification<br>
**Version:** 1.0

## 1. Quality Model

Testing proves requirement behavior, contract compatibility, tenant isolation, processing reproducibility, offline recovery, and safe release. A passing unit suite alone is insufficient for a local/cloud multi-runtime product.

Every accepted requirement maps to one or more of:

- automated test
- static or schema check
- performance benchmark
- security verification
- documented manual release evidence where automation is impractical

## 2. Test Layers

### Pure unit tests

Cover value objects, state machines, policies, rules, transformations, parsers, view models, and error mapping without network or real infrastructure.

### Component and module tests

Test one API module, React feature, Desktop process boundary, Android feature module, or Python processor through its public interface using fakes for unrelated systems.

### Integration tests

Use ephemeral PostgreSQL, Redis, object storage, filesystem sandboxes, and process boundaries. Verify migrations, repository scoping, outbox behavior, signed transfer, sidecar protocol, Room/WorkManager, and recovery.

### Contract tests

Validate:

- OpenAPI compatibility and generated TypeScript/Kotlin clients
- JSON Schema and Pydantic/TypeScript/Kotlin job models
- event and webhook envelopes
- Desktop IPC schemas
- processor result schemas
- supported client/version handshake

### End-to-end tests

Exercise a small number of high-value workflows across real deployables:

- Web registration to first cloud job and approval
- Desktop device registration, local artifact, job, review, and sync
- Android offline capture, restart, reconnect, and Web review
- Device revocation during a job
- Embedded Importer idempotency and signed webhook delivery

## 3. Golden Fixtures

Synthetic, redistributable fixtures cover Vietnamese and international:

- CSV/XLSX with aliases, encodings, formulas, merged cells, dates, decimals, and invalid rows
- Text and scanned PDFs with tables, rotated pages, and OCR uncertainty
- Quote, invoice, contract, rate, report, and migration examples
- Images, barcodes, voice metadata, and offline capture records
- Malicious and limit cases such as traversal, formula injection, oversized archives, and corrupted formats

A fixture has expected normalized output, findings, evidence coordinates, warnings, and processor version. Cloud and Desktop execution must match for deterministic processors. Platform-specific nondeterminism uses defined tolerances.

Fixtures never contain copied customer data, real credentials, or unlicensed documents.

## 4. API and Domain Tests

The API suite includes:

- State transition and invariant tests
- Workspace/resource authorization matrix
- Idempotency and concurrent-request races
- Migration forward/backward compatibility
- Transaction/outbox atomicity
- Job lease, retry, cancellation, and stale-result rejection
- Entitlement reservation and usage reconciliation
- Retention, deletion, and legal-hold behavior
- Cursor pagination and sync conflicts

Repository tests assert the declared organization or workspace scope and complete tenant ancestry on every tenant-owned aggregate.

## 5. Web Tests

- Vitest for pure and component behavior
- React Testing Library for accessible interactions
- Playwright for supported-browser end-to-end workflows
- Automated accessibility scans plus keyboard and screen-reader-oriented assertions
- Vietnamese/English catalog completeness and long-text layout
- Visual regression only for high-value stable components
- Large-list and chart performance with representative data

Tests select elements by accessible role or stable test contract, not styling structure.

## 6. Desktop Tests

- Renderer and shared logic tests
- Main/preload IPC allowlist and schema tests
- Electron Playwright tests for registration, tray, updates, permissions, and offline UI
- Temporary-directory tests for folder watching, rename bursts, locking, symlinks, and recovery
- Python sidecar crash, timeout, malformed message, version mismatch, and signature failure
- Installer upgrade/downgrade and code-signature checks on clean Windows virtual machines
- Idle CPU/memory and sustained processing benchmarks

No test writes outside its created sandbox.

## 7. Android Tests

- Kotlin unit tests for domain, repositories, ViewModels, coroutines, and Flows
- Room migration and conflict tests
- WorkManager interruption/retry tests
- Compose UI and accessibility tests
- Instrumented CameraX, document picker, Share Target, barcode, notification, and Keystore flows
- Process death, device rotation, storage pressure, offline restart, and permission-revocation cases
- Maestro or equivalent release smoke tests on supported Android API levels
- Macrobenchmark for startup, scrolling, and capture flows

## 8. Python Engine Tests

- pytest unit and processor contract tests
- Property-based tests for mappings and tabular transformations
- Golden evidence and output fixtures
- Streaming and memory-limit tests
- Fuzzing for parsers and schema boundaries where practical
- Provider-adapter contract tests using recorded synthetic responses
- Determinism and version-pinning checks
- Packaged sidecar smoke tests without a system Python installation

## 9. Security Tests

Release gates include:

- horizontal and vertical authorization attempts
- session, CSRF, PKCE, MFA, recovery, and revocation
- malicious upload and parser limits
- SSRF and webhook replay
- API key scope and rotation
- Electron navigation, IPC, context isolation, path traversal, and update signature
- Android exported component, intent, URI, backup, and storage checks
- dependency, license, secret, SAST, and container/image scans
- audit completeness without secret leakage

Periodic threat modeling and independent assessment supplement automation.

## 10. Performance and Resilience Tests

Representative load tests cover API mixes, sync fan-out, job creation, worker throughput, object transfer, webhook backlog, and database recovery.

Failure injection covers API restart, worker crash, Redis loss, delayed object storage, provider timeout, network flap, disk-full, duplicate messages, stale leases, and client process death.

Performance baselines are versioned. A material regression fails CI or requires an explicit reviewed exception.

## 11. CI Stages

1. Formatting, linting, generated-file and documentation checks
2. Type checking, dependency boundaries, schema compatibility
3. Unit and component tests
4. Integration and contract tests
5. Build and software-bill-of-materials generation
6. Security and license checks
7. End-to-end smoke on affected deployables
8. Signing and provenance for release candidates

Path filtering saves time, but shared contracts, security policy, migrations, and dependency changes trigger all affected consumers.

## 12. Environments and Test Data

- Local: emulated dependencies and synthetic fixtures
- Preview: isolated per change with no production data
- Staging: production-like versions and anonymized/synthetic load
- Production: progressive rollout with safe telemetry

Production data is not copied into lower environments. Support reproduction uses customer-provided redacted fixtures or locally generated manifests.

## 13. Release Process

- Web/API/worker use progressive deployment and health-based rollback.
- Desktop uses internal, preview, stable, and emergency channels with signed updates.
- Android uses internal testing, closed testing, staged Play rollout, and halt criteria.
- Database changes use expand/migrate/contract.
- Processor versions are immutable; a bad version is disabled rather than overwritten.
- Feature activation is separate from code deployment.

A release record links requirements, changes, migrations, tests, risk assessment, component versions, and rollback instructions.

## 14. Definition of Done

A feature is complete only when:

- accepted requirements and non-goals are satisfied
- permissions, data modes, offline, failure, and accessibility behavior are covered
- contracts and migrations are versioned
- telemetry and support diagnostics are safe
- performance budgets are verified
- user-facing Vietnamese and English copy is complete
- operational and rollback behavior is documented
- no critical or high security finding remains unaccepted
