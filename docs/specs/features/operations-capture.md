# DataBreeze Operations Capture — Product Specification

**Status:** Product specification<br>
**Delivery position:** Post-V1 specialist extension; DDA V1 implements only its bounded receipt-capture contract.<br>
**Version:** 1.0<br>
**Requirement prefix:** OC<br>
**Dependencies:** Platform identity and workspace services; native Android device registration, secure storage, camera, microphone, barcode/QR, location, and offline database capabilities; artifact, evidence, form/version, typed-job, approval, audit, notification, and sync services; `IAE` Inbox, Artifacts, and Evidence foundation; `DSM` Datasets, Schemas, Rules, and Mappings foundation; `JRA` Jobs, Recipes, and Approvals foundation; `DSO` Devices, Synchronization, and Offline Operation foundation; Desktop local metadata store and Python processing sidecar; PostgreSQL; S3-compatible object storage; Redis Streams

## 1. Purpose and outcome

Operations Capture is the Android-first field data collection module for structured forms, photos and documents, voice notes, barcode/QR observations, signatures, and optional consented location. It works offline, validates records at the point of capture, preserves immutable source evidence, synchronizes idempotently, and routes uncertain or exceptional records to review.

Web provides form and workflow design, assignments, governance, monitoring, and reporting. Desktop supports scanner-folder intake, high-volume review, bulk reconciliation, and local processing. Android remains the primary capture surface and is implemented natively in Kotlin with Jetpack Compose so camera, offline storage, background sync, accessibility, and device lifecycle behavior are dependable.

A successful submission produces:

- a record bound to the exact published form version and assignment;
- immutable media and capture metadata with checksums;
- structured responses with validation, extraction, and correction lineage;
- sync and approval state that survives device and network failures; and
- traceable evidence from each derived value back to the response, photo, page, barcode, voice segment, or signature stroke artifact.

## 2. Users and jobs-to-be-done

| User | Jobs-to-be-done |
|---|---|
| Field operator | Complete assigned forms quickly, scan codes, take photos, dictate notes, collect an acknowledgement signature, and submit without connectivity. |
| Field supervisor | Assign work, monitor completion, review exceptions, approve records, and return incomplete submissions for correction. |
| Form designer | Build versioned forms and validation without code, test them on Android, and publish safely. |
| Data steward or analyst | Define identifiers and reference data, reconcile submissions against expected operations, and obtain trustworthy datasets. |
| Desktop operator | Import scanner batches, match media to records, resolve duplicates, and reconcile high-volume submissions locally. |
| Workspace admin | Manage devices, permissions, narrowing data-mode/retention constraints under `DSO`/`IAE`, offline limits, media policy, and security. |
| Auditor or viewer | Trace submitted values and changes to the original capture evidence and approval history. |

Primary user jobs are:

1. “Let me record the work now even when the network is unavailable.”
2. “Prevent obvious mistakes before I leave the site.”
3. “Capture the document, code, voice, or acknowledgement that proves what happened.”
4. “Synchronize once and never create duplicate records.”
5. “Give supervisors and back-office staff a clear exception and reconciliation queue.”

Vietnamese is the default UI and form-authoring language. Form versions may include approved translations, but every response retains the stable field identifier independent of label language.

## 3. Scope and explicit non-goals

### In scope

- Web form designer with sections, typed fields, repeatable groups, requiredness, declarative conditions, validation, reference data, calculated display fields, and workflow settings.
- Android assignment download, offline drafts, autosave, camera/document capture, file attachment, barcode/QR scanning, voice recording, confirmed transcription, drawn signature capture, and optional consented location.
- Typed identifiers, timestamps, numbers, currency, choices, text, yes/no, dates, times, durations, and attachment fields.
- Draft, submitted, synchronized, in-review, returned, approved, rejected, superseded, and archived lifecycle states.
- On-device deterministic validation and optional on-device OCR/barcode/transcription adapters.
- Cloud or Desktop processing according to data mode and device capability.
- Web/Android review and approval; Desktop bulk review, scanner-folder intake, duplicate matching, and reconciliation against expected rosters or control totals.
- Immutable original media, evidence traceability, corrections as versions, audit, export, and downstream typed module intake.
- Local, Hybrid, and Cloud storage behavior with policy-controlled media synchronization.

### Explicit non-goals

