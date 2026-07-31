# Windows Desktop Platform

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.0 |
| Requirement prefix | `DSK` |
| Dependencies | `IAM`, `IAE`, `JRA`, `DSO`, `DSM`, `INT`, `NCO`, `BUA`, and `AUD` foundation specifications; Desktop consumes governed definitions/results, gateway/integration status, and audit contracts through published foundation or typed feature APIs |

## Purpose

Define the Windows Desktop application as DataBreeze's trusted local execution agent. Desktop watches user-approved folders, ingests and processes large or sensitive files locally, runs signed typed jobs through the shared Python engine, supports offline work, renders local evidence, proposes safe file operations with undo, and synchronizes only the data classes permitted by workspace policy.

## Scope and non-goals

### In scope

- Electron, React, TypeScript, and Vite application packaged for supported 64-bit Windows releases.
- Device enrollment, approved-folder capabilities, folder watching, local Inbox, encrypted local metadata/queues, and data-mode-aware sync.
- Signed typed job execution and a bundled Python sidecar over versioned JSON-RPC.
- Safe previews, evidence navigation, review, approvals requiring online authority, notifications, and recovery.
- Signed installer/update chain, health reporting, diagnostics export, and rollback.

### Non-goals

- Arbitrary remote PC control, terminal/shell access, arbitrary script execution, unrestricted URL automation, or filesystem browsing from the cloud.
- Scanning an entire disk or silently adding folders.
- Mutating original files in place by default.
- Requiring a user-installed Python runtime.
- Uploading `LOCAL` originals or content-derived previews/OCR to the cloud.
- Replacing Web for complete organization, billing, security-policy, and member administration.

## Concepts and components

### Electron trust boundaries

- **Main process:** owns windows, lifecycle, local database, device keys, approved-folder grants, file watching, OS integration, sidecar supervision, updates, and network coordination.
- **Preload:** exposes a minimal versioned capability API through `contextBridge`; every call is schema-validated and maps to an allowlisted main-process handler.
- **Renderer:** unprivileged React UI with no Node.js integration, filesystem access, process spawning, raw IPC, or secret access.
- **Python sidecar:** bundled `databreeze-engine` executable, started without a shell and controlled through framed JSON-RPC over standard input/output.
- **Local store:** encrypted SQLite-compatible metadata database plus encrypted app-private blob, queue, and result directories.
- **Sync/dispatch client:** device-authenticated HTTPS and WebSocket client that implements `DSO` and verifies `JRA` envelopes.
- **Updater:** pinned update feed, signature verification, staged installation, health check, rollback, and release channel policy.

### Local capabilities

An **ApprovedFolderGrant** is created only after a user chooses a folder through a Windows picker and binds it to one workspace, permitted recipe/action types, read/write policy, and exclusions. Cloud services see an opaque grant ID and capability digest, never the raw path.

Local file access is read-only by default. A typed write action operates on a staged copy, shows a preview, requires policy approval when needed, uses atomic replace only within the approved grant, and writes an undo receipt.

## Platform workflows

### Install, enroll, and unlock

1. A code-signed installer creates per-user application directories and registers no broad filesystem capability.
2. First launch generates an organization-scoped device key protected by Windows credential storage/DPAPI and completes `IAM` challenge enrollment.
3. The user signs in, completes required MFA, chooses an organization, and confirms the device on Web or Desktop.
4. The local encryption key is unwrapped after sign-in/device unlock. The application auto-locks after organization policy inactivity.

### Add and watch a folder

1. The user selects a folder locally and chooses workspace, project default, watch behavior, file patterns, and read/write class.
2. Desktop canonicalizes the path, rejects unsafe roots and overlaps that create ambiguous ownership, records the local path encrypted, and synchronizes only an opaque capability.
3. The watcher debounces events and waits until size/mtime are stable and the file can be opened for read before intake.
4. It computes content hash, creates a local immutable ArtifactVersion reference, and routes a permitted typed job.
5. Renames preserve the artifact identity when content hash and filesystem identity match; content changes create a new version.

### Run a signed job or provisional offline execution

