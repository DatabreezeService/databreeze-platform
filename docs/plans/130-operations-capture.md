# Operations Capture ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Operations Capture.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: OC capture

Primary requirements / Y?u c?u ch?nh: OC-001, OC-002, OC-003, OC-004, OC-005, OC-006, OC-007, OC-008, OC-009, OC-010, OC-011, OC-012, OC-013, OC-014, OC-015, OC-016, OC-017, OC-018, OC-019, OC-020, OC-021, OC-022, OC-023, OC-024, OC-025, OC-026, OC-027, OC-028, OC-029, OC-030, OC-031, OC-032, OC-033, OC-034, OC-035, OC-036, OC-037, OC-038, OC-039, OC-040

Paths / ???ng d?n:
- services/api/src/features/operations-capture/{domain,application,adapter,api}/
- services/api/prisma/schema/operations-capture.prisma
- packages/contracts/schemas/v1/operations-capture/
- apps/web/src/features/operations-capture/
- apps/desktop/src/features/operations-capture/
- apps/android/app/src/main/kotlin/com/databreeze/operationscapture/
- services/engine/src/databreeze_engine/processors/operations-capture/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/operations-capture/, apps/web/src/features/operations-capture/__tests__/, services/engine/tests/processors/operations-capture/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
