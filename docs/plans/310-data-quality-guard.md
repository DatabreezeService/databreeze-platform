# Data Quality Guard ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Data Quality Guard.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: DQG quality

Primary requirements / Y?u c?u ch?nh: DQG-001, DQG-002, DQG-003, DQG-004, DQG-005, DQG-006, DQG-007, DQG-008, DQG-009, DQG-010, DQG-011, DQG-012, DQG-013, DQG-014, DQG-015, DQG-016, DQG-017, DQG-018, DQG-019, DQG-020, DQG-021, DQG-022, DQG-023, DQG-024, DQG-025, DQG-026, DQG-027, DQG-028, DQG-029, DQG-030, DQG-031, DQG-032, DQG-033, DQG-034, DQG-035

Paths / ???ng d?n:
- services/api/src/features/data-quality-guard/{domain,application,adapter,api}/
- services/api/prisma/schema/data-quality-guard.prisma
- packages/contracts/schemas/v1/data-quality-guard/
- apps/web/src/features/data-quality-guard/
- apps/desktop/src/features/data-quality-guard/
- apps/android/app/src/main/kotlin/com/databreeze/dataqualityguard/
- services/engine/src/databreeze_engine/processors/data-quality-guard/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/data-quality-guard/, apps/web/src/features/data-quality-guard/__tests__/, services/engine/tests/processors/data-quality-guard/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
