# Folder Autopilot ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Folder Autopilot.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: FA governed automation

Primary requirements / Y?u c?u ch?nh: FA-001, FA-002, FA-003, FA-004, FA-005, FA-006, FA-007, FA-008, FA-009, FA-010, FA-011, FA-012, FA-013, FA-014, FA-015, FA-016, FA-017, FA-018, FA-019, FA-020, FA-021, FA-022, FA-023, FA-024, FA-025, FA-026, FA-027, FA-028, FA-029, FA-030, FA-031, FA-032, FA-033, FA-034

Paths / ???ng d?n:
- services/api/src/features/folder-autopilot/{domain,application,adapter,api}/
- services/api/prisma/schema/folder-autopilot.prisma
- packages/contracts/schemas/v1/folder-autopilot/
- apps/web/src/features/folder-autopilot/
- apps/desktop/src/features/folder-autopilot/
- apps/android/app/src/main/kotlin/com/databreeze/folderautopilot/
- services/engine/src/databreeze_engine/processors/folder-autopilot/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/folder-autopilot/, apps/web/src/features/folder-autopilot/__tests__/, services/engine/tests/processors/folder-autopilot/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / B?ng ch?ng ph?t h?nh

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.
