# Production Readiness — Kế hoạch triển khai / Implementation Plan

**Goal / Mục tiêu:** an independently deployable, testable, Vietnamese-first slice for Production Readiness.

**Architecture / Kiến trúc:** NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

**Dependencies / Phụ thuộc:** 010 → 020 → 030 → 040 → 050 → 060 → 070 → 100/110/120/130 → 200/210/220 → 300/310/320 → 400; 500 is post-GA.

## Global constraints / Ràng buộc

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: WEB production control center

Primary requirements / Yêu cầu chính: WEB-001, WEB-002, WEB-003, WEB-004, WEB-005, WEB-006, WEB-007, WEB-008, WEB-009, WEB-010, WEB-011, WEB-012, WEB-013, WEB-014, WEB-015, WEB-016, WEB-017, WEB-018, WEB-019, WEB-020, WEB-021, WEB-022, WEB-023

Paths / Đường dẫn:
- services/api/src/features/production-readiness/{domain,application,adapter,api}/
- services/api/prisma/schema/production-readiness.prisma
- packages/contracts/schemas/v1/production-readiness/
- apps/web/src/features/production-readiness/
- apps/desktop/src/features/production-readiness/
- apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/
- services/engine/src/databreeze_engine/processors/production-readiness/

Public interface / Giao diện: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/production-readiness/, apps/web/src/features/production-readiness/__tests__/, services/engine/tests/processors/production-readiness/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

## Release evidence / Bằng chứng phát hành

The manifest docs/plans/requirement-traceability.json is authoritative. A record becomes verified only after evidence paths exist, linked tests pass and the release gate is approved. All P2 IDs are exclusively owned by 500.

> Note: Data-to-Dashboard Agent production activation is owned by [`401-dda-production-readiness.md`](401-dda-production-readiness.md) and the code-first resume plan [`402-dda-code-first-completion.md`](402-dda-code-first-completion.md). This plan retains legacy WEB-001..023 ownership only.