1. When online, Desktop receives a canonical Job and verifies Device session, control-plane signature, nonce, expiry, workspace, action schema, handler digest, entitlement lease, and folder/object grants. When offline, it may instead create only a `JRA` ProvisionalExecution after verifying the cached RecipeVersion's signed `RecipePublicationEnvelope`, every referenced action/schema/DSM/policy hash, supported schema, signing key/version, offline-validity time, and valid IAM/BUA offline leases; that record has no canonical Job ID or approval state.
2. Main process materializes an attempt-specific working directory containing only authorized copies or read handles.
3. The sidecar is started or reused under a supervisor and receives one framed JSON-RPC request with opaque input handles.
4. Progress is schema-validated and persisted locally. Outputs are hash-verified, registered as derived versions, and linked to evidence.
5. Results sync under data-mode policy. External, destructive, or publication effects stop for required approval; DataBreeze subscription-billing provider effects execute only in the cloud control plane and never on Desktop.

### Safe file action and undo

Typed actions such as rename, organize, or generate corrected copy produce a proposed effect manifest. After review/approval, Desktop writes to a temporary sibling, flushes, verifies, and atomically moves it. Originals are retained or moved to an undo area according to policy. The receipt records prior/new hashes and locations locally through opaque handles. Undo is itself a typed, authorized action and fails safely if the target changed.

### Offline operation and recovery

Desktop uses the last valid offline authorization and entitlement leases to capture, review, and run eligible local recipes as provisional executions. It records an append-only queue and immutable result manifests. On reconnect, it requests idempotent server registration, surfaces rejection/conflicts, and keeps approval-gated work blocked until a canonical Job exists and an online decision is recorded.

### Import a strict-Local package

The user explicitly chooses a DSO offline package. Desktop opens it in an isolated staging directory, verifies manifest schema, source/destination/workspace/purpose, Device signature or approved passphrase profile, policy/authorization snapshots, expiry, classifications, sizes, and every entry hash before publishing any placement. Successful import creates IAE `DEVICE_LOCAL` placements or provisional intakes plus a content-safe receipt; duplicate import is idempotent. Failed or later server-rejected imports remain quarantined and cannot start governed execution. Desktop never polls another Device or relays the package through cloud.

### Update

