# Authoritative Engine Workload Envelope and Local Certified Materialization

**Status:** Approved by the product owner on 2026-08-19 as the next continuation of plan 407 and the explicit request that the complete product be testable locally.

**Requirements:** JRA-004, JRA-006, JRA-007, JRA-012, JRA-021, JRA-023, JRA-031, JRA-032, JRA-033, IAE-024, BUA-023, DDA-003, DDA-018, DDA-025, DDA-029, DDA-032, DDA-038, DDA-061.

**Depends on:** Plans 030, 040, 084, 407 and 408.

## Goal

Make the upload → approve → materialize → certified dashboard path executable in the local profile and safe to promote to cloud workers. The local path must calculate values from the authorized uploaded bytes, while production continues to require the same typed envelope, exact object authority, IAE attestation and JRA/BUA/AUD transaction boundaries.

## Non-negotiable boundaries

- The browser never supplies tenant scope, action identity, parameters, input object IDs, output IDs, policy versions or numeric values.
- The worker receives no database, bucket, KMS or OpenAI credentials and cannot enumerate workspaces or storage.
- `JOB_INPUT` object IDs remain opaque governed ArtifactVersion references; they are not reinterpreted as an engine request.
- The server creates one immutable envelope during admission. It contains the registered action/version/handler digest, exact input handle metadata, bounded server-derived parameters, output policy, deadline, locale/timezone, subject bindings and canonical hash.
- Local and cloud execute the same registered typed action and processor; the local byte adapter is only an injected profile implementation and never changes the canonical authorization protocol.
- A missing, stale, revoked, malformed or hash-mismatched envelope fails closed and preserves the last good snapshot. No fixture values or browser-only success are allowed.

## Tasks

### 1. Contract and admission

- Add the `JRA-033`/`DDA-061` requirement-linked envelope domain model and migration inventory entry.
- Persist the immutable envelope and exact canonical hash transactionally with JRA admission and the existing opaque BUA settlement binding.
- Extend assignment/claim responses with only `workloadEnvelopeId`, `workloadEnvelopeHash` and attempt binding; do not return server authority fields in an unscoped body.
- Add an authenticated resolver that returns the exact envelope only for the current worker identity, TenantScope, attempt, security epoch and lease.
- Test cross-tenant, stale-lease, revoked-policy, changed-hash, duplicate-admission and malformed-envelope denial.

**Implementation note (2026-08-19):** the existing IAE worker resolver originally
received only `JobV1`, while the authoritative opaque ArtifactVersion references
live on the immutable execution descriptor. The internal server adapter now passes
those descriptor-owned IDs through an optional typed field; browser and worker
HTTP payloads cannot provide it. A local byte resolver must still be composed only
after it consumes that field and proves exact scope, ACTIVE/CLEAN state, current
DSO placement policy, hash, and length.

### 2. Engine typed dispatch

- Replace the Foundation-only `EngineExecutionRequest.parameters`/`EngineResult.output` boundary with a closed registered parameter/result union that includes the reviewed DDA materialization actions.
- Validate action schema, handler digest, limits, deadline, locale/timezone and output schema before invoking a handler.
- Keep `FoundationMetadataParameters` as a compatibility member; do not accept arbitrary JSON or dynamic imports.
- Add equivalent TypeScript/Python/Kotlin v4 transport fixtures only after the contract schemas are generated and parity-tested.

### 3. Exact local input/output execution

- Add an injected local IAE input resolver/byte reader that resolves the envelope’s exact ArtifactVersion handles, validates full scope, SHA-256, byte length, data mode and policy, and never exposes paths or URLs to the engine.
- Reuse the existing prepare → exact IAE transfer → attestation → JRA `FINALIZE_RESULT` path. Local storage remains a bounded test adapter; cloud S3/KMS remains the production adapter.
- Add the local worker resolver to `worker_main` only when the local profile composes all exact authorities. Cloud worker startup remains fail-closed until the same resolver is composed.

### 4. DDA snapshot integration

- Feed only verified JRA/IAE output attestations into the DDA widget-result reader and snapshot commit service.
- Verify all DDA-061 subject bindings before replacing the last-good snapshot.
- Add an authenticated local journey test: create/import two datasets, review/approve, materialize KPI/table/chart values, publish a certified snapshot, reload, and prove a stale/revoked input leaves the prior snapshot intact.

### 5. Verification and release evidence

- Run contract generation/parity, API typecheck/test compile, focused JRA/IAE/DDA tests, engine pytest/Ruff/mypy, Web typecheck/tests/build, Prisma validate/foundation inventory and `git diff --check`.
- Run the Docker-backed local journey when Docker is available and record the exact commands and any external owner gates in `infrastructure/local/README.md`.
- Do not mark cloud worker/AWS production ready until the owner supplies deployment secrets and the cloud input/output adapters pass the same tests.

## Explicitly deferred

- OpenAI provider activation/evaluation and Google OIDC production activation.
- PayOS credentials/webhook exposure (the local signed mock remains the only local payment mode).
- Android/Desktop signed release and real-device evidence.
- AWS deployment, monitoring, backups and rollback evidence.
