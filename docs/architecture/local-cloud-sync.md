# Local, Cloud, and Offline Synchronization

**Status:** Product specification<br>
**Version:** 2.0

## 1. Purpose

Synchronization gives Web, Desktop, Android, and cloud workers a consistent view of authorized state without pretending that every original exists in the cloud. It is resumable, idempotent, policy-aware, and explicit about conflicts.

## 2. Data-Mode Policy

| Information | Local | Hybrid | Cloud |
|---|---|---|---|
| Original local artifact bytes | Never uploaded automatically | Per-artifact choice; local is allowed | Uploaded when intake is accepted |
| Artifact metadata and hash | Minimal authorized metadata | Synchronized | Synchronized |
| Structured extraction | Device-only unless the user explicitly publishes an approved derived result | Synchronized by policy | Synchronized |
| Evidence excerpt | Device only; never synchronized as a general excerpt | Policy and classification limited | Synchronized by policy |
| Evidence source coordinate | Synchronized when needed for results | Synchronized | Synchronized |
| Job, review, approval, and audit state | Synchronized | Synchronized | Synchronized |
| Local recipe secrets or folder paths | Device only | Device only | Device only |
| Dashboard folder manifest path/display name | Device only; opaque binding/status may synchronize | Device only; opaque binding/status synchronizes | Device only |
| Dashboard publication projection | Explicit resource/hash-bound confirmation | Metadata, selected governed rows/columns, aggregates, evidence derivatives, or originals only as declared by policy | Authorized projection/originals available by policy |
| Materialized dashboard result/snapshot | Explicit approved derived result only | Synchronized by dashboard publication policy | Synchronized by dashboard publication policy |
| Published report | Explicit export or approved sync | Synchronized by publication policy | Synchronized |

Data classification may make a policy stricter but never weaker. A workspace can prohibit Cloud for specified classes.

## 3. Device Registration

1. User authenticates through a system browser or approved native flow.
2. Device creates a hardware-backed or OS-protected key pair.
3. API registers public key, platform, application version, protocol versions, and user.
4. An authorized user grants workspace access and capabilities.
5. Device receives no durable workspace bearer secret; it signs challenges and obtains short-lived scoped tokens.

Revocation invalidates new tokens, active dispatch leases, and result upload. A lost device can be remotely revoked without deleting other devices.

## 4. Change Log and Cursor

Each workspace has a monotonic server sequence. An accepted logical mutation writes a `SyncChange` in the same transaction.

A sync cursor is an opaque server record bound to the workspace, device identity, principal, authorization epoch, effective project/resource scope, data-mode policy version, audience, and schema version. A client requests changes after its last acknowledged cursor, filtered by that bound scope. Changes are ordered, bounded, and replayable until retention permits compaction.

If membership, project access, classification access, device grants, data mode, or another scope input changes, the old cursor cannot continue:

- Expanded access receives a new authorized snapshot plus its change-log watermark, so older newly visible records are not skipped.
- A connected client with reduced access receives an immediate lock manifest and a new authorized snapshot. An offline client receives the lock before any accepted reconnect operation and no later than its cached authorization expiry. Managed cached records outside the new scope are made unreadable, then cryptographically erased or removed according to platform and retention policy.
- Revocation closes active streams and invalidates the cursor, content grants, dispatch leases, and cached authorization within the documented revocation budget.
- Unsynchronized user-created work is quarantined and exportable when policy permits; it is never silently discarded or uploaded to regain access.

The client:

1. Presents the bound cursor and current authorization epoch.
2. Downloads a page of changes or receives `RESNAPSHOT_REQUIRED` with a stable reason.
3. Validates envelope, scope digest, authorization epoch, and schema.
4. Applies all changes in a local transaction.
5. Stores the resulting cursor.
6. Acknowledges the cursor separately.

Replaying a page produces the same state.

## 5. Client Mutations

Offline-capable clients enqueue `ClientMutation` records with:

- client mutation ID
- device and workspace
- operation type and schema version
- base entity revision
- dependency mutation IDs
- local creation order
- payload and idempotency key

On reconnect, mutations upload in dependency order. Server authorization and policy are evaluated at acceptance time, not at offline creation time.

Outcomes are:

- `ACCEPTED` with server revision and sync sequence
- `CONFLICT` with safe current state and resolution choices
- `REJECTED` with reason such as revoked capability or invalid policy
- `RETRYABLE` for temporary failure

## 6. Conflict Rules