The updater downloads a manifest over TLS, verifies a pinned DataBreeze release signature, package hash, code signature, version/channel, and rollback floor, then stages installation. It closes only after user-safe checkpoint, retains the previous version, and rolls back automatically if the new build fails health checks before local schema finalization.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| DSK-001 | P0 | Electron renderer windows shall use `contextIsolation: true`, `nodeIntegration: false`, sandboxing, navigation restrictions, and a restrictive Content Security Policy. |
| DSK-002 | P0 | The preload shall expose only a versioned allowlist of schema-validated capabilities; renderer code shall have no raw IPC, filesystem, process, keychain, updater, or shell access. |
| DSK-003 | P0 | IPC handlers shall verify sender frame/origin, workspace context, permission, argument size/schema, and current window capability before invoking the main process. |
| DSK-004 | P0 | Folder access shall require a local OS picker and explicit workspace/action grant; the cloud shall receive only opaque grant IDs and shall never specify arbitrary paths. |
| DSK-005 | P0 | File access shall be read-only by default, originals shall remain immutable, and every correction or transformation shall produce a new version or staged copy. |
| DSK-006 | P0 | Desktop shall execute a canonical `JRA` Job only from a signed, unexpired, nonce-protected envelope whose schemas, handler digests, data mode, capabilities, device, workspace, and resources verify locally. |
| DSK-007 | P0 | Desktop shall not expose or implement cloud-triggered shell commands, arbitrary scripts, arbitrary URL navigation, raw keyboard/mouse control, or unrestricted file operations. |
| DSK-008 | P0 | The Python engine shall be bundled, versioned, started without a shell, receive a scrubbed environment and attempt-specific handles, and communicate only through bounded framed JSON-RPC. |
| DSK-009 | P0 | Sidecar requests/responses, progress, errors, and result manifests shall be runtime-validated; malformed, oversized, timed-out, or wrong-attempt messages shall terminate or quarantine the attempt. |
| DSK-010 | P0 | `LOCAL` mode shall prevent original bytes and reconstructable derived content, including previews, OCR/transcripts, row/cell values, thumbnails, source snippets, paths, and chunks, from reaching cloud endpoints or telemetry. |
| DSK-011 | P0 | Local queues, metadata, capability paths, keys, and staged sensitive outputs shall be encrypted with a device-protected key and separated by Windows user profile. |
| DSK-012 | P0 | File-watcher intake shall be debounced, stable-file checked, content-hashed, idempotent, and resistant to partial writes, rename storms, junction loops, and duplicate events. |
| DSK-013 | P0 | Write actions shall use proposed effect manifests, policy approval, atomic operations where supported, effect idempotency, receipts, and an undo path; they shall never overwrite an original silently. |
| DSK-014 | P0 | Installers, executables, update manifests, and update packages shall be signed and verified; an invalid or downgraded update shall not execute. |
| DSK-015 | P1 | Desktop shall provide local Inbox, job/review/approval status, evidence navigation, conflict resolution, device health, queue state, and data-location indicators without duplicating full Web administration. |
| DSK-016 | P1 | Offline-capable actions shall use expiring authorization and entitlement leases, durable operation IDs, append-only local events, and `DSO` conflict rules. |
| DSK-017 | P1 | A user shall be able to pause all watchers and local execution immediately; pause state shall persist across restart and be visible to authorized Web users as content-free device state. |
| DSK-018 | P1 | Sidecar supervision shall enforce time, process-tree, temporary-storage, and configurable memory/CPU limits, and shall kill the full child process tree on cancellation or timeout. |
| DSK-019 | P1 | Diagnostics export shall be user-initiated, previewable, content-redacted, and exclude file names, paths, source values, keys, tokens, comments, and evidence snippets. |
| DSK-020 | P1 | The application shall recover from process crash, Windows restart, sleep, network change, and update without duplicating intake, jobs, file effects, or sync operations. |
| DSK-021 | P1 | Vietnamese shall be the default complete locale with English fallback, and the application shall support keyboard, screen reader, high-contrast, reduced-motion, and Windows scaling settings. |
| DSK-022 | P1 | Device revocation shall block new sync, dispatch, blob transfer, and session refresh immediately; local content shall remain encrypted and the UI shall provide sign-out/export guidance without claiming remote wipe. |
| DSK-023 | P0 | A control-plane request to open `LOCAL` evidence shall contain only an opaque EvidenceReference and content-free context; Desktop shall re-authorize it and render locally, and shall never upload or stream the rendition unless the user separately publishes a governed derivative. |
| DSK-024 | P0 | Offline recipe work shall use `JRA` ProvisionalExecution records with client execution IDs, signed cached definitions, valid offline leases, immutable manifests, and no canonical Job/approval claim; server acceptance shall create at most one canonical Job and rejection shall quarantine the local result. |
| DSK-025 | P0 | Before offline recipe execution, Desktop shall verify the complete JRA RecipePublicationEnvelope, workspace/recipe version and hash, referenced action handler/input/output schema hashes, DSM definition hashes, policy references, supported envelope schema, signer/key version, signature, and offline-validity time; encrypted cache storage alone shall never satisfy authenticity. |
| DSK-026 | P0 | Desktop shall implement DSO offline-package import through explicit user selection, isolated staging, full manifest/signature/recipient/workspace/purpose/policy/expiry/classification/hash verification, idempotent IAE placement/provisional-intake creation, content-safe receipt reconciliation, and quarantine on any mismatch; it shall not use cloud staging, live relay, or automatic peer discovery. |

## Domain and data contracts

### Local folder capability

```text
ApprovedFolderGrantLocal {
  id, deviceId, workspaceId, projectId?,
  encryptedCanonicalPath,
  access: READ|READ_WRITE_STAGED,
  allowedActionTypes[], includePatterns[], excludePatterns[],
  followSubdirectories, status: ACTIVE|PAUSED|REVOKED,
  createdBy, revision
}

ApprovedFolderCapabilityPublic {
  id, deviceId, workspaceId, accessClass,
  actionTypes[], patternDigest, volumeClass?,
  status, lastValidatedAt
}
```

Drive roots, Windows system directories, application installation directories, user-profile root, browser credential stores, recycle bin, and another active grant's ancestor/descendant are rejected by default. An Admin policy may further narrow, but not remotely broaden, the local grant.

### Preload capability API