- Covert surveillance, continuous background audio/video/location capture, or capture without an active user-visible session.
- Biometric identity verification, facial recognition, or treating a drawn signature as proof of legal identity.
- Guaranteeing that a captured signature satisfies electronic-signature law; it is an acknowledgement artifact with disclosed metadata unless a separately reviewed signature service is used.
- Arbitrary executable code, JavaScript, SQL, macros, or custom Android code inside forms.
- Unrestricted device control, remote camera/microphone activation, or access to unrelated device files.
- Private-site scraping, restricted marketplace integration, or hidden data collection.
- Silent editing of a submitted record or original media.
- Processing payment-card secrets, authentication credentials, or other prohibited field classes.
- Replacing a full field-service, ERP, case-management, or regulated electronic-signature system.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Design and version forms; define inline form options and bind reusable `DSM` reference data; configure assignments, validation, `JRA` review/approval policy references, retention constraints, and sync policy; publish forms; monitor capture and device status; review records/evidence; manage exceptions; report and export; administer permissions and data-mode constraints. |
| Desktop | Import files from explicitly approved scanner folders; run large OCR/extraction locally; bulk review and reconcile submissions; match attachments to expected records; resolve duplicate candidates; generate local exports/reports; operate offline and synchronize policy-approved outputs. |
| Android | Register the device; download authorized forms, assignments, and reference data; create encrypted offline drafts; capture camera/document, barcode/QR, voice, signature, and consented location evidence; validate, submit, sync, review returned records, invoke the `JRA` approval facade when authorized, and display clear storage/sync status. |

The control plane owns published form versions, assignment policy, durable synchronized submission and feature-specific record state, approval subject bindings/projections, and audit references. `JRA` owns canonical `ReviewTask`, `ApprovalPolicy`, `ApprovalRequest`, and `ApprovalDecision` records. An Android device is authoritative for an unsynchronized local draft and its capture journal. Once a submission version is acknowledged, the control plane is authoritative for the capture version; review and approval actions use `JRA` facades, and edits create a correction version rather than overwriting the acknowledged submission.

## 5. Primary workflows

### 5.1 Design, test, and publish a form

1. A designer creates a form draft with stable field identifiers and Vietnamese labels.
2. The designer adds sections, repeatable groups, typed fields, constraints, conditional visibility, reference data, evidence requirements, and review policy.
3. DataBreeze validates the declarative graph for cycles, inaccessible required fields, incompatible calculations, excessive size, prohibited data, and offline availability.
4. A preview renders representative phone sizes and an installable test assignment is exercised on Android.
5. An authorized publisher creates an immutable form version with a compatibility classification.

### 5.2 Assign and prepare offline work

1. A supervisor assigns a form version and optional roster, location, time window, and record keys to users or teams.
2. Android downloads the assignment, form, required reference-data versions, display assets, and policy through resumable sync.
3. The app verifies signatures and checksums, estimates required storage, and marks the assignment `READY_OFFLINE`.
4. If required content is missing, the app identifies exactly what remains unavailable and does not claim offline readiness.

### 5.3 Capture and submit offline

1. The operator opens an assignment and starts a capture session.
2. Every response autosaves to encrypted local storage with a device-local revision.
3. Media is captured only after Android permission and an in-app user action; the UI shows recording/camera state.
4. On-device validation checks required fields, types, ranges, reference values, identifier formats, and cross-field rules.
5. Submission freezes a local immutable version, creates checksums and an idempotency key, and enters the sync queue even without connectivity.

### 5.4 Extract, review, and approve

1. A typed processing job extracts candidate text/fields from a document or voice attachment when policy permits.
2. Extracted candidates show confidence and exact page/region/time-segment evidence and never overwrite the operator’s submitted response.
3. Low-confidence or conflicting values enter a review queue.
4. A reviewer acts through the canonical `JRA` review facade to accept a candidate into a correction draft, enter a corrected value, return the record, or reject it with a reason; any policy-required approval uses a separate `JRA` `ApprovalRequest` bound to the exact submission subject.
5. Each accepted correction creates a new version linked to the original submission and evidence.

### 5.5 Desktop bulk intake and reconciliation

1. An operator grants Desktop access to a scanner input folder and selects a published scanner-intake profile.
2. Desktop stabilizes, hashes, and imports each file as an immutable artifact, then proposes matches to assignments/submissions using deterministic keys first.
3. Ambiguous matches and duplicates enter bulk review with side-by-side evidence.
4. Reconciliation accounts for expected, received, missing, duplicate, rejected, and waived records plus configured control totals.
5. Matched artifacts and reconciliation results backed by any required valid `JRA` approval synchronize according to the effective `DSO` policy.

## 6. Functional requirements

Priorities are `P0` (required for first production release), `P1` (required for complete module operation), and `P2` (planned enhancement).

