# Collaboration and Integrations ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Collaboration and Integrations.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: NCO collaboration

Primary requirements / Y?u c?u ch?nh: NCO-001, NCO-002, NCO-003, NCO-004, NCO-005, NCO-006, NCO-007, NCO-008, NCO-009, NCO-010, NCO-011, NCO-012, NCO-013, NCO-014, NCO-015, NCO-016, NCO-017, NCO-018, NCO-019, NCO-020

Paths / ???ng d?n:
- services/api/src/features/collaboration-integrations/{domain,application,adapter,api}/
- services/api/prisma/schema/collaboration-integrations.prisma
- packages/contracts/schemas/v1/collaboration-integrations/
- apps/web/src/features/collaboration-integrations/
- apps/desktop/src/features/collaboration-integrations/
- apps/android/app/src/main/kotlin/com/databreeze/collaborationintegrations/
- services/engine/src/databreeze_engine/processors/collaboration-integrations/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/collaboration-integrations/, apps/web/src/features/collaboration-integrations/__tests__/, services/engine/tests/processors/collaboration-integrations/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

### Task 2: INT integrations

Primary requirements / Y?u c?u ch?nh: INT-001, INT-002, INT-003, INT-004, INT-005, INT-006, INT-007, INT-008, INT-009, INT-010, INT-011, INT-012, INT-013, INT-014, INT-015, INT-016, INT-017, INT-018, INT-019, INT-020, INT-021, INT-022

Paths / ???ng d?n:
- services/api/src/features/collaboration-integrations/{domain,application,adapter,api}/
- services/api/prisma/schema/collaboration-integrations.prisma
- packages/contracts/schemas/v1/collaboration-integrations/
- apps/web/src/features/collaboration-integrations/
- apps/desktop/src/features/collaboration-integrations/
- apps/android/app/src/main/kotlin/com/databreeze/collaborationintegrations/
- services/engine/src/databreeze_engine/processors/collaboration-integrations/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/collaboration-integrations/, apps/web/src/features/collaboration-integrations/__tests__/, services/engine/tests/processors/collaboration-integrations/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
