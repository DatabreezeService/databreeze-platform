# Private Data Analyst ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Private Data Analyst.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: PDA local analysis

Primary requirements / Y?u c?u ch?nh: PDA-001, PDA-002, PDA-003, PDA-004, PDA-005, PDA-006, PDA-007, PDA-008, PDA-009, PDA-010, PDA-011, PDA-012, PDA-013, PDA-014, PDA-015, PDA-016, PDA-017, PDA-018, PDA-019, PDA-020, PDA-021, PDA-022, PDA-023, PDA-024, PDA-025, PDA-026, PDA-027, PDA-028, PDA-029, PDA-030, PDA-031, PDA-032, PDA-033, PDA-034, PDA-035, PDA-036, PDA-037

Paths / ???ng d?n:
- services/api/src/features/private-data-analyst/{domain,application,adapter,api}/
- services/api/prisma/schema/private-data-analyst.prisma
- packages/contracts/schemas/v1/private-data-analyst/
- apps/web/src/features/private-data-analyst/
- apps/desktop/src/features/private-data-analyst/
- apps/android/app/src/main/kotlin/com/databreeze/privatedataanalyst/
- services/engine/src/databreeze_engine/processors/private-data-analyst/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/private-data-analyst/, apps/web/src/features/private-data-analyst/__tests__/, services/engine/tests/processors/private-data-analyst/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