| ID | Priority | Requirement |
|---|---|---|
| OC-001 | P0 | Web shall create form definitions with stable machine field identifiers independent of labels, order, and translation. |
| OC-002 | P0 | Published form versions shall be immutable; edits create a draft child version with a machine-readable compatibility diff. |
| OC-003 | P0 | The field catalog shall include text, long text, integer, decimal, currency, date, time, date-time, duration, yes/no, single/multiple choice, identifier, barcode/QR, photo/document, file, voice, signature, and consented location. |
| OC-004 | P0 | Form logic shall use allowlisted declarative visibility, requiredness, default, validation, and display-calculation expressions and shall reject arbitrary code. |
| OC-005 | P0 | Form validation shall reject cycles, hidden required fields without satisfiable paths, incompatible types, unpinned reference data, prohibited field classes, and resource limits. |
| OC-006 | P0 | Designers shall preview Web and representative Android layouts and publish a test assignment before production publication. |
| OC-007 | P0 | Assignments shall bind form version, assignee/team, optional roster and record keys, availability window, reference versions, `dataModeConstraint`, `effectiveDataModePolicyRef`, and review policy; the module constraint shall never broaden workspace `DSO` policy. |
| OC-008 | P0 | Android shall verify form, assignment, and reference-data checksums before declaring an assignment ready offline. |
| OC-009 | P0 | Android shall store drafts, responses, media keys, sync journal, and cached definitions in encrypted app-private storage. |
| OC-010 | P0 | Every field change shall autosave locally with record ID, field ID, device revision, actor, device time, and monotonic capture sequence. |
| OC-011 | P0 | Camera, microphone, file, and location access shall require Android permission plus a visible in-app user action for each capture session. |
| OC-012 | P0 | Voice and video/audio capture shall show an unambiguous active-state indicator and stop control and shall obey configurable duration and size limits. |
| OC-013 | P0 | Barcode/QR capture shall retain decoded value, symbology, scan time, validation state, and optional image evidence when policy permits. |
| OC-014 | P0 | A drawn signature shall retain the immutable stroke/render artifact, signer-entered label, acknowledgement text/version, device timestamp, and evidence metadata without claiming identity verification. |
| OC-015 | P0 | Optional location capture shall disclose purpose, capture only on explicit action, record accuracy and provider state, and permit policy-defined unavailable handling. |
| OC-016 | P0 | On-device validation shall support requiredness, type, length, range, pattern, reference membership, uniqueness within the draft, and cross-field rules using the published definition. |
| OC-017 | P0 | Submission shall be blocked by mandatory validation failures and shall summarize warnings and missing evidence before confirmation. |
| OC-018 | P0 | Submitting shall freeze an immutable local submission version and generate a stable idempotency key before network transfer. |
| OC-019 | P0 | Sync retries shall create exactly one server submission version for one device submission idempotency key. |
| OC-020 | P0 | Media upload shall be resumable, chunk/checksum verified, and associated only after complete object verification. |
| OC-021 | P0 | Server acknowledgement shall include durable submission/version IDs and per-attachment status before Android marks local content safely synchronized. |
| OC-022 | P0 | Original photos, documents, voice, barcode image evidence, and signature artifacts shall be immutable; processing creates derived artifacts and candidate values. |
| OC-023 | P0 | OCR or transcription candidates shall retain adapter/version, language, confidence, and page/region or time-segment evidence. |
| OC-024 | P0 | Extracted candidates shall never silently overwrite operator-entered or submitted values; acceptance creates a correction/version event. |
| OC-025 | P0 | Review policy shall route validation warnings, low-confidence extraction, duplicates, reconciliation exceptions, and configured sensitive submissions to authorized queues. |
| OC-026 | P0 | Reviewers shall use an authorized facade over a canonical `JRA` `ReviewTask` to mark a capture review detail accepted, rejected, or returned, add comments, or create a correction draft with stable reason codes and field-level evidence; the module shall store `jraReviewTaskId` and a projection only, and review acceptance shall not satisfy or bypass a separate `JRA` approval. |
| OC-027 | P0 | Changes to an acknowledged submission shall create a new submission version linked to its parent and shall retain a field-level diff. |
| OC-028 | P0 | Form-version breaking changes shall not alter existing drafts; a user shall finish on the pinned version or explicitly migrate through a validated preview. |
| OC-029 | P0 | Desktop scanner intake shall operate only on explicitly granted folders, wait for stable files, fingerprint inputs, and avoid duplicate imports. |
| OC-030 | P0 | Desktop matching shall prioritize deterministic assignment, record, cover-sheet, barcode, and filename keys before confidence-based suggestions. |
| OC-031 | P0 | Ambiguous attachment matches and duplicate submissions shall require review and preserve every candidate and decision. |
| OC-032 | P0 | Reconciliation shall report expected, received, approved, missing, duplicate, rejected, returned, and waived records with no unexplained submissions. |
| OC-033 | P0 | All form publication, assignment, capture, submission, sync, extraction, review, correction, approval-facade, export, and evidence access actions shall be audited by their owning services. |
| OC-034 | P1 | Supervisors shall configure bounded bulk assignment, reassignment, return, approval-facade, and export actions with preview and permission checks; every approval item shall retain requested action, exact subject type/ID/version/hash, and `jraApprovalRequestId`. |
| OC-035 | P1 | Forms shall support repeatable groups with stable item IDs and configurable minimum/maximum occurrences. |
| OC-036 | P1 | Forms shall support offline reference-data search and dependent choice lists with pinned versions and explicit stale behavior. |
| OC-037 | P1 | Submissions backed by any required valid `JRA` `ApprovalDecision` for the exact requested action and subject type/ID/version/hash shall be exportable as UTF-8 CSV/JSON plus media/evidence manifest and available to other DataBreeze modules through typed intake. |
| OC-038 | P1 | Workspace admins shall configure per-form media quality, `retentionConstraint`, offline capacity, sync network, battery, roaming, and local-cache cleanup; `effectiveRetentionPolicyRef` and authoritative deletion shall remain owned by `IAE`. |
| OC-039 | P1 | Android shall display storage consumption, unsynchronized item count, oldest pending age, last successful sync, and actionable failure reasons. |
| OC-040 | P1 | Local Desktop and cloud processing of the same media fixture shall produce equivalent deterministic parsing and evidence coordinates within declared adapter tolerances. |
| OC-041 | P2 | The system shall permit a form package to be imported/exported between workspaces only as an unsigned draft with assignments, responses, secrets, and restricted reference values removed. |

