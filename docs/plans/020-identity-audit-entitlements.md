# Identity, Audit and Entitlements ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Identity, Audit and Entitlements.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: IAM identity and permissions

Primary requirements / Y?u c?u ch?nh: IAM-001, IAM-002, IAM-003, IAM-004, IAM-005, IAM-006, IAM-007, IAM-008, IAM-009, IAM-010, IAM-011, IAM-012, IAM-013, IAM-014, IAM-015, IAM-016, IAM-017, IAM-018, IAM-019, IAM-020, IAM-021

Paths / ???ng d?n:
- services/api/src/features/identity-audit-entitlements/{domain,application,adapter,api}/
- services/api/prisma/schema/identity-audit-entitlements.prisma
- packages/contracts/schemas/v1/identity-audit-entitlements/
- apps/web/src/features/identity-audit-entitlements/
- apps/desktop/src/features/identity-audit-entitlements/
- apps/android/app/src/main/kotlin/com/databreeze/identityauditentitlements/
- services/engine/src/databreeze_engine/processors/identity-audit-entitlements/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/identity-audit-entitlements/, apps/web/src/features/identity-audit-entitlements/__tests__/, services/engine/tests/processors/identity-audit-entitlements/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

### Task 2: AUD immutable ledger

Primary requirements / Y?u c?u ch?nh: AUD-001, AUD-002, AUD-003, AUD-004, AUD-005, AUD-006, AUD-007, AUD-008, AUD-009, AUD-010, AUD-011, AUD-012, AUD-013, AUD-014, AUD-015, AUD-016, AUD-017, AUD-018, AUD-019, AUD-020, AUD-021, AUD-022, AUD-023, AUD-024

Paths / ???ng d?n:
- services/api/src/features/identity-audit-entitlements/{domain,application,adapter,api}/
- services/api/prisma/schema/identity-audit-entitlements.prisma
- packages/contracts/schemas/v1/identity-audit-entitlements/
- apps/web/src/features/identity-audit-entitlements/
- apps/desktop/src/features/identity-audit-entitlements/
- apps/android/app/src/main/kotlin/com/databreeze/identityauditentitlements/
- services/engine/src/databreeze_engine/processors/identity-audit-entitlements/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/identity-audit-entitlements/, apps/web/src/features/identity-audit-entitlements/__tests__/, services/engine/tests/processors/identity-audit-entitlements/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

### Task 3: BUA billing and usage

Primary requirements / Y?u c?u ch?nh: BUA-001, BUA-002, BUA-003, BUA-004, BUA-005, BUA-006, BUA-007, BUA-008, BUA-009, BUA-010, BUA-011, BUA-012, BUA-013, BUA-014, BUA-015, BUA-016, BUA-017, BUA-018, BUA-019, BUA-020, BUA-021, BUA-022

Paths / ???ng d?n:
- services/api/src/features/identity-audit-entitlements/{domain,application,adapter,api}/
- services/api/prisma/schema/identity-audit-entitlements.prisma
- packages/contracts/schemas/v1/identity-audit-entitlements/
- apps/web/src/features/identity-audit-entitlements/
- apps/desktop/src/features/identity-audit-entitlements/
- apps/android/app/src/main/kotlin/com/databreeze/identityauditentitlements/
- services/engine/src/databreeze_engine/processors/identity-audit-entitlements/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/identity-audit-entitlements/, apps/web/src/features/identity-audit-entitlements/__tests__/, services/engine/tests/processors/identity-audit-entitlements/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.

