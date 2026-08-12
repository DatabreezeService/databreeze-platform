# Android Platform

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.1 |
| Requirement prefix | `AND` |
| Dependencies | `IAM`, `IAE`, `JRA`, `DSO`, `DSM`, `INT`, `NCO`, `BUA`, and `AUD` foundation specifications; Android consumes governed definitions/results, safe integration status, and audit contracts through published foundation or typed feature APIs |

## Purpose

Define the native Android application as DataBreeze's capture and review companion. Android excels at camera/document capture, voice notes, Android Share intake, offline field work, uncertain extraction review, evidence inspection, comments, alerts, approvals, and report viewing. It uses Kotlin and Jetpack Compose and deliberately does not duplicate full Web administration or Windows local processing.

## Scope and non-goals

### In scope

- Native Kotlin application with Jetpack Compose, Room, WorkManager, CameraX, scoped storage, Android Keystore, and Android share intents.
- Device enrollment, secure sessions, organization/workspace/project selection, and data-location awareness.
- Multi-page photo/document capture, file sharing, voice-note capture, optional barcode/QR metadata, and offline intake.
- Inbox triage, field correction, evidence review, comments, assignments, approval, notifications, reports, and sync.
- Background upload/sync within Android constraints and explicit user controls for cellular/battery usage.

### Non-goals

- Full organization, billing, security-policy, recipe-builder, API-key, or retention administration.
- Folder watching, arbitrary filesystem access, `MANAGE_EXTERNAL_STORAGE`, or background scraping.
- Running unrestricted Python or Desktop-scale spreadsheet/document processing.
- Finalizing approvals offline or bypassing server authorization/MFA.
- Uploading original bytes from a `LOCAL` workspace.

## Concepts and components

### Native architecture

- **Compose UI:** single-activity, navigation, adaptive layouts, Vietnamese-first resources, accessibility, and state hoisted into ViewModels.
- **Domain/data layer:** Kotlin coroutines and Flow; generated/versioned API models mapped into local domain records.
- **Room database:** account-scoped metadata, sync cursors, offline commands, capture manifests, review drafts, and safe cached views.
- **Capture service:** CameraX image capture and analysis, document edge/quality hints, page ordering, and original-byte preservation.
- **Share receiver:** exported intent entry point for `ACTION_SEND` and `ACTION_SEND_MULTIPLE` that validates MIME/size and copies permitted content into app-private staging.
- **Voice capture:** foreground user-visible recording with duration/size policy and app-private output.
- **WorkManager:** unique, constraint-aware finalize/upload/sync work using stable operation IDs.
- **Keystore security:** device signing key, token wrapping key, and local data-encryption key envelopes.
- **Notification/deep-link layer:** content-minimized push, authenticated routing, and current resource authorization.

### Capture bundle

A capture bundle groups one or more immutable source items and user-entered context before finalization. Enhancements such as crop, perspective correction, contrast, OCR, or compression are derived versions; captured originals remain unchanged until the user explicitly deletes a draft that has never finalized.

## Platform workflows

### Enroll and sign in

1. The app generates a hardware-backed Keystore signing key when available.
2. The user authenticates, completes organization-required MFA, and signs a one-time `IAM` enrollment challenge.
3. The server activates the Android device and returns scoped session/sync policy.
4. Tokens are encrypted with a Keystore key; biometric/PIN device authentication may unlock the local app but does not replace server MFA.

### Camera capture

1. The user chooses workspace/project and capture kind or uses a policy-approved default.
2. CameraX shows framing, blur, glare, and orientation hints without blocking capture when a user intentionally accepts a warning.
3. Each shutter action writes original bytes once to app-private storage, computes SHA-256, and records orientation and capture time.
4. The user reorders/removes draft pages, adds structured context, and confirms.
5. WorkManager finalizes locally, then applies data mode: `LOCAL` retains bytes on the device, `HYBRID` follows policy, and `CLOUD` uploads resumably.
6. Derived previews/OCR are versioned and synchronize only when permitted.

### Android Share intake

The share receiver validates the caller-provided `content://` URI, grants, actual signature, MIME, size, and workspace policy. It opens through `ContentResolver`, streams into a bounded app-private file, hashes while copying, releases transient access, and presents a confirmation screen. The app never trusts a filesystem path in an intent.