## 7. Data model extensions

All synchronized entities include `id`, `workspace_id`, timestamps, actor attribution where applicable, and optimistic-concurrency versions. Device-local entities also include encrypted storage keys and monotonic journal sequence.

| Entity | Purpose and key fields |
|---|---|
| `OperationForm` / `OperationFormVersion` | Stable form identity and immutable versions containing sections, fields, rules, workflow, translations, compatibility, checksum. |
| `FormSection` | Stable key, localized labels/help, order, visibility, repeat behavior, evidence guidance. |
| `FormField` | Stable key, type, localized labels/help, sensitivity, constraints, evidence requirements, default, reference binding. |
| `FormRule` | Immutable form-version UI/field behavior only: conditional visibility, requiredness, presentation, local draft validation, and field interaction. Any reusable business, data-quality, mapping, or cross-module rule must be promoted to and published by `DSM`, then referenced by immutable `RuleDefinitionVersion` ID. |
| `FormReferenceSet` / `FormReferenceSetVersion` | Immutable inline/form-private UI options only. Any reusable roster, identifier, lookup, or reference data binds an immutable `DSM` `DatasetVersion` and is compiled into the offline form bundle; OC does not publish a parallel canonical dataset. |
| `CaptureAssignment` | Form version, assignee/team, roster, record keys, time/location scope, exact reference versions, `dataModeConstraint`, `effectiveDataModePolicyRef`, review and sync policy, and feature state. |
| `CaptureSession` | Device-local active session, assignment, operator, start/end, form version, permission observations, monotonic sequence. |
| `OperationRecord` | Stable business record identity, assignment, current version, workflow state, owner, reconciliation key. |
| `SubmissionVersion` | Immutable response version, parent, form/assignment versions, device/actor, client/server times, checksum, state, sync receipt. |
| `FieldResponse` | Submission version, stable field and repeat-item IDs, typed value or artifact reference, source (`OPERATOR`, `EXTRACTED_ACCEPTED`, `CORRECTED`), validation. |
| `CaptureAttachment` | Original `IAE` artifact version, capture type, MIME type, size, checksum, local/cloud projection, evidence metadata, `retentionConstraint`, and `effectiveRetentionPolicyRef`. |
| `BarcodeObservation` | Decoded value, symbology, validation, scan time, image-evidence reference, device capability. |
| `VoiceObservation` | Original audio artifact, duration, language hint, consent/indicator metadata, transcription state. |
| `SignatureObservation` | Stroke/render artifact, acknowledgement text/version, signer-entered label, timestamps, and explicit non-verification classification. |
| `LocationObservation` | Consented coordinates, accuracy, provider, capture time, purpose, permission state, and policy result. |
| `ExtractionCandidate` | Attachment, target field, proposed value, confidence, adapter/version, evidence region/segment, review decision. |
| `CaptureReviewDetail` | Immutable typed validation, extraction, duplicate, evidence, or sensitive-action detail with evidence, stable reason data, and `jraReviewTaskId`; `JRA` owns assignee, workflow state, comments, and disposition. |
| `CaptureSyncBatch` / `CaptureSyncItem` | Device, sequence range, idempotency keys, upload parts, acknowledgements, retries, and errors. |
| `CaptureProcessingRun` | Submission/attachment inputs, `jraJobId`, pinned `resultManifestId`, effective execution policy/location, business-state projection, completeness, and failure summary; no independent dispatch/retry/terminal Job state. |
| `ScannerIntakeProfile` | Granted folder aliases, supported files, key-extraction rules, form/assignment binding, limits, and review policy. |
| `CaptureReconciliation` | Expected population/version, grouping and totals, category bridge, unmatched keys, tolerance, feature-specific state, and approval-binding reference. |
| `CaptureApprovalBinding` | Requested action, exact subject type/ID/version/hash, `jraApprovalRequestId`, projected canonical status, and last verified `JRA` revision; no actor or decision payload. |

