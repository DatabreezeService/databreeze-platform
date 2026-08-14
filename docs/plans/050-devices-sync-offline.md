# Thiết bị, đồng bộ và ngoại tuyến — Kế hoạch triển khai / Devices, Sync and Offline Implementation Plan

**Mục tiêu / Goal:** Cung cấp DSO an toàn cho đăng ký thiết bị, đồng bộ, xung đột, chuyển giao và thu hồi; triển khai trải nghiệm ngoại tuyến Desktop/Android mà không để client thay thế IAM, AUD, IAE hay JRA.

**Phạm vi primary / Primary scope:**

- Task 1 sở hữu DSO-001 đến DSO-027.
- Task 2 sở hữu AND-001 đến AND-023 và DSK-001 đến DSK-026. `DSK-001`, `DSK-002`, `DSK-008` giữ `partial` và `not-verified` trong manifest vì shell hiện có; không requirement nào được đánh dấu verified bởi plan này.

**Approved authority subplan:** `051-dso-workspace-policy-authority.md` defines the DSO-018/024/026/027 and IAM-002/003/012/019/020 atomic publish-and-activate prerequisite for durable execution routing.

**Kiến trúc / Architecture:** `devices-sync-offline` là mô-đun NestJS/Fastify. Domain xác định device, capability, operation và conflict; application điều phối IAM authorization, JRA jobs và AUD events; adapters thực hiện Prisma, queue, object grant và signed transfer. Desktop Electron và Android Kotlin/Compose dùng hợp đồng v1 đã sinh; Python engine chỉ nhận typed processor payload, không nhận database credential hay arbitrary command.

## Phụ thuộc và giới hạn / Dependencies and boundaries

1. `010-engineering-foundation.md` cung cấp shell, contracts và telemetry.
2. `020-identity-audit-entitlements.md` phải cung cấp IAM DeviceIdentity, policy, session, authorization và AUD append before any DSO mutation.
3. `030-artifacts-datasets-evidence.md` cung cấp immutable ArtifactVersion/EvidenceReference; `040-jobs-processing-approvals.md` cung cấp signed typed jobs.
4. Plan này hoàn thành trước NCO/INT và dogfood. Web chỉ hiển thị opaque status/capability; không duyệt filesystem, path, shell, script hay remote desktop.

## Đường dẫn và hợp đồng / Paths and contracts

- `services/api/src/features/devices-sync-offline/{domain,application,adapter,api}/`
- `services/api/prisma/schema/devices-sync-offline.prisma`
- `packages/contracts/schemas/v1/devices-sync-offline/`
- `apps/web/src/features/devices-sync-offline/`
- `apps/desktop/src/features/devices-sync-offline/`
- `apps/android/app/src/main/kotlin/com/databreeze/devicessyncoffline/`
- `services/engine/src/databreeze_engine/processors/devices-sync-offline/`
- Tests: `services/api/test/features/devices-sync-offline/`, `apps/desktop/test/`, `apps/android/app/src/test/`, `apps/android/app/src/androidTest/`, `services/engine/tests/processors/devices-sync-offline/`.

Public v1 interfaces are `DeviceEnrollment`, `DeviceCapabilitySummary`, `SyncOperation`, `SyncConflict`, `OfflinePackageManifest`, `DeviceTransferReceipt`, and RFC 7807 `Problem`. Commands require `commandId`, `idempotencyKey`, `expectedRevision?`, `TenantScope`, caller/device identity and policy snapshot; all clients validate generated OpenAPI/JSON Schema responses at runtime.

### Task 1: DSO device sync

**Primary requirements:** DSO-001, DSO-002, DSO-003, DSO-004, DSO-005, DSO-006, DSO-007, DSO-008, DSO-009, DSO-010, DSO-011, DSO-012, DSO-013, DSO-014, DSO-015, DSO-016, DSO-017, DSO-018, DSO-019, DSO-020, DSO-021, DSO-022, DSO-023, DSO-024, DSO-025, DSO-026, DSO-027.

