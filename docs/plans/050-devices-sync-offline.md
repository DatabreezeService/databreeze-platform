# Devices, Sync and Offline ? K? ho?ch tri?n khai / Implementation Plan

Goal / M?c ti?u: an independently deployable, testable, Vietnamese-first slice for Devices, Sync and Offline.

Architecture / Ki?n tr?c: NestJS/Fastify modular monolith with domain, application, adapter and API layers; Web/Desktop/Android/engine consume generated contracts and never feature persistence directly.

Dependencies / Ph? thu?c: 010 ? 020 ? 030 ? 040 ? 050 ? 060 ? 070 ? 100/110/120/130 ? 200/210/220 ? 300/310/320 ? 400; 500 is post-GA.

## Global constraints / R?ng bu?c

- Preserve IAM, AUD, tenant isolation, evidence, retention, data mode and approvals. Vietnamese default; English fallback complete.
- Mutations require TenantScope, correlation, idempotency and revision. P0 is a release gate, P1 completes GA, P2 is post-GA.
- No remote shell, filesystem browsing, cross-feature persistence, or sensitive telemetry.

## Tasks

### Task 1: DSO device sync

Primary requirements / Y?u c?u ch?nh: DSO-001, DSO-002, DSO-003, DSO-004, DSO-005, DSO-006, DSO-007, DSO-008, DSO-009, DSO-010, DSO-011, DSO-012, DSO-013, DSO-014, DSO-015, DSO-016, DSO-017, DSO-018, DSO-019, DSO-020, DSO-021, DSO-022, DSO-023, DSO-024, DSO-025, DSO-026, DSO-027

Paths / ???ng d?n:
- services/api/src/features/devices-sync-offline/{domain,application,adapter,api}/
- services/api/prisma/schema/devices-sync-offline.prisma
- packages/contracts/schemas/v1/devices-sync-offline/
- apps/web/src/features/devices-sync-offline/
- apps/desktop/src/features/devices-sync-offline/
- apps/android/app/src/main/kotlin/com/databreeze/devicessyncoffline/
- services/engine/src/databreeze_engine/processors/devices-sync-offline/

Public interface / Giao di?n: versioned OpenAPI and JSON Schema v1; commands carry commandId, idempotencyKey, expectedRevision?, TenantScope; failures return RFC 7807 Problem. Generated contracts are the only client/worker boundary.

- [ ] TDD: write red requirement-linked authorization, tenant, data-mode, idempotency and recovery tests, then implement domain/application/adapter/API and Vietnamese-first UI with complete English fallback.
- [ ] Migration: add scoped keys, revision and resumable backfill; rollback via compensating migration/tombstone without mutating audit or artifact history.
- [ ] Add unit, integration, contract, tenant-isolation, concurrency, E2E and accessibility tests at services/api/test/features/devices-sync-offline/, apps/web/src/features/devices-sync-offline/__tests__/, services/engine/tests/processors/devices-sync-offline/.
- [ ] Telemetry is allowlisted correlation/outcome/latency/retry only; never emit source content, secret, local path or evidence snippet. On failure stop side effect, persist safe state and return stable Problem.
- [ ] Release gate: P0 security/tenant/audit/evidence/data-mode/recovery pass; P1 before GA; P2 only by plan 500.

### Task 2: Android and Desktop offline

Primary requirements / Y?u c?u ch?nh: AND-001, AND-002, AND-003, AND-004, AND-005, AND-006, AND-007, AND-008, AND-009, AND-010, AND-011, AND-012, AND-013, AND-014, AND-015, AND-016, AND-017, AND-018, AND-019, AND-020, AND-021, AND-022, AND-023

Paths / ???ng d?n:
- services/api/src/features/devices-sync-offline/{domain,application,adapter,api}/
- services/api/prisma/schema/devices-sync-offline.prisma
- packages/contracts/schemas/v1/devices-sync-offline/
- apps/web/src/features/devices-sync-offline/
- apps/desktop/src/features/devices-sync-offline/
- apps/android/app/src/main/kotlin/com/databreeze/devicessyncoffline/
- services/engine/src/databreeze_en…207110 tokens truncated…": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "p0-release-gate"
    },
    {
      "requirementId": "WEB-010",
      "priority": "P0",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "p0-release-gate"
    },
    {
      "requirementId": "WEB-011",
      "priority": "P0",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "p0-release-gate"
    },
    {
      "requirementId": "WEB-012",
      "priority": "P0",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "p0-release-gate"
    },
    {
      "requirementId": "WEB-013",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-014",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-015",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-016",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-017",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-018",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-019",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-020",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-021",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-022",
      "priority": "P1",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "ga-completion"
    },
    {
      "requirementId": "WEB-023",
      "priority": "P0",
      "primaryPlan": "400-production-readiness.md",
      "primaryTask": "Task 1: WEB production control center",
      "supportingTasks": [],
      "codePaths": [
        "services/api/src/features/production-readiness/{domain,application,adapter,api}/",
        "services/api/prisma/schema/production-readiness.prisma",
        "packages/contracts/schemas/v1/production-readiness/",
        "apps/web/src/features/production-readiness/",
        "apps/desktop/src/features/production-readiness/",
        "apps/android/app/src/main/kotlin/com/databreeze/productionreadiness/",
        "services/engine/src/databreeze_engine/processors/production-readiness/"
      ],
      "testPaths": [
        "services/api/test/features/production-readiness/",
        "apps/web/src/features/production-readiness/__tests__/",
        "services/engine/tests/processors/production-readiness/"
      ],
      "releaseEvidence": [
        "requirement-linked-tests",
        "security-and-tenant-gate",
        "release-manager-approval"
      ],
      "status": "planned",
      "coverage": "planned",
      "verificationStatus": "not-verified",
      "verifiedPaths": [],
      "releaseStatus": "p0-release-gate"
    }
  ]
}