Structured responses are indexed in PostgreSQL according to field policy. Large media and derived artifacts use encrypted S3-compatible objects or device-local encrypted storage. Local-mode submissions retain detailed response and media state on Android/Desktop; the control plane stores policy-approved assignment references, capture status, hash, reconciliation, approval bindings, and audit references. It does not copy `JRA` review or approval decisions.

## 8. Processing, evidence, and confidence rules

### Capture and processing

- Android records both device wall-clock time and a monotonic capture sequence. Server receipt time is always retained; device time is never silently treated as trusted server time.
- Form logic executes from the pinned published definition using typed deterministic functions. Unknown function or incompatible cached versions fail closed.
- Submission checksum covers form version, assignment, ordered typed responses, attachment checksums, repeat-item IDs, and relevant capture metadata.
- Original capture media is immutable. Rotation, cropping, enhancement, compression, redaction, OCR, transcription, and thumbnailing create named derivatives with lineage.
- Server and Desktop processing consume signed typed jobs and bounded artifacts; neither may remotely activate an Android sensor.
- Deterministic validation is authoritative. Processing adapter failures create explicit review/error states without erasing the submission.

### Evidence

- Operator responses link to submission version, field ID, repeat-item ID, capture sequence, and relevant artifact or observation.
- Photo/document evidence retains original dimensions, EXIF-preservation policy, page boundaries, and region coordinates for extracted values.
- Voice evidence maps transcript tokens/candidates to time ranges in the immutable audio artifact.
- Barcode evidence retains decoded payload and symbology; a deterministic validation result is separate from decode confidence.
- Signature evidence proves only that a stroke/render artifact and acknowledgement metadata were captured in the session. It does not prove legal identity.
- Corrections preserve original and replacement values, reason, reviewer, source evidence, and parent submission.
- Reconciliation evidence contains expected roster/version, stable keys, category counts, unmatched/duplicate sets, control totals, rounding, tolerance, and decisions.

### Confidence and review

- Requiredness, type, range, reference, checksum, barcode format, and reconciliation rules return deterministic states.
- OCR and transcription store calibrated field/token confidence plus adapter/model version. Document-level confidence cannot substitute for field-level confidence.
- Default review thresholds are `0.90` for identifiers and control-total fields and `0.80` for non-critical descriptive fields; workspace policy may require stricter thresholds or manual confirmation for every candidate.
- A barcode checksum or reference-list failure cannot be overridden by high decode confidence.
- An extraction candidate conflicting with an operator response is always surfaced as a conflict and never auto-replaces the response.
- AI may classify attachments, summarize voice notes, or suggest field mappings through a provider-neutral adapter. Its output remains a candidate and cannot submit, approve, sign, or close a record.
- Missing evidence, unavailable adapters, or uncalibrated confidence yields `NEEDS_REVIEW`, not a guessed value.

## 9. Permissions, privacy, and data modes

Module permissions are:

- `capture.form.edit`
- `capture.form.publish`
- `capture.assignment.manage`
- `capture.record.create`
- `capture.record.submit`
- `capture.record.read`
- `capture.evidence.read`
- `capture.review.facade`
- `capture.record.approval.facade`
- `capture.record.correct`
- `capture.reconcile`
- `capture.export`
- `capture.device.manage`
- `capture.audit.read`

Permissions apply at workspace, form, assignment/team, record, field, evidence, and action level. A supervisor can be limited to their location/team. Evidence visibility is independent of response visibility. Sensitive media, location, voice, and signature access is logged and may require a stated purpose.

Review and approval capabilities authorize module facades only. `JRA` enforces canonical review assignment/disposition and approval eligibility, separation of duties, MFA, expiry, requested action, and subject-hash invalidation.

Data-mode behavior:

- **Local:** Content-safe forms/assignments and `CONTROL_METADATA` may synchronize, but captured responses and media remain on the source Android device or in an explicit local export/import package. A value-bearing summary synchronizes only as a separately confirmed `APPROVED_DERIVED_RESULT` under `DSO`; automatic peer transfer is not implied.
- **Hybrid (default):** Structured responses and selected evidence synchronize; original high-resolution media may remain on Android/Desktop while thumbnails, extracted values, and approved excerpts synchronize according to form policy.
- **Cloud:** Authorized responses, originals, derivatives, evidence, and processing may synchronize to the workspace cloud boundary.

The workspace `DSO` policy is the maximum authority. Form, assignment, or record `dataModeConstraint` and `effectiveDataModePolicyRef` values may only narrow placement, processing, synchronization, or export; every job, sync batch, media transfer, offline package, and downstream route resolves the intersection again at execution time.

`IAE` is canonical for retention and deletion of synchronized response, media, evidence, derivative, and export bytes. Capture resources store only `retentionConstraint` and `effectiveRetentionPolicyRef`, which may narrow or extend but never shorten the workspace minimum. Deletion eligibility intersects workspace minimum, resource constraint, evidence/report lineage, legal hold, audit class, and recovery window; feature code requests deletion through `IAE`. Checksum-confirmed local cache cleanup is device hygiene, not authoritative retention.