```text
DesktopBridgeV1 {
  session.getSafeState()
  folders.chooseAndPropose(options)
  folders.listSafe()
  folders.pause(grantId, expectedRevision)
  jobs.list(filters)
  jobs.cancel(jobId, idempotencyKey)
  evidence.open(referenceId)
  conflicts.resolve(command)
  diagnostics.preview()
  diagnostics.export(approvedFields)
}
```

No generic `invoke(channel,args)`, `readFile(path)`, `exec(command)`, or unrestricted network primitive is exposed.

### JSON-RPC sidecar

```text
SidecarRequest {
  jsonrpc: "2.0", id, protocolVersion,
  attemptId, action: { type, version, handlerDigest },
  inputHandles[], outputHandle, parameters,
  deadline, locale
}

SidecarProgress {
  attemptId, sequence, phaseKey, completedUnits?, totalUnits?,
  safeMessageKey?, metricsSafe?
}

SidecarResult {
  attemptId, status, outputManifest,
  evidenceManifest, effectProposal?, diagnosticsSafe
}
```

Frames use a 4-byte length prefix with a 16 MiB maximum. Standard error is captured in a bounded redacted diagnostic stream and never interpreted as protocol.

### File-effect receipt

```text
FileEffectReceipt {
  id, attemptId, grantId, effectType,
  sourceHandle, sourceHash, destinationHandle?, destinationHash?,
  backupHandle?, appliedAt, undoExpiresAt?, state
}
```

## Permissions, security, and privacy

- Device keys and refresh credentials are stored through Windows Credential Manager/DPAPI and are never exposed to the renderer or sidecar.
- Main-process network destinations are allowlisted to configured DataBreeze API, object, update, and approved provider origins. The renderer cannot make arbitrary cross-origin requests.
- Sidecar startup uses an explicit executable path and argument array, `shell: false`, scrubbed environment, dedicated working directory, and inherited-handle allowlist. Secrets are delivered only through typed, short-lived handles when an action requires them.
- Sidecar network use is disabled by default at the action layer; a provider action must declare destinations, policy, and approval and receives only narrow credentials.
- Symlinks, junctions, reparse points, UNC paths, alternate data streams, and case-insensitive path aliases are resolved and checked against the grant before every access.
- Preview rendering disables macros, active content, external links, and formula execution.
- Local logs use IDs and message keys, rotate with bounded retention, and never include raw paths or source content.
- Auto-update trusts both a pinned release-manifest key and Windows code signature; key rotation requires a manifest signed by an already trusted key.

## Offline, failure, and recovery

- The local database uses transactional migrations with a pre-migration encrypted backup. Irreversible migrations occur only after the new build passes startup health checks.
- Watch events are journaled before processing. A crash replays unacknowledged events through content-hash/idempotency checks.
- If a source changes during processing, the attempt remains pinned to its captured version or stops according to recipe policy; a new version is created for the change.
- Sidecar crash or timeout records a failed attempt, preserves diagnostic IDs and safe partial artifacts in quarantine, and releases no unverified result.
- Network loss changes cloud jobs to a local pending state without marking them succeeded. Queue acknowledgement follows `DSO`.
- Low disk space pauses new staging before the reserved safety floor, completes only safe commits, and offers cache cleanup without deleting originals.
- Update failure restores the previous application and database backup; a blocked critical security update disables new job execution but preserves local read/export.
- If device credentials are lost, re-enrollment creates a new device. Old encrypted local data requires the original Windows user/key recovery and is not uploaded as a workaround.

## APIs, events, and extension points

### Control-plane interfaces

Desktop consumes all applicable foundation and typed feature APIs, including `IAM` identity, `IAE` artifact/evidence, `JRA` job/review/approval, `DSO` device/sync/offline-package, `DSM` definition/result, `INT` gateway/integration status, `NCO` collaboration, `BUA` entitlement, and `AUD` audit-fragment/history contracts. Device dispatch uses authenticated WebSocket and signed `JRA` envelopes; ordinary state uses REST and cursor sync.

### Local events

`desktop.folder_grant.created`, `desktop.folder_grant.paused`, `desktop.watch_event.staged`, `desktop.local_artifact.created`, `desktop.sidecar.started`, `desktop.sidecar.terminated`, `desktop.file_effect.proposed`, `desktop.file_effect.applied`, `desktop.file_effect.undone`, `desktop.update.staged`, and `desktop.update.rolled_back`.