| Data | Rule |
|---|---|
| Memberships, roles, policies, entitlements | Server authoritative; offline edits are not supported. |
| Approvals | Server authoritative, append-only decisions with policy re-evaluation. |
| Artifact versions | Both versions are preserved; content is never last-write-wins. |
| Review corrections | Merge different fields; conflicting edits to the same field require review. |
| Form drafts | Device owns unsubmitted draft; submitted record uses revision checks. |
| Comments | Append-only creation; edit conflicts retain revisions. |
| Assignments and status | State-machine validation; stale transitions are rejected with current state. |
| Recipe drafts | User chooses current server version, local draft, or a copied branch. |
| Notification read state | Monotonic merge; “read” wins over “unread.” |

Device clocks do not decide conflict order. Server sequence and entity revisions do.

## 7. Content Transfer

Cloud-eligible bytes transfer through short-lived signed requests:

- Multipart or chunked upload for large files
- Per-part and final content hashes
- Resumable session with expiry
- Declared byte limit before upload
- Media-type verification and malware/content safety scan
- Server completion only after full hash verification

Downloads support ranges and resume. A local cache records hash, not just filename and modified time.

Local-mode evidence is rendered and viewed on its authorized source device. Web or Android may ask the control plane to queue a content-free "open this evidence" request, but no pixels, source snippet, preview, or original bytes are relayed through the cloud. If the device is offline, the interface shows the coordinate and `SOURCE_OFFLINE`; it does not imply the source was lost. Sharing a rendition requires an explicit derived-output publication governed by the selected data mode.

## 8. Desktop Synchronization

Desktop stores durable local queues in SQLite and serializes mutations per workspace where ordering matters. Folder scanning and local processing continue offline.

The Desktop interface distinguishes:

- saved locally
- processed locally
- waiting to synchronize
- synchronized
- conflict requiring attention
- blocked by policy or revoked access

Closing the UI does not corrupt an in-flight transfer. Background operation follows user and OS settings.

For a DDA folder binding, Desktop stores the canonical path and versioned local manifest. Cloud receives only the opaque binding/capability identity, manifest hash/version, content-safe health, selected DSM target binding, publication projection, and accepted fingerprints/counts permitted by policy. Compatible stable files may process locally; schema drift, period overlap, duplicate ambiguity, unsupported content, or changed mapping enters review/quarantine before any governed version or dashboard refresh.

Hybrid dashboard publication synchronizes only the declared projection: metadata, dashboard-specific aggregates, selected governed rows/columns, evidence derivatives, or explicitly authorized originals. Every projection is versioned and previewed with classification, fields, counts/bytes, destination, evidence consequences, and effective policy. A dashboard view cannot cause a broader source upload.

## 9. Android Synchronization

Room stores assignments, drafts, captures, review work, pending mutations, and cursors. WorkManager runs constrained work for network, battery, and size.

- Small metadata may sync on ordinary connectivity.
- Large media obeys workspace Wi-Fi/cellular policy and user override.
- Foreground status is used when Android requires it for user-visible long transfers.
- Camera content is copied into app-controlled storage before the temporary URI expires.
- A record is not “submitted” until its mutation is durable locally.

## 10. Schema Compatibility

Handshake includes application, API, sync, job, and schema versions. The server:

- serves compatible representations when possible
- withholds unsupported optional changes
- requires upgrade before an unsafe mutation
- never sends a job a client cannot declare support for

A minimum supported client policy includes a grace period except for critical security revocation.

## 11. Recovery

- Cursor corruption triggers a scoped snapshot rebuild, not manual database editing.
- Compacted logs provide a signed snapshot plus a new starting cursor.
- Authorization or data-mode scope changes force a scope-bound resnapshot and managed-cache reconciliation; a filtered cursor is never reused under a different scope.
- Partially uploaded cloud objects remain uncommitted and expire automatically.
- Reinstalled devices register as new devices; local-only originals are not claimed to be recoverable from cloud.
- Workspace export includes synchronized data and manifests for local-only artifacts, identifying the device that holds them.

## 12. Performance

- A metadata sync page is bounded by count and encoded size.
- Foreground delta sync targets visible status within five seconds on a healthy connection.
- Clients apply changes in batches to avoid per-row UI work.
- Transfer concurrency adapts to device and network and is capped per workspace.
- Backoff uses jitter and honors server retry guidance.

Sync lag, conflicts, rejected mutations, transferred bytes, resumptions, and cursor rebuilds are measured without including customer content.