Each form discloses effective data-mode and media behavior before first use and when policy changes. Android permissions are requested just in time. Location, microphone, camera, or files denied by the user follow an explicit field policy; the module never attempts hidden capture.

## 10. Offline, sync, failure, and recovery

- Android downloads versioned form/assignment bundles through resumable, checksum-verified sync and keeps the last valid bundle if an update fails.
- Draft autosave commits each field mutation and attachment state to an encrypted journal before the UI confirms it.
- App or device restart restores the latest durable draft, active media recovery state, pending submission, and sync offsets.
- Submission uses a stable device submission ID and idempotency key. Server retry, client retry, and replay cannot create duplicate submission versions.
- Attachments upload in resumable chunks. The server validates total size and checksum before association; orphan chunks expire safely.
- Android does not mark a submission fully synchronized until structured responses and every required attachment receive durable acknowledgements.
- When storage approaches a configured reserve, new high-volume capture is blocked with a clear cleanup/sync path; unsynchronized content is never automatically deleted.
- Background sync obeys configured Wi-Fi/mobile/roaming, battery, charging, and quiet-hour policy and Android operating-system constraints. Manual sync remains available.
- A revoked Device identity may preserve encrypted unsynchronized records for authorized recovery but is never reactivated and cannot download or sync. The installation enrolls a new Device identity; a documented recovery/import flow validates and reconciles preserved records under it, or permits a policy-governed local export.
- Form updates never reinterpret an existing draft silently. Compatible updates may be offered through a preview; breaking updates require an explicit new draft or mapped migration.
- Concurrent corrections create sibling versions and a review conflict; response fields are not merged by last-write-wins.
- The local app may retain non-authoritative approval notes or a draft reason, but sync never creates an `ApprovalDecision`; an eligible actor must reopen the exact current submission/reconciliation subject online, freshly confirm approve/reject, and satisfy current MFA.
- If device time is implausible or changes materially, records retain all timestamps and receive `DEVICE_TIME_UNRELIABLE` for review.
- Media processing failures do not block preservation of the original capture. Users may retry processing, provide manual values, or route to review according to policy.
- Scanner watcher overflow or Desktop restart triggers a bounded reconciliation scan using content hashes and stable intake keys.
- Export and reconciliation publication are atomic. A partial package or partial approved reconciliation is never exposed as complete.

## 11. APIs, events, and extension points

### REST resources

- `/v1/workspaces/{workspaceId}/operation-forms`
- `/v1/operation-forms/{formId}/versions`
- `/v1/capture-assignments`
- `/v1/capture-reference-sets`
- `/v1/capture-sync-batches`
- `/v1/operation-records`
- `/v1/operation-records/{recordId}/submissions`
- `/v1/submissions/{submissionId}/attachments`
- `/v1/capture-review-details`
- `/v1/capture-review-facades/{jraReviewTaskId}`
- `/v1/scanner-intake-profiles`
- `/v1/capture-reconciliations`
- `/v1/capture-exports`

Sync APIs use device sequence, item idempotency key, checksums, and per-item acknowledgements. Mutations use resource versions. Media transfer uses short-lived scoped multipart grants. Record and evidence responses apply field projection, masking, and cursor pagination.

### Typed jobs

- `VALIDATE_OPERATION_FORM`
- `PREPARE_CAPTURE_ASSIGNMENT_BUNDLE`
- `PROCESS_CAPTURE_DOCUMENT`
- `TRANSCRIBE_CAPTURE_AUDIO`
- `VALIDATE_CAPTURE_SUBMISSION`
- `MATCH_SCANNER_ARTIFACT`
- `DETECT_CAPTURE_DUPLICATES`
- `RECONCILE_CAPTURE_BATCH`
- `GENERATE_CAPTURE_EXPORT`
- `ROUTE_APPROVED_CAPTURE_RECORDS`

Jobs declare immutable input IDs/checksums, form and assignment versions, processor capability, effective `DSO` policy, resource bounds, idempotency key, and result schema. `JRA` alone owns dispatch, progress, cancellation, retry, and terminal Job state. Each `CaptureProcessingRun` stores `jraJobId` and the accepted pinned `resultManifestId`; its business state updates idempotently from committed `JRA` outbox/results. Mapping is explicit: JRA `QUEUED`/`RUNNING` project to capture `PENDING_PROCESSING`/`PROCESSING`, `SUCCEEDED` plus accepted manifest projects to `CANDIDATES_READY`, and `FAILED`/`CANCELLED` project to corresponding execution failure/cancellation; validation or review policy may keep successful processing `NEEDS_REVIEW`. Jobs cannot contain arbitrary code, sensor commands, unrestricted local paths, or credentials.