### Offline field work

Capture, form metadata, review drafts, comments, and assignments allowed by `DSO` queue locally with operation IDs. WorkManager syncs when connectivity/policy constraints permit. Conflicts remain explicit. If entitlement/authorization expires, existing local capture remains available for export or later reconciliation; the app does not discard it.

### Strict-Local handoff to Desktop

When a finalized Local capture needs a processor available only on Desktop, Android shows IAE `NEEDS_REVIEW` with reason `LOCAL_PROCESSOR_REQUIRED`. The user may explicitly select exact items and a registered destination Desktop, review count/size/classification/purpose/expiry, and create the signed encrypted DSO offline package. Android then invokes an OS-selected local share or removable-media flow; DataBreeze sends no package byte to cloud and runs no background peer relay. Exported-package cleanup is visible and best-effort because the app cannot erase copies outside its storage.

### Review and approval

The app downloads authorized structured fields and the minimum evidence representation permitted by data mode. Users correct fields with evidence, comment, or assign. Final approval requires connectivity, current eligibility, current subject hash, and step-up MFA when policy requires; a tap from a push notification only opens the protected screen.

### Notification and deep link

Push displays generic localized text such as “A review needs attention.” The payload carries an opaque, short-lived routing token. On open, the app unlocks/signs in as needed, exchanges the token, re-authorizes the resource, and loads details from the API.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| AND-001 | P0 | Android shall be implemented natively in Kotlin with Jetpack Compose and shall use Room, WorkManager, CameraX, scoped storage, Android Keystore, and Android share intents for their defined responsibilities. |
| AND-002 | P0 | Each organization enrollment shall use an IAM-defined DeviceIdentity with a distinct Keystore-backed signing key, device-bound short sessions, and rotating refresh credentials; DSO shall consume that identity only for capabilities, grants, operational health, synchronization, routing, and transfer. |
| AND-003 | P0 | Sensitive tokens and local encryption-key envelopes shall be non-exportable where Android permits and never stored in plaintext preferences, logs, backups, intents, or Compose state restoration. |
| AND-004 | P0 | Camera capture shall preserve each original byte stream immutably; crop, rotate, perspective correction, enhancement, OCR, redaction, and compression shall create derived versions. |
| AND-005 | P0 | `ACTION_SEND` and `ACTION_SEND_MULTIPLE` intake shall accept `content://` streams through scoped grants, validate actual content, copy to app-private staging, and never request or infer an unrestricted filesystem path. |
| AND-006 | P0 | The application shall not request `MANAGE_EXTERNAL_STORAGE`; exported components shall be minimal, permission-protected where possible, and validate every intent/deep link. |
| AND-007 | P0 | WorkManager jobs shall be unique and idempotent by capture/operation ID, resumable, constraint-aware, and safe across process death, reboot, duplicate scheduling, and lost acknowledgement. |
| AND-008 | P0 | `LOCAL` mode shall prevent original bytes, previews, OCR text, thumbnails, voice content, source snippets, and reconstructable chunks from uploading; UI shall state that local-only content may be unavailable on other devices. |
| AND-009 | P0 | Offline queues shall be encrypted, account/workspace-scoped, dependency-aware, and reconciled through `DSO` with explicit conflicts and no silent last-write-wins for protected fields. |
| AND-010 | P0 | Approval decisions shall require online server authorization, the current bound subject hash/policy, and MFA when required; notification actions and cached roles shall never finalize approval. |
| AND-011 | P0 | Push and lock-screen notifications shall comply with `NCO` and contain no file/client name, extracted value, amount, evidence, comment text, voice transcript, or other sensitive content. |
| AND-012 | P0 | Evidence review shall preserve the exact ArtifactVersion and coordinate, request the minimum authorized representation, and report `SOURCE_OFFLINE` or another explicit reason rather than substituting newer content; `LOCAL` Desktop evidence opens on that Desktop and is not streamed to Android without explicit derived publication. |
| AND-013 | P1 | Camera capture shall support multi-page ordering, retake/removal before finalization, orientation, flash, focus, blur/glare hints, and a user-confirmed quality override. |
| AND-014 | P1 | Voice capture shall be user-initiated and visibly foregrounded, enforce workspace duration/size policy, preserve the original recording, and version transcript/audio enhancements separately. |
| AND-015 | P1 | Users shall be able to select Wi-Fi-only, charging, battery, roaming, and cellular-size behavior within stricter organization policy; the app shall display queued bytes and reasons. |
| AND-016 | P1 | The app shall provide focused Inbox, capture, review, approval, comment, notification, report, sync, conflict, device, and account screens and shall direct full administration to Web. |
| AND-017 | P1 | Vietnamese shall be the default complete locale with English fallback, and all critical workflows shall support TalkBack, switch access, font scaling to 200%, high contrast, and non-color cues. |
| AND-018 | P1 | Cached source previews and staged captures shall have visible storage usage, policy retention, explicit cleanup, and safeguards preventing cleanup of unfinalized or unsynchronized user data without confirmation. |
| AND-019 | P1 | Account switch/sign-out shall stop work, close account databases, clear session material, and prevent one account or workspace from observing another's cached metadata. |
| AND-020 | P1 | The app shall use verified Android App Links for DataBreeze web origins, reject unrecognized schemes/hosts/actions, and re-authorize every resolved resource. |
| AND-021 | P1 | Background execution shall comply with Android limits, use foreground services only for user-visible capture or policy-compliant long transfer, and never run hidden continuous polling. |
| AND-022 | P1 | The app shall expose content-redacted diagnostics, sync status, app/protocol version, device revocation state, and safe recovery/export guidance. |
| AND-023 | P0 | Android shall implement the DSO user-mediated offline-package exporter for strict-Local handoff: explicit item/destination/purpose consent, source Device signature, authenticated encryption and destination key/passphrase envelope, exact manifest/hash/expiry, OS-selected user transfer, content-safe receipt state, and zero cloud upload, live relay, background peer discovery, or unregistered destination. |
| AND-024 | P0 | Android shall support user-initiated receipt/invoice/table capture, uncertain-field review, logical-dataset selection, responsive dashboard viewing, evidence drill-down, and permitted agent analysis without complex canvas authoring. |

