# Invoice Leak Detector ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Invoice Leak Detector.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: ILD invoice leaks

Primary requirements / Y?u c?u ch?nh: ILD-001, ILD-002, ILD-003, ILD-004, ILD-005, ILD-006, ILD-007, ILD-008, ILD-009, ILD-010, ILD-011, ILD-012, ILD-013, ILD-014, ILD-015, ILD-016, ILD-017, ILD-018, ILD-019, ILD-020, ILD-021, ILD-022, ILD-023, ILD-024, ILD-025, ILD-026, ILD-027

Paths / ???ng d?n:
- services/api/src/features/invoice-leak-detector/{domain,application,adapter,api}/
- services/api/prisma/schema/invoice-leak-detector.prisma
- packages/contracts/schemas/v1/invoice-leak-detector/
- apps/web/src/features/invoice-leak-detector/
- apps/desktop/src/features/invoice-leak-detector/
- apps/android/app/src/main/kotlin/com/databreeze/invoiceleakdetector/
- services/engine/src/databreeze_engine/processors/invoice-leak-detector/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/invoice-leak-detector/, apps/web/src/features/invoice-leak-detector/__tests__/, services/engine/tests/processors/invoice-leak-detector/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