Review and approval routes are authorized facades over canonical `JRA` records. The module stores only `jraReviewTaskId` or a `CaptureApprovalBinding` containing requested action, exact subject type/ID/version/hash, `jraApprovalRequestId`, and a read-only canonical projection.

### Domain events

- `capture.form.published`
- `capture.assignment.created`
- `capture.assignment.bundle_ready`
- `capture.submission.created`
- `capture.submission.synchronized`
- `capture.submission.review_requested`
- `capture.submission.returned`
- `capture.submission.approval_binding.updated`
- `capture.submission.superseded`
- `capture.device.sync_stalled`
- `capture.reconciliation.failed`
- `capture.reconciliation.approval_binding.updated`
- `capture.export.created`

Events are versioned, redacted, and delivered at least once. Consumers deduplicate by event ID and fetch authorized data from APIs.

### Extension points

- Form field types declare value schema, Android/Web/Desktop renderer capabilities, offline behavior, validation, evidence, accessibility, and migration compatibility.
- Form-local validators and calculations declare typed inputs/outputs, version, locale behavior, cost bounds, and fixtures and are limited to immutable form-version UI/field behavior. Reusable rules are promoted to `DSM` and referenced by published `RuleDefinitionVersion`.
- OCR, barcode, transcription, and classification adapters declare locality, language/media support, confidence calibration, evidence coordinates, requested retention constraints, and resource limits; `IAE` remains authoritative for stored bytes.
- Scanner-intake key extractors produce bounded typed candidate keys, never arbitrary file-system actions.
- Downstream DataBreeze modules consume a versioned approved-record intake contract with idempotency.
- Export writers consume permission-projected submission versions and evidence manifests.

Extensions that require unrestricted device control, hidden sensor access, arbitrary executable form logic, or unverifiable evidence are prohibited.

## 12. Performance and capacity budgets

Defaults are workspace-configurable within device storage, security, and licensed-capacity guardrails. Effective limits are included in each form/assignment bundle.

| Budget | Default target |
|---|---|
| Form complexity | 500 fields, 50 sections, 20 repeatable groups, 1,000 declarative rules, and 100 reference bindings per form version. |
| Reference data | 100,000 compact rows or 50 MB compressed per assignment bundle; larger references require partitioned offline search. |
| Offline capacity | 10,000 structured unsynchronized submissions or 30 days of assigned work, subject to a mandatory 2 GB device free-space reserve. |
| Media defaults | 25 MB per photo/document image, 500 MB per file, 60 minutes per voice item, and 2 GB total media per submission; stricter form limits are encouraged. |
| Draft save | Field changes durably autosave within 200 ms at p95 on reference mid-range Android hardware. |
| Form interaction | Screen transition and conditional-rule update complete within 100 ms at p95 for a 250-field form, excluding media processing. |
| Barcode response | Decode a supported clear code within 1 second at p95 on reference hardware under test lighting. |
| Offline startup | Open a cached assignment and resumable draft within 2 seconds at p95. |
| Sync metadata | Sustain 20 structured submissions per second per device on a stable broadband connection, excluding media bytes. |
| Media upload | Saturate up to the configured network cap using resumable chunks while limiting default concurrency to three attachments. |
| Server acknowledgement | Durable structured-submission acknowledgement within 2 seconds at p95 after a complete valid request, excluding attachment upload. |
| Review query | First page and aggregate counts within 2 seconds at p95 for 10 million indexed submissions. |
| Scanner intake | Fingerprint and enqueue 10,000 stable files within 10 minutes on reference Desktop hardware, excluding OCR. |
| Progress freshness | Connected Web/Android clients receive durable workflow changes no more than 5 seconds late at p95. |
| Control-plane availability | 99.9% monthly for form, assignment, sync, review, and submission-state APIs, excluding declared maintenance. |

Media is never loaded fully into Web or Android memory when streaming APIs are available. Thumbnails and previews are bounded derivatives. Exceeding a budget creates a clear capacity or policy state; validation, encryption, and evidence are not skipped.

## 13. Observability and product success metrics

### Operational observability

- Structured logs include correlation ID, workspace, form/version, assignment, record/submission, device, sync batch/item, job, durations, sizes, state, and reason code. Response values, media, voice transcripts, signature strokes, coordinates, and raw barcodes are redacted by default.
- OpenTelemetry traces span bundle generation/download, draft lifecycle, submission, multipart upload, acknowledgement, processing, review, reconciliation, export, and downstream routing.
- Metrics include bundle failures, draft-save latency, app recovery, unsynchronized count/age, storage pressure, sync throughput/retry, media checksum failure, extraction confidence/review, submission validation, duplicate rate, review age, return rate, approval time, scanner queue, and reconciliation variance.
- Alerts cover rapidly aging unsynchronized records, repeated checksum or decryption errors, stalled critical assignments, abnormal duplicate spikes, missing required media, high app-crash recovery, device revocation attempts, scanner overflow, and unapproved sensitive evidence access.
- Android exposes a user-readable sync diagnostic view; support export is redacted and requires explicit user authorization.