Only content-safe subsets synchronize. Raw paths and source details remain local.

### Extension points

- Typed sidecar action registry pinned to the bundled engine manifest.
- Safe artifact-viewer registry with isolated renderer processes.
- File-effect handlers registered in main process with explicit grant, preview, approval, apply, verify, and undo methods.
- Update channel adapter restricted to signed stable, preview, or enterprise channels chosen by policy.
- No runtime plug-in may inject renderer JavaScript, preload APIs, executable handlers, or arbitrary action schemas.

## Performance and capacity budgets

- Cold launch to usable local shell: p95 under five seconds on the minimum supported device; warm launch under two seconds.
- Idle memory target under 300 MiB; ordinary active workflow under 600 MiB excluding explicitly displayed large preview; sidecar limits are action-specific and visible before run.
- Folder watcher handles 100 approved roots and bursts of 10,000 filesystem events without losing stable files; ingestion begins within five seconds after file stability.
- Hashing, copy, upload, and sidecar I/O stream with bounded application memory under 128 MiB per operation.
- Canonical local-job dispatch or provisional-execution start to sidecar start: p95 under two seconds when warm and under five seconds when cold.
- Renderer-main IPC: p95 under 50 ms for metadata operations; no source bytes are returned through general IPC.
- Local store supports 10 million metadata records, 100,000 queued operations, and 20 GiB staged cache by default with policy/user-configurable limits.
- Update check adds no more than 100 ms to interactive startup and runs full verification off the renderer thread.

## Observability and metrics

- Version/install/update success, rollback, startup/crash, renderer hang, sidecar crash/timeout, and local database migration health.
- Watcher event/stable-file/duplicate/error counts, intake latency, queue depth/age, sync lag, conflicts, and disk safety floor.
- Job duration/result/retry by typed action and engine version, envelope rejection reason, capability denial, and evidence coverage.
- File-effect proposal/apply/verify/undo and reconciliation backlog.
- Privacy canaries detect path-like strings, file names, source values, or forbidden local-mode content in outbound requests/telemetry.
- Device health reports coarse version, capability, queue, disk class, and last-success values; no source content or raw hardware inventory.

## Acceptance and testing

- Electron security tests assert process preferences, navigation/window-open restrictions, CSP, origin checks, IPC schemas, and absence of Node globals in renderer.
- Adversarial IPC tests send wrong frame, oversized payload, cross-workspace IDs, path traversal, reparse points, unknown channels, and malformed JSON.
- Temporary-folder integration tests cover partial writes, rename storms, locked files, duplicates, symlink/junction escape, long paths, case collisions, and watcher restart.
- Sidecar tests cover framing, schema mismatch, wrong attempt, corrupted output, timeout, cancellation, process-tree kill, resource limit, and scrubbed environment.
- Network capture proves `LOCAL` forbidden classes and raw paths never leave Desktop.
- Offline-package tests cover isolated staging, signature/recipient/workspace/purpose/policy/expiry/hash verification, duplicate import, crash recovery, server quarantine, temporary cleanup, and zero cloud/live-relay bytes.
- End-to-end tests cover enrollment, folder grant, local intake, provisional offline execution, idempotent canonical registration or rejection on reconnect, evidence, review, online approval, file-effect preview/apply/undo, revocation, and update rollback.
- Installer/update tests verify signature and hash failures, downgrade rejection, interrupted install, database migration rollback, and non-admin per-user installation.
- Accessibility tests run with keyboard, Narrator, high contrast, 125-200% scaling, and reduced motion in Vietnamese and English.

## Delivery and expansion

1. **Foundation release:** secure Electron shell, enrollment, approved folders, watch intake, encrypted local state, strict-Local offline-package import, Python JSON-RPC sidecar, typed jobs, local evidence, sync, offline queue, signed installer/update, and pause controls.
2. **Local automation release:** safe file-effect previews/undo, richer recipe controls, conflict administration, diagnostics export, and expanded engine actions.
3. **Expansion:** enterprise deployment channels, customer-managed local keys, approved database connectors, and more typed actions may extend the registries without adding general remote control, arbitrary code, or unscoped filesystem access.
