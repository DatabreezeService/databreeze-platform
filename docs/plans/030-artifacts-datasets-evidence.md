# Artifacts, Datasets and Evidence ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Artifacts, Datasets and Evidence.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: IAE artifacts and evidence

Primary requirements / Y?u c?u ch?nh: IAE-001, IAE-002, IAE-003, IAE-004, IAE-005, IAE-006, IAE-007, IAE-008, IAE-009, IAE-010, IAE-011, IAE-012, IAE-013, IAE-014, IAE-015, IAE-016, IAE-017, IAE-018, IAE-019, IAE-020, IAE-021

Paths / ???ng d?n:
- services/api/src/features/artifacts-datasets-evidence/{domain,application,adapter,api}/
- services/api/prisma/schema/artifacts-datasets-evidence.prisma
- packages/contracts/schemas/v1/artifacts-datasets-evidence/
- apps/web/src/features/artifacts-datasets-evidence/
- apps/desktop/src/features/artifacts-datasets-evidence/
- apps/android/app/src/main/kotlin/com/databreeze/artifactsdatasetsevidence/
- services/engine/src/databreeze_engine/processors/artifacts-datasets-evidence/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/artifacts-datasets-evidence/, apps/web/src/features/artifacts-datasets-evidence/__tests__/, services/engine/tests/processors/artifacts-datasets-evidence/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

### Task 2: DSM datasets and rules

Primary requirements / Y?u c?u ch?nh: DSM-001, DSM-002, DSM-003, DSM-004, DSM-005, DSM-006, DSM-007, DSM-008, DSM-009, DSM-010, DSM-011, DSM-012, DSM-013, DSM-014, DSM-015, DSM-016, DSM-017, DSM-018, DSM-019, DSM-020, DSM-021, DSM-022, DSM-023, DSM-025, DSM-026, DSM-027

Paths / ???ng d?n:
- services/api/src/features/artifacts-datasets-evidence/{domain,application,adapter,api}/
- services/api/prisma/schema/artifacts-datasets-evidence.prisma
- packages/contracts/schemas/v1/artifacts-datasets-evidence/
- apps/web/src/features/artifacts-datasets-evidence/
- apps/desktop/src/features/artifacts-datasets-evidence/
- apps/android/app/src/main/kotlin/com/databreeze/artifactsdatasetsevidence/
- services/engine/src/databreeze_engine/processors/artifacts-datasets-evidence/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/artifacts-datasets-evidence/, apps/web/src/features/artifacts-datasets-evidence/__tests__/, services/engine/tests/processors/artifacts-datasets-evidence/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