### Product success metrics

- At least 99.9% of confirmed offline submissions are recoverable after app/process restart in durability testing and production integrity sampling.
- Fewer than 0.1% of synchronized device submission keys create a duplicate server record, with a target of zero.
- At least 95% of submitted records reach approved, rejected, returned, or explained-exception state within the form’s service target.
- Point-of-capture deterministic validation reduces returned records for preventable completeness/format errors by at least 60% from the pre-rollout baseline.
- At least 98% of required original attachments have verified checksums and accessible evidence at approval time.
- 100% of corrections retain original value, replacement value, actor, reason, and version lineage.
- Reconciliation accounts for 100% of expected and received items through explicit categories before approval.
- Local mode shows zero unapproved response/media egress in continuous privacy-contract tests.

Success metrics never reward excessive sensor collection. Product analytics use aggregate counts and timings and exclude response content, location, media, voice, barcodes, and signatures.

## 14. Acceptance and testing criteria

A release is acceptable when all P0 requirements pass and the following tests are automated or documented:

1. A published Vietnamese form preserves stable field IDs, diacritics, labels, help, choice values, validation messages, and accessible reading order across Web and Android.
2. Form validation rejects cycles, hidden-unsatisfiable required fields, incompatible calculations, missing reference versions, prohibited fields, and arbitrary executable content.
3. A fully downloaded assignment works in airplane mode: draft, autosave, camera/document, barcode, voice, signature, validation, and submission all complete without network.
4. Killing the app or restarting the device after each journal checkpoint restores the latest durable draft or pending immutable submission without loss.
5. Replaying the same sync batch and submission idempotency key produces one server submission version and stable acknowledgements.
6. Interrupted multipart uploads resume, detect a corrupted chunk/checksum, and never associate a partial attachment.
7. Android does not mark a record synchronized until all required responses and attachments are durably acknowledged.
8. Camera, microphone, file, and location capture cannot begin remotely or without current Android permission and visible user action/state.
9. Signature presentation explicitly states acknowledgement-only semantics and preserves artifact, acknowledgement version, signer-entered label, and timestamps without asserting identity.
10. OCR/transcription candidates preserve region/time evidence and never overwrite submitted operator values; conflict routes to review.
11. Form updates preserve pinned drafts; breaking migration shows a field-level preview and requires explicit confirmation.
12. Concurrent corrections remain sibling versions until reviewed and do not lose either editor’s values.
13. Desktop scanner intake ignores unstable files, rejects path escapes, deduplicates repeated events/content, and routes ambiguous matches to review.
14. Reconciliation identifies every expected, received, missing, duplicate, rejected, returned, and waived item; an injected unexplained record blocks approval.
15. Local mode transfers only allowed status/hashes to cloud and keeps responses/media on Android or registered Desktop in network-contract tests.
16. Permission and tenant-isolation tests cover forms, assignments, team scope, fields, evidence, location, signature, review, approval, correction, export, and object grants.
17. Property and fuzz tests cover declarative form logic, Unicode, decimals, repeat-item identity, validation, idempotency, chunk assembly, version diff, and reconciliation.
18. Android tests cover low storage, denied/revoked permissions, clock change, background restrictions, roaming policy, device revocation, and upgrade/restart recovery.
19. Web, Desktop, and Android critical authoring, capture, review, and approval paths meet WCAG 2.2 AA or native accessibility equivalents, including TalkBack, text scaling, contrast, touch targets, and keyboard navigation where applicable.

## 15. Delivery slices and future expansion

### Slice 1 — Native offline structured capture

Web typed form designer, immutable versions, assignments, Android encrypted offline bundles/drafts, autosave, structured fields, deterministic validation, submission idempotency, resumable sync, review states, evidence, and audit.

### Slice 2 — Rich evidence and supervision

Camera/document, barcode/QR, voice, signature acknowledgement, optional location, on-device adapters, extraction candidate review, corrections, supervisors, Android approvals, media policy, and operational dashboards.

### Slice 3 — Desktop intake and reconciliation

Explicit scanner-folder intake, local OCR, bulk matching/review, duplicate handling, roster and control-total reconciliation, exports, downstream typed module intake, manual encrypted Local-mode export/import packages, and parity testing.

### Future expansion

- Additional reviewed native field types and on-device language/media adapters.
- Hardware scanner and standards-based device integrations with explicit Android permissions and bounded contracts.
- Configurable encrypted peer transfer between registered Android and Desktop devices for Local mode.
- Advanced form packages and industry templates distributed as unsigned drafts without responses, assignments, secrets, or restricted reference data.
- Optional legally compliant electronic-signature adapters under a separate security, identity, consent, and jurisdiction specification.

Future work must preserve active user-controlled capture, native offline durability, immutable originals, versioned corrections, typed processing, explicit permissions, evidence traceability, and the prohibition on hidden sensors or unrestricted device control.