- [ ] Write red domain/application tests for tenant-scoped enrollment, public-key rotation/revocation, grant/capability checks, idempotent operation acknowledgement, dependency ordering, policy/data-mode deny, explicit conflict and recovery after duplicate/lost acknowledgement.
- [ ] Add migrations for `DeviceIdentityLink`, capability/grant revision, encrypted `SyncOperation`, `SyncConflict`, package manifest/receipt and quarantined local audit fragment references. Use tenant/device/operation unique constraints, optimistic revisions, immutable hashes and resumable backfill; write domain mutation and mandatory AUD event in one transaction.
- [ ] Implement enrollment, heartbeat, capability/grant, push/pull reconciliation, conflict resolution, revocation and strict-Local package handoff handlers. Device receives only authorized opaque typed payloads; data mode forbids cloud upload/relay where required.
- [ ] Publish contracts and API endpoints for enrollment confirmation, status, operation batches, conflicts and package receipt. Web manages status and revocation only; it cannot infer paths or source content. Add contract, two-tenant isolation, migration, retry/concurrency, signed-payload, tamper, expiry and offline-resume tests.
- [ ] Emit allowlisted metrics: enrollment outcome, sync latency/backlog, retry, conflict type/count, revocation, package verification and protocol version. Never emit original bytes, filename, local path, preview, OCR/transcript, token or evidence value.
- [ ] Failure behavior: reject stale security epoch/revoked device/wrong scope before side effect; quarantine malformed fragment/package, return stable Problem and keep durable operation state. Roll back with compensating migration/feature flag, preserve AUD and package receipts, and require reconciliation rather than silent last-write-wins.
- [ ] Release gate: all DSO P0 security, tenant, data-mode, audit, conflict, handoff and disaster-recovery tests pass; DSO P1 reliability/usability tests pass before GA.

### Task 2: Android and Desktop offline

**Primary requirements:** AND-001, AND-002, AND-003, AND-004, AND-005, AND-006, AND-007, AND-008, AND-009, AND-010, AND-011, AND-012, AND-013, AND-014, AND-015, AND-016, AND-017, AND-018, AND-019, AND-020, AND-021, AND-022, AND-023; DSK-001, DSK-002, DSK-003, DSK-004, DSK-005, DSK-006, DSK-007, DSK-008, DSK-009, DSK-010, DSK-011, DSK-012, DSK-013, DSK-014, DSK-015, DSK-016, DSK-017, DSK-018, DSK-019, DSK-020, DSK-021, DSK-022, DSK-023, DSK-024, DSK-025, DSK-026.

- [ ] Define native ports for keystore/key-envelope, encrypted account-scoped Room/local store, WorkManager/desktop scheduler, scoped-share intake, CameraX/voice capture, local retention and DSO transport. Desktop main/preload remains sandboxed, context-isolated and allowlisted; renderer never receives Node, filesystem or raw secret access.
- [ ] Implement device-bound sessions and rotating credentials; clear queues, databases, grants and key material on revoke/account switch. Enforce Android backup exclusions, no `MANAGE_EXTERNAL_STORAGE`, verified App Links, validated intents and minimal exported components.
- [ ] Preserve original capture bytes immutably; create derived crop/OCR/redaction/transcript versions. Store queues encrypted by account/workspace, enforce dependency ordering and display conflict/reason/queued-byte state. `LOCAL` blocks upload of original/reconstructable content and states cross-device availability honestly.
- [ ] Implement user-mediated strict-Local export: explicit item/destination/purpose consent, source signature, authenticated encryption, destination envelope, manifest/hash/expiry, OS-selected transfer and content-safe receipt; reject cloud upload, relay, peer discovery and unregistered destination.
- [ ] Test Kotlin unit/instrumentation and Desktop security suites for keystore storage, process death/reboot/duplicate work, intent/deep-link rejection, scoped URI copy, capture versioning, policy constraints, offline approval denial, notification minimization, TalkBack/font scaling and account isolation. Add end-to-end fixtures for transfer tamper/expiry and Desktop local-evidence unavailability on Android.
- [ ] Telemetry exposes redacted diagnostics, sync/device/revocation/protocol state and safe recovery guidance only. Fail closed on unavailable key, policy change, revoked device, source offline or authorization loss; preserve user data until confirmed cleanup and append/reconcile LocalAuditFragment through DSO.
- [ ] Roll back with app/version compatibility gate and migration rollback preserving encrypted operation records; disable incompatible sync protocol without deleting unsynchronized work. Release gate requires AND/DSK P0 security/offline/data-mode/evidence tests and P1 accessibility/localization/reliability tests before GA.

## Release evidence / Bằng chứng phát hành

For each record in `docs/plans/requirement-traceability.json`, retain `planned` or permitted shell `partial` status and `verificationStatus: not-verified` until linked migration, contract, test and release evidence paths exist. A release manager verifies P0 before promotion and P1 before GA; no P2 requirement is owned by this plan.

## Hoãn lại / Deferred

Collaboration notifications, integrations, feature workflows and post-GA extensions consume DSO public contracts later. They must not add direct persistence access or turn Web/Desktop/Android into arbitrary remote-control surfaces.
