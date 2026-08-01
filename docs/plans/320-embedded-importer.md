# Embedded Importer ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Embedded Importer.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: EI import

Primary requirements / Y?u c?u ch?nh: EI-001, EI-002, EI-003, EI-004, EI-005, EI-006, EI-007, EI-008, EI-009, EI-010, EI-011, EI-012, EI-013, EI-014, EI-015, EI-016, EI-017, EI-018, EI-019, EI-020, EI-021, EI-022, EI-023, EI-024, EI-025, EI-026, EI-027

Paths / ???ng d?n:
- services/api/src/features/embedded-importer/{domain,application,adapter,api}/
- services/api/prisma/schema/embedded-importer.prisma
- packages/contracts/schemas/v1/embedded-importer/
- apps/web/src/features/embedded-importer/
- apps/desktop/src/features/embedded-importer/
- apps/android/app/src/main/kotlin/com/databreeze/embeddedimporter/
- services/engine/src/databreeze_engine/processors/embedded-importer/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/embedded-importer/, apps/web/src/features/embedded-importer/__tests__/, services/engine/tests/processors/embedded-importer/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