## Domain and data contracts

### Local capture records

```text
CaptureBundleLocal {
  id, accountId, workspaceId, projectId?,
  kind, state: DRAFT|READY|FINALIZING|QUEUED|SYNCED|CONFLICT|FAILED,
  dataModeSnapshot, titleDraft?, structuredContextEncrypted,
  createdAt, revision
}

CaptureItemLocal {
  id, bundleId, ordinal,
  mediaType, appPrivateUri, byteLength, sha256,
  source: CAMERA|SHARE|DOCUMENT_PICKER|VOICE,
  orientation?, durationMs?, original: true,
  syncState, createdAt
}

ReviewDraftLocal {
  id, reviewId, workspaceId, baseRevision,
  fieldCorrectionsEncrypted, evidenceReferenceIds[],
  commentDraftEncrypted?, operationId, state
}
```

App-private URIs and encryption details never synchronize. Android backup excludes token, key, queue, capture, preview, and account database files by default.

### WorkManager input

```text
UniqueWorkCommand {
  operationId,
  accountId,
  workspaceId,
  workType: FINALIZE_CAPTURE|UPLOAD_ALLOWED_CONTENT|
    PULL_SYNC|PUSH_OPERATIONS|CLEAN_VERIFIED_CACHE,
  localRecordId,
  policyRevision
}
```

Work input contains identifiers only, not tokens, paths, comment bodies, source values, or serialized files. Workers reopen the account-scoped repository after unlock and check current policy.

### Share intake

```text
ShareCandidate {
  intakeId,
  sourceUriEphemeral,
  declaredMimeType?,
  detectedMediaType,
  displayLabelLocal?,
  byteLength?,
  sourcePackageClass?,
  grantFlags,
  validationState
}
```

`displayLabelLocal` is treated as untrusted and remains local until the user confirms artifact metadata. The receiver enforces configured item count and total-byte limits before copying.

### Mobile view contract

