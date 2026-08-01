# Migration Ready ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Migration Ready.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: MR migration

Primary requirements / Y?u c?u ch?nh: MR-001, MR-002, MR-003, MR-004, MR-005, MR-006, MR-007, MR-008, MR-009, MR-010, MR-011, MR-012, MR-013, MR-014, MR-015, MR-016, MR-017, MR-018, MR-019, MR-020, MR-021, MR-022, MR-023, MR-024, MR-025, MR-026, MR-027, MR-028, MR-029, MR-030, MR-031, MR-032

Paths / ???ng d?n:
- services/api/src/features/migration-ready/{domain,application,adapter,api}/
- services/api/prisma/schema/migration-ready.prisma
- packages/contracts/schemas/v1/migration-ready/
- apps/web/src/features/migration-ready/
- apps/desktop/src/features/migration-ready/
- apps/android/app/src/main/kotlin/com/databreeze/migrationready/
- services/engine/src/databreeze_engine/processors/migration-ready/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/migration-ready/, apps/web/src/features/migration-ready/__tests__/, services/engine/tests/processors/migration-ready/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
