# DDA Desktop Hybrid Folder Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`; use `superpowers:test-driven-development` for each task.

**Status:** Approved<br>
**Requirements:** DDA-012, DDA-013, DDA-014, DDA-037, DDA-039<br>
**Depends on:** Plan 081 G1 contract commit and existing DSO capability/data-mode/sync contracts<br>
**Parallel with:** Plans 082-084 and 086, subject to plan 080 file locks

**Goal:** Let Windows users bind an explicitly approved folder, process stable compatible CSV/XLSX changes locally, and publish only a reviewed Hybrid projection while cloud views degrade honestly when the source is unavailable.

**Architecture:** Electron main owns the OS picker, canonical path, watcher, fingerprints, and typed IPC. The preload exposes a narrow versioned bridge; the renderer never receives arbitrary filesystem APIs. A signed Python sidecar executes frozen typed plans. DSO owns capability, device, projection, sync, revocation, and sequencing. Cloud stores opaque binding/capability IDs and content-safe status only.

**Tech Stack:** Electron/TypeScript/React, Node filesystem primitives behind main-process adapters, existing signed Python sidecar protocol, DSO authenticated APIs/queues, Vitest/Node security tests.

## Global Constraints

- This lane owns Desktop folder/application/IPC/preload/renderer paths and the approved sidecar request/result additions. It may edit `ipc-registry.ts` and the preload bridge; no other lane may.
- Do not edit cloud API root composition, shared/generated contracts, Web, Android, or DDA traceability.
- Folder access starts only from an active OS picker selection and DSO capability/grant. No arbitrary path string, recursive whole-drive scan, shell, remote command, or renderer filesystem API.
- Canonical path and local display name never leave Desktop. Logs/telemetry use opaque binding IDs and reason codes.
- Local outputs are immutable versions. Sync transfers only the exact approved projection and remains idempotent/revocable.

### Task 1: Bind an approved folder and version its manifest

**Primary requirements:** DDA-012, DDA-013

**Files:**

- Create: `apps/desktop/src/application/folder-binding.port.ts`
- Create: `apps/desktop/src/application/folder-manifest.service.ts`
- Create: `apps/desktop/src/main/adapters/windows-folder-binding.adapter.ts`
- Create: `apps/desktop/src/shared/folder-binding-contract-v1.ts`
- Modify: `apps/desktop/src/main/ipc-registry.ts`
- Modify: `apps/desktop/src/preload/bridge-v1.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/desktop-bridge.d.ts`
- Create: `apps/desktop/src/renderer/features/folders/folder-binding-page.tsx`
- Create: `apps/desktop/src/renderer/features/folders/folder-manifest-editor.tsx`
- Create: `apps/desktop/test/folder-binding.service.test.ts`
- Create: `apps/desktop/test/security-folder-binding-ipc.test.ts`
- Create: `apps/desktop/test/folder-manifest.test.ts`

**Manifest fields:** purpose; supported profiles; schema fingerprints; grouping rules; append/replace/version behavior; period/overlap rules; duplicate keys; mapping policy; stability/debounce policy; and publication projection.

**TDD sequence:**

1. Add red tests for renderer-supplied arbitrary paths, expired/revoked/wrong-scope capability, symlink/junction escape, cloud-path serialization, duplicate bindings, manifest revision conflict, and missing required policy.
2. Add a security test that enumerates the preload surface and proves it exposes only select/create/read-status/update-manifest/disable operations with validated payloads.
3. Implement OS-picker selection, local canonical-path storage through the existing locked state port, opaque cloud identity, and immutable parented manifests.
4. Add Vietnamese/English renderer states and explicit capability/projection confirmation.
5. Run Desktop typecheck, security check, and tests. Commit `feat(desktop): bind governed data folders`.

### Task 2: Detect stable safe file changes

**Primary requirement:** DDA-014

**Files:**

- Create: `apps/desktop/src/application/stable-file-detector.ts`
- Create: `apps/desktop/src/application/folder-intake.service.ts`
- Create: `apps/desktop/src/main/adapters/windows-folder-watcher.adapter.ts`
- Create: `apps/desktop/src/shared/folder-intake-contract-v1.ts`
- Create: `apps/desktop/src/renderer/features/folders/folder-review-queue.tsx`
- Create: `apps/desktop/test/stable-file-detector.test.ts`
- Create: `apps/desktop/test/folder-intake-replay.test.ts`
- Create: `apps/desktop/test/security-folder-path-escape.test.ts`
- Create: `services/engine/src/databreeze_engine/processors/dda_folder_intake.py`
- Create: `services/engine/tests/test_dda_folder_intake.py`

**TDD sequence:**

1. Add fake-clock tests for create/write/rename bursts, partial copy, lock-file presence, changing size/mtime, debounce expiry, watcher restart, duplicate native events, and identical content at a new path.
2. Add fingerprint tests for supported actual content and quarantine tests for path escape, unsupported/malformed content, ambiguity, schema drift, period overlap, duplicate keys/content, and mapping incompatibility.
3. Implement stable-file admission and a durable local event/content ledger. Known compatible inputs may invoke only the manifest-pinned typed sidecar plan; all other cases enter review/quarantine.
4. Ensure rejected/quarantined files remain untouched and reason-coded. Never rename/move/delete source files in V1.
5. Run Desktop and focused engine tests. Commit `feat(desktop): process stable folder changes`.

### Task 3: Project Hybrid results and degrade safely

**Primary requirements:** DDA-037, DDA-039

**Files:**

- Create: `apps/desktop/src/application/publication-projection.service.ts`
- Create: `apps/desktop/src/application/folder-sync.service.ts`
- Create: `apps/desktop/src/renderer/features/folders/projection-review.tsx`
- Create: `apps/desktop/src/renderer/features/folders/folder-sync-status.tsx`
- Create: `apps/desktop/test/publication-projection.test.tsx`
- Create: `apps/desktop/test/folder-sync-idempotency.test.ts`
- Create: `apps/desktop/test/folder-source-unavailable.test.tsx`

**Projection classes:** metadata only; dashboard-specific aggregates; selected governed rows/columns; evidence derivatives; or original content where workspace policy explicitly permits it.

**TDD sequence:**

1. Add red tests requiring preview of classification, fields, rows/counts/bytes, destination, evidence consequences, effective data-mode policy, and version before transfer.
2. Test that a projection can narrow but cannot broaden workspace policy, and a manifest change creates a new version/review.
3. Test resumable/idempotent sync, replay, revocation, offline queue restart, stale device, rejected projection, partial upload, server receipt loss, and no automatic reroute/substitution.
4. Implement DSO queue/API composition. Cloud receives only the approved bytes/reference classes and content-safe status; it never receives the path.
5. Render last-good cloud state with exact `SOURCE_OFFLINE|DEVICE_REVOKED|SOURCE_STALE|AWAITING_REVIEW|AWAITING_SYNC` reasons.
6. Run Desktop security/full tests. Commit `feat(desktop): sync reviewed hybrid projections`.

### Task 4: Produce the lane handoff

Run `corepack pnpm --filter @databreeze/desktop security:check`, `typecheck`, and `test`, plus focused engine tests. Return commit hashes, IPC surface, security evidence, replay/offline cases, projection examples, known limitations, and contract requests. Do not self-edit traceability status.