```text
MobileTaskCard {
  resourceType, resourceId, revision,
  workspaceId, projectId?,
  taskType: REVIEW|APPROVAL|ASSIGNMENT|ALERT,
  safeTitleKey, dueAt?, priority,
  evidenceAvailability: CLOUD|DEVICE_REQUIRED|UNAVAILABLE,
  permittedActions[]
}
```

`permittedActions` is presentation guidance only; submission always invokes authoritative `IAM`/`JRA`.

## Permissions, security, and privacy

- Android network security configuration permits only approved HTTPS origins, blocks cleartext, and uses platform certificate validation; sensitive endpoints may add pinned public-key backup sets with a tested rotation procedure.
- Keystore keys require an unlocked device and may require user authentication according to organization policy. Root/compromise signals may warn or block high-risk actions but never silently destroy data.
- Screens containing protected details set secure-window behavior when workspace policy requires and redact content from recent-app previews.
- Clipboard copy, Android Sharesheet export, screenshot, and external open are separate policy-controlled actions; denial is explicit.
- Room holds content-minimized metadata. Sensitive draft fields are application-layer encrypted with a Keystore-wrapped key; binary content lives in encrypted app-private files.
- Content URIs, file/display names, source text, voice data, evidence snippets, account identifiers, tokens, and push registration tokens are removed from logs and analytics.
- Push registration binds token to device/user and is revoked on sign-out/device revocation. Message payloads contain only provider message ID, urgency class, and opaque route token.
- Exported share/deep-link activities perform no work before authentication and validation; no broadcast receiver accepts unauthenticated mutation commands.

## Offline, failure, and recovery

- Every original capture is written and fsynced before its Room row becomes ready. Orphan-file and missing-file reconciliation runs at startup.
- Process death during copy/finalize/upload resumes from the local manifest and verified byte/chunk boundary. A changed source URI never replaces already copied bytes.
- WorkManager retry differentiates transient network/provider errors from authorization, policy, quota, corrupted content, and user-action errors; permanent failures stop retry loops and show a recovery path.
- If storage is low, capture warns before shutter/finalization and reserves a safety margin. Cleanup targets only verified synchronized cache or user-selected drafts and never unsynced originals automatically.
- Token expiry pauses workers until session refresh; revoked device/account makes queues read-only for safe export/sign-out and cannot push.
- Cursor expiry takes a new bounded snapshot while preserving offline operations for safe replay/conflict handling.
- App update migrations use Room transactions and migration tests. A migration failure leaves the prior database untouched and blocks mutation with export/support guidance.
- If a `LOCAL` evidence source is on Desktop and offline, Android shows `SOURCE_OFFLINE` and can request a content-safe device wake notification; it never changes workspace mode or uploads the source.

## APIs, events, and extension points

### Control-plane interfaces

Android consumes all applicable foundation and typed feature APIs, including `IAM` device/session, `IAE` intake/artifact/evidence, `JRA` job/review/approval, `DSO` sync/blob/offline-package, `DSM` definition/result, `INT` safe integration status, `NCO` notification/comment, `BUA` entitlement, and `AUD` offline-fragment/history endpoints. It also uses:

- `POST /v1/mobile/push-registrations`
- `DELETE /v1/mobile/push-registrations/{registrationId}`
- `POST /v1/mobile/route-tokens/{token}/resolve`
- `GET /v1/mobile/tasks`
- `GET /v1/mobile/reports/{reportId}/presentation`

All endpoints are device-bound, tenant-scoped, generated from OpenAPI, and runtime-validated.

### Local and domain events

Local events include `android.capture.started`, `android.capture.item_added`, `android.capture.finalized`, `android.share.staged`, `android.voice.started`, `android.voice.stopped`, `android.work.queued`, and `android.work.failed`.

Only finalized, policy-permitted domain events synchronize through foundation contracts. Analytics sees safe categorical/latency fields, not content.

### Extension points

- Capture analyzer interface for blur/glare/document edges and optional on-device OCR; outputs are advisory, versioned, and evidence-aware.
- Structured capture-form renderer driven by signed, schema-validated form definitions with supported field types only.
- Report presentation registry for safe chart/table/card models; arbitrary WebView HTML or JavaScript is not accepted.
- Intent parser registry for reviewed MIME/action combinations. New exported components require security review.

## Performance and capacity budgets

- Cold start to usable signed-out/cached shell: p95 under 2.5 seconds on the minimum supported mid-range device; warm start under one second.
- Camera preview ready: p95 under 1.5 seconds after permission and screen entry.
- Shutter to safely persisted original: p95 under one second for a 12 MP image; UI remains responsive and confirms persistence.
- Share receiver to confirmation screen: p95 under two seconds for metadata and immediate staged-copy progress.
- Room first-page query: p95 under 100 ms for 50 items; Compose maintains 60 Hz scrolling for ordinary lists.
- Base process memory target under 200 MiB; image processing uses bounded sampling and never decodes all pages at full resolution simultaneously.
- Support capture bundles of 500 pages or 2 GiB subject to device/workspace policy, with streaming hash/upload and visible storage budget.
- Background sync targets metadata propagation within five minutes when Android scheduling/network allow; correctness never relies on a real-time guarantee.
- Battery target for idle installed app is under 1% per 24 hours; no continuous background polling.

## Observability and metrics

- App start/crash/ANR, Compose screen latency, CameraX readiness/capture error, share-intent validation/copy outcome, voice outcome, and Room migration.
- Capture draft/finalize/sync funnel, queued bytes/age, WorkManager schedule/run/retry/outcome, conflict, and cursor age.
- Review/approval task open, evidence availability/resolution, correction completion, decision denial, comments, and notification open.
- Device enrollment/session refresh/revocation, Keystore error, secure-window policy, intent rejection, and unsupported MIME/size.
- Privacy canaries detect content URIs, file names, source/voice text, amounts, evidence, tokens, and original bytes in logs, analytics, or push.
- Metrics are segmented by app/protocol version, Android API band, locale, device performance class, and connection class without advertising identifiers.

## Acceptance and testing

- Unit tests cover ViewModels, mappers, validators, conflict behavior, policy/data-mode decisions, intent parsing, work uniqueness, and error mapping.
- Compose UI tests cover Vietnamese/English, TalkBack semantics, switch/keyboard navigation, 200% font, dark/high-contrast themes, loading/error/offline states, and rotation/process recreation.
- Room migration tests upgrade from every supported production schema and verify account/workspace isolation.
- WorkManager tests simulate duplicate scheduling, process death, reboot, network loss, token expiry, constraint changes, quota denial, revocation, and lost acknowledgement.
- Capture-profile tests cover receipt, invoice, and table profiles, uncertain-field review, logical-dataset selection before acceptance, dashboard drill-down, and Viewer agent denial.
- Instrumented tests cover CameraX capture, encrypted staging, App Links, secure windows, Keystore failure, share-intent staging, and offline-package export handoff.
- CameraX device tests cover rotation, low light, blur/glare warning, multi-page reorder/retake, storage pressure, permissions, and immutable original/derived output.
- Share tests use hostile/missing grants, spoofed MIME, oversized streams, slow providers, disappearing URIs, multiple items, filenames with control characters, and cross-profile content.
- Strict-Local package tests verify explicit consent, destination and purpose binding, signatures/encryption/hashes/expiry, OS-selected transfer, process death, cleanup disclosure, and network capture proving no package byte reaches DataBreeze endpoints or a live peer relay.
- Security tests inspect exported components, deep links, backup rules, logs, screenshots/recents policy, Keystore use, cleartext network, push payloads, and cross-account caches.
- End-to-end tests cover enroll, offline capture, Hybrid/Cloud upload, Local non-upload, reconnect, evidence, review correction, comment, online approval/MFA, notification deep link, conflict, sign-out, and revoked device.

## Delivery and expansion

1. **Foundation release:** native Kotlin/Compose shell, enrollment, Room/WorkManager sync, CameraX multi-page capture, Share intake, strict-Local offline-package export, Inbox, evidence review, comments, notifications, online approvals, reports, and data-mode behavior.
2. **Field-work release:** voice notes, schema-driven forms, barcode/QR context, richer offline review, storage controls, and capture-quality adapters.
3. **Expansion:** additional on-device ML, approved form widgets, managed enterprise distribution, and specialized capture hardware may extend native interfaces without broad storage access, arbitrary code, or full Web administration.
