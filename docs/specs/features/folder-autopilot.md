# DataBreeze Folder Autopilot — Product Specification

**Status:** Product specification<br>
**Version:** 1.0<br>
**Requirement prefix:** FA<br>
**Dependencies:** Platform identity and workspace services; `DSO` DeviceCapability/DeviceGrant authorization and lifecycle; `JRA` canonical Recipe/RecipeVersion, typed-job, ApprovalPolicy, ApprovalRequest, and ApprovalDecision contracts; artifact, evidence, audit, notification, and sync services; Desktop encrypted local folder-authority store and Python processing sidecar; PostgreSQL; Redis Streams

## 1. Purpose and outcome

Folder Autopilot safely automates repeatable work on files placed in folders that a user has explicitly approved. A published `JRA` RecipeVersion recognizes an eligible file, builds a typed action preview, requests approval when policy requires it, executes only allowlisted actions, records evidence and audit history, and provides a bounded undo path.

The intended outcome is a dependable local operations layer for tasks such as:

- classifying incoming documents into known business types;
- validating names, formats, and required companion files;
- extracting governed metadata;
- creating converted copies or standardized filenames;
- copying or moving files into approved destinations;
- submitting artifacts to another DataBreeze module; and
- notifying or requesting review when confidence or deterministic checks are insufficient.

Folder Autopilot is not a general computer-control agent. It cannot browse arbitrary folders, run user-provided scripts, interact with unrelated applications, scrape private sites, or perform actions outside a published `JRA` RecipeVersion and explicit `DSO` DeviceGrants backed by Desktop-local folder authorization.

## 2. Users and jobs-to-be-done

| User | Jobs-to-be-done |
|---|---|
| Workspace admin | Register trusted devices, set file-operation policy, control allowed action types, and revoke access. |
| Automation designer | Define a repeatable typed recipe, preview its effects on real examples, publish a safe version, and monitor quality. |
| Operator | Drop files into an approved folder, resolve exceptions, retry authorized failures, and request or execute an authorized undo. |
| Approver | When eligible under the current `JRA` ApprovalPolicy, inspect proposed file changes and evidence, then approve, reject, or request correction from Web or Android. |
| Auditor | Determine which recipe, device, user, and evidence caused every file operation. |
| Local-first user | Automate sensitive folders while keeping file content and processing on one Windows device. |

Primary user jobs are:

1. “When I save a known file into this folder, handle the routine steps consistently.”
2. “Show me exactly what will happen before I let an automation touch my files.”
3. “Ask me when classification is uncertain or an operation crosses a safety boundary.”
4. “If the result is wrong, put the file back and preserve a complete explanation.”
5. “Keep working locally while offline and synchronize only what my workspace policy permits.”

## 3. Scope and explicit non-goals

### In scope

- Windows folders selected through an explicit Desktop folder picker, stored only in Desktop's encrypted local grant/path store, represented to cloud only by content-free `DSO` DeviceCapability/DeviceGrant records, and referenced by Folder Autopilot bindings.
- File-created, file-stabilized, scheduled-scan, and user-invoked triggers.
- Include/exclude filters based on relative path, extension, media type, size, age, and deterministic metadata.
- Typed recipe steps from an allowlisted catalog: inspect, classify, extract, validate, rename, copy, move, create converted derivative, package, route to a DataBreeze module, request approval, notify, and place in a configured recovery/quarantine folder.
- Dry-run and sample previews with collision, overwrite, permission, disk-capacity, confidence, and policy checks.
- Canonical `JRA` recipe/version publication, pausing, rollback to an earlier version, and Folder Autopilot profile/assignment facades.
- JRA-owned durable execution state plus Folder Autopilot evidence, business projections, audit, idempotency, and undo.
- Local, Hybrid, and Cloud metadata behavior while file operations execute only on the Desktop device authorized by the applicable `DSO` DeviceGrant.

### Explicit non-goals

- Arbitrary shell, PowerShell, Python, JavaScript, macro, executable, or user-authored code execution.
- Unrestricted keyboard, mouse, screen, browser, application, process, registry, or operating-system control.
- Watching a drive, user profile, network share, or new subdirectory that was not covered by an explicit Desktop-local authorization and active DSO DeviceGrant.
- Private-site scraping, credential replay, marketplace session automation, or bypassing vendor access controls.
- Permanent deletion as a standard recipe action.
- In-place modification of source file contents.
- Silent overwrite of an existing destination file.
- Treating a generative-AI response as sufficient authority for a file operation.
- Guaranteed real-time execution while the registered Desktop device is off, signed out, or disconnected.

## 4. Platform responsibilities

| Platform | Responsibilities |
|---|---|
| Web | Author recipes through a `JRA` facade; configure Folder Autopilot profile settings and approval gates; bind published JRA versions to registered devices and content-free DSO grants; view device/watch health, previews, queues, executions, audit, and aggregate metrics; pause assignments or retire recipes through their owning contracts; manage permissions and IAE-backed retention constraints. |
| Desktop | Alone retains the encrypted local folder grant/path; validates path containment; reports content-free capabilities to `DSO`; watches folders; stabilizes and fingerprints files; evaluates triggers; runs typed local inspection/processing; renders local previews; executes approved file actions; keeps undo journals; operates offline; synchronizes permitted state. |
| Android | Receive alerts; inspect compact action previews and evidence; approve or reject pending plans; pause/resume an assignment when authorized; view recent outcomes and undo availability. Android cannot create a Desktop local folder authorization or a DSO DeviceGrant and cannot execute Windows file operations. |

`JRA` alone owns canonical Recipe, immutable RecipeVersion, trigger, typed graph, ApprovalPolicy, ApprovalRequest, and ApprovalDecision records. Desktop alone owns the encrypted local folder grant/path, current file-system observations, file-operation journals, and local undo execution. `DSO` owns content-free DeviceCapability and DeviceGrant records, workspace/action authorization, status, expiry, and revocation. Folder Autopilot owns only its typed profile payload, `AutopilotFolderBinding` records, RecipeAssignment records, and subject-bound execution/release projections; it stores no path and no independent recipe, device grant, authorization, status, revocation, or approval authority. Cloud services never send arbitrary commands; they dispatch only signed typed jobs referencing an immutable JRA RecipeVersion and DSO DeviceGrant whose capability digest must match Desktop-local state.

## 5. Primary workflows

### 5.1 Authorize and bind a folder

1. On Desktop, an authorized user chooses a folder through the native picker.
2. Desktop resolves the canonical path, volume identity, link/reparse-point policy, read/write capabilities, and allowed descendant scope and stores the resulting local grant/path only in its encrypted local store.
3. The user sees what data may leave the device under the effective `DSO` workspace policy after any narrower assignment constraint.
4. Through an authorized facade, `DSO` creates content-free DeviceCapability and DeviceGrant records containing no path; DSO owns their workspace/action scope, capability digest, status, expiry, and revocation.
5. Folder Autopilot creates only `AutopilotFolderBinding { deviceGrantId, role: INPUT|OUTPUT, expectedCapabilityDigest }` and uses it in a RecipeAssignment. The assignment remains inactive unless the JRA RecipeVersion, DSO grant, expected digest, and Desktop-local authorization all validate.

### 5.2 Design and preview a recipe

1. A designer uses the Folder Autopilot authoring facade to choose a trigger, input filters, typed steps, approval policy, output bindings, retry policy, an IAE-backed retention constraint, and module-specific profile settings.
2. `JRA` validates and owns the canonical trigger and typed graph; Folder Autopilot validates only its typed profile payload, DSO grant bindings, path-containment preconditions, potential recursion, and action compatibility.
3. A preview runs against selected immutable sample artifact versions or a bounded current-folder scan.
4. DataBreeze lists matched files, proposed destinations, derived outputs, collisions, policy gates, and confidence-based review items.
5. The designer publishes an immutable `JRA` RecipeVersion after required review; the facade returns its JRA IDs/hash plus the pinned Folder Autopilot profile hash.

### 5.3 Handle a file

1. Desktop observes a file event and waits until the file is stable and no longer exclusively locked.
2. It verifies the file is inside the encrypted Desktop-local authorization, that the bound DSO DeviceGrant is active and its capability digest matches `expectedCapabilityDigest`, that the file matches the published JRA trigger, and that it is not an output already marked by the same recipe lineage.
3. Desktop fingerprints the file, creates an immutable artifact version, and evaluates the typed plan.
4. Safe pre-authorized steps execute when deterministic checks and policy pass. Sensitive or uncertain steps enter `AWAITING_APPROVAL`.
5. On success, Desktop records outputs, file-system journal entries, evidence, audit, and an undo deadline.

### 5.4 Approve or reject a plan

1. An approver opens the module view of a `JRA` ApprovalRequest for a plan on Web, Desktop, or Android.
2. The preview shows current source fingerprint, each proposed operation, destinations, collisions, confidence, policy reasons, and undo behavior.
3. The decision is recorded authoritatively by `JRA` and bound to an exact `subjectRef` containing type, ID, version, and hash, plus the plan hash, JRA RecipeVersion, and file fingerprint.
4. Desktop revalidates the source and destination immediately before execution.
5. If either changed, the `JRA` ApprovalDecision no longer authorizes release and a new ApprovalRequest is required.

### 5.5 Undo and recover

1. An authorized user selects an eligible execution and reviews its inverse plan.
2. Desktop confirms that affected files still match recorded post-action fingerprints and that inverse destinations are available.
3. The inverse plan executes atomically where possible; conflicts enter guided recovery without overwriting user changes.
4. Undo creates new audit and artifact events and never erases the original execution record.

## 6. Functional requirements

Priorities are `P0` (required for first production release), `P1` (required for complete module operation), and `P2` (planned enhancement).

| ID | Priority | Requirement |
|---|---|---|
| FA-001 | P0 | Desktop shall create its encrypted local folder authorization only after an authorized user selects the folder through a native picker and confirms scope plus effective DSO data-mode behavior; Folder Autopilot shall never receive or persist that path. |
| FA-002 | P0 | Desktop alone shall store canonical root, volume identity, descendant policy, read/write capabilities, reparse-point policy, and local grant metadata. `DSO` alone shall own the content-free DeviceCapability/DeviceGrant, workspace/action authorization, status, expiry, and revocation; Folder Autopilot shall store none of those fields independently. |
| FA-003 | P0 | Cloud APIs and jobs shall reference `deviceGrantId`, `AutopilotFolderBinding`, and `expectedCapabilityDigest` and shall never contain an unrestricted local path, local handle, independent grant copy, or instruction for Desktop to discover a new path. |
| FA-004 | P0 | Every observed and destination path shall be canonicalized and verified by Desktop to remain inside its encrypted local authorization, while DSO DeviceGrant status/action scope and the expected capability digest shall be revalidated before access. |
| FA-005 | P0 | The canonical `JRA` RecipeVersion shall contain the versioned typed triggers, conditions, and actions from a workspace-allowed catalog; Folder Autopilot shall not persist a second trigger or graph authority. |
| FA-006 | P0 | JRA recipe validation shall reject arbitrary code, unknown action types, type mismatches, cycles, unreachable steps, and unbounded traversal; Folder Autopilot profile validation shall additionally reject missing/invalid DSO bindings, capability-digest mismatch, output recursion, and incompatible product-specific settings. |
| FA-007 | P0 | `JRA` RecipeVersions shall be immutable after publication; edits, including a changed pinned Folder Autopilot profile payload/hash, create a JRA draft derived from a named parent and shall not create a separate feature-owned recipe version lineage. |
| FA-008 | P0 | A designer shall preview a JRA draft plus its Folder Autopilot profile and DSO bindings against selected samples or a bounded scan before publication, with affected count and per-file action plans. |
| FA-009 | P0 | Preview shall identify destination collisions, source/destination permission errors, insufficient disk space, unsupported files, recursive re-entry, and approval gates. |
| FA-010 | P0 | Desktop shall wait for configurable file stability and retry transient locks before fingerprinting or processing a file. |
| FA-011 | P0 | Each input shall receive a content hash, size, modified-time observation, stable execution key, and immutable artifact-version reference before an action. |
| FA-012 | P0 | Recipe matching shall be deterministic for path, type, metadata, and validation conditions; classifier suggestions shall include confidence and evidence. |
| FA-013 | P0 | An uncertain classification shall route to review rather than execute a class-dependent file mutation when it falls below the published threshold. |
| FA-014 | P0 | Rename, copy, and move steps shall use computed relative destinations constrained to `OUTPUT` AutopilotFolderBindings backed by active DSO DeviceGrants and matching Desktop-local authorizations. |
| FA-015 | P0 | The system shall never silently overwrite a destination; collision policy shall be `REVIEW`, `SKIP`, or deterministic unique-name generation. |
| FA-016 | P0 | Content conversion and normalization shall create a new derivative file and shall not modify source file bytes in place. |
| FA-017 | P0 | Permanent deletion shall not be available in the P0/P1 action catalog; removal workflows may move a file to a configured recovery folder with undo. |
| FA-018 | P0 | A sensitive action plan shall require an authoritative `JRA` ApprovalRequest according to the applicable ApprovalPolicy, including moves across DSO DeviceGrants, externally synchronized outputs, or low-confidence classification. |
| FA-019 | P0 | The authoritative `JRA` ApprovalRequest and ApprovalDecision shall bind approver, an exact subject type/ID/version/hash, plan hash, JRA RecipeVersion, source fingerprint, destinations, expiry, and decision reason; Folder Autopilot shall not create an independent approval decision. |
| FA-020 | P0 | Desktop shall revalidate its local authorization, DSO DeviceGrant action scope/status, expected capability digest, `effectiveDataModePolicyRef`, source fingerprint, destination state, and the applicable `JRA` ApprovalDecision immediately before committing actions. |
| FA-021 | P0 | Multi-step file operations shall use a staged plan and compensating actions so a failure cannot present a partially completed execution as successful. |
| FA-022 | P0 | Every asynchronous execution shall store `jraJobId` and a pinned JRA `resultManifestId`. `JRA` owns dispatch, progress, cancellation, retry, steps, and terminal execution state; Folder Autopilot stores only an idempotent business projection with input/output fingerprints, evidence, reason codes, and actor/device attribution. |
| FA-023 | P0 | Repeated file-system events or job delivery shall not create duplicate derivatives, moves, notifications, review items, or module submissions. |
| FA-024 | P0 | Eligible executions shall expose an inverse plan until the configured undo expiry; ineligible steps shall be labeled before approval. |
| FA-025 | P0 | Undo shall refuse to overwrite or discard a file changed after the execution and shall create a guided conflict item. |
| FA-026 | P0 | Users with permission shall pause a RecipeAssignment immediately; retiring or replacing its canonical recipe/version shall use the JRA facade. In-flight jobs may finish only through the next safe checkpoint defined by JRA and the recipe policy. |
| FA-027 | P0 | Revoking a `DSO` DeviceGrant shall invalidate its AutopilotFolderBindings, stop new access, cancel undispatched JRA work, and require revalidation of in-flight work without erasing audit history; Folder Autopilot shall not own or rewrite revocation state. |
| FA-028 | P1 | A canonical JRA recipe step shall be permitted to submit an immutable artifact version to another DataBreeze module only through a typed module-intake action with an idempotency key. |
| FA-029 | P1 | The system shall support scheduled reconciliation scans to recover file events missed during device sleep or watcher overflow. |
| FA-030 | P1 | Operators shall filter, assign, and bulk-retry only failures they are authorized to retry. An actor eligible under the current `JRA` ApprovalPolicy may bulk-approve homogeneous plans only through authoritative JRA decisions, with each subject independently bound to its exact type/ID/version/hash and plan hash, separation-of-duties rules passing, required MFA current, and an explicit expiry; every bulk action shall preview exact affected items and policy boundaries. |
| FA-031 | P1 | Workspace admins shall set profile/assignment-level concurrency, throughput, file-size, extension, schedule, confidence, approval, retention, and undo constraints within JRA, DSO, BUA, and IAE ceilings. `dataModeConstraint` may only narrow the DSO workspace maximum and shall resolve to `effectiveDataModePolicyRef`; `retentionConstraint` shall resolve to canonical IAE `effectiveRetentionPolicyRef` and shall never authorize Folder Autopilot to delete artifact bytes. |
| FA-032 | P1 | Desktop shall maintain an output-lineage marker outside user file contents so recipe outputs do not recursively trigger the same lineage unless explicitly permitted. |
| FA-033 | P1 | Web shall report the current JRA RecipeVersion assignment, last DSO device heartbeat and DeviceGrant status/revocation projection, watcher health, queue age, recent outcomes, and assignment pause state without making Folder Autopilot authoritative for those external states. |
| FA-034 | P1 | An authorized user shall export a redacted execution ledger and evidence manifest without exporting local file contents. |
| FA-035 | P2 | JRA recipe templates plus Folder Autopilot profile payloads shall be shareable across workspaces only as unsigned drafts with all DSO grant/binding IDs, secrets, and policies removed. |

## 7. Data model extensions

The table below lists Folder Autopilot-owned records only. All cloud records include workspace scope, timestamps, audit attribution, and optimistic-concurrency versions. JRA Recipe/RecipeVersion/trigger/typed-graph/Job/result-manifest and DSO DeviceCapability/DeviceGrant/status/revocation records are referenced through their public contracts and are not duplicated. Desktop-local folder grants, paths, observations, and file-operation journals remain encrypted and Desktop-owned.

| Entity | Purpose and key fields |
|---|---|
| `AutopilotFolderBinding` | `deviceGrantId`, `role: INPUT|OUTPUT`, and `expectedCapabilityDigest` only. The referenced `DSO` records own capability/action scope, status, expiry, and revocation; Desktop owns the local grant/path. |
| `FolderAutopilotProfile` | Typed module extension payload referenced and hashed by a canonical JRA RecipeVersion: stabilization, watcher reconciliation, collision, undo, output-lineage, and other Folder Autopilot-specific settings. It contains no independent trigger, graph, publication state, data-mode authority, or retention authority. |
| `RecipeAssignment` | `jraRecipeVersionId`, device ID, input/output `AutopilotFolderBinding` IDs, activation schedule, effective limits, optional narrowing `dataModeConstraint`, derived `effectiveDataModePolicyRef`, optional `retentionConstraint`, and derived canonical IAE `effectiveRetentionPolicyRef`. |
| `WatchHealthProjection` | Assignment/binding, content-free watcher health, cursor/overflow summary, and last reconciliation time. The Desktop-owned watch registration and path are not copied. |
| `FileObservationProjection` | Desktop observation ID, safe size/time/stability/hash summary when policy permits, artifact version, and lineage marker; no path or local handle. |
| `AutopilotExecutionProjection` | `jraJobId`, pinned JRA `resultManifestId`, assignment/JRA RecipeVersion, input artifact, plan hash, idempotent business state projection, counters, policy decision references, and timestamps. JRA owns execution state and transitions. |
| `ActionPlan` / `ActionPlanStep` | Immutable preview of typed operations, source/destination fingerprints, evidence, confidence, collision result, approval and undo properties. |
| `FileOperationJournalBinding` | Reference to Desktop-owned prepare/commit/compensate journal and signed receipt IDs plus permitted pre/post fingerprints and derivative artifact IDs; Folder Autopilot stores no path or path token. |
| `AutopilotApprovalBinding` | `jraApprovalRequestId`, exact subject type/ID/version/hash, plan hash, recipe/source/destination fingerprints, and module execution/release projection only. `JRA` owns ApprovalPolicy, ApprovalRequest, ApprovalDecision, approver, reason, and expiry. |
| `UndoPlan` | Inverse step definitions, eligibility, expiry, required fingerprints, state, conflicts, and executing actor. |
| `AutopilotException` | Typed failure/review item, severity, reason code, evidence, assignment, resolution, retry linkage. |
| `AutopilotHealthSnapshot` | Aggregate assignment and projected JRA Job status, queue age, counts, latency, watcher overflow, disk capacity, and sync lag; it is operational telemetry, not an authority for JRA or DSO state. |

Folder Autopilot never stores a canonical path, relative path, local handle, independent grant record, DeviceCapability/DeviceGrant authorization fields, or grant status/revocation. When a user requests a path display on Desktop, Desktop resolves and renders it locally from its encrypted store; Web and Android receive only content-free DSO/FA identifiers and policy-safe labels. File bytes and extracted values follow IAE placement and the effective DSO data-mode policy.

## 8. Processing, evidence, and confidence rules

### Processing rules

- Desktop is the only executor of Windows file-system steps. Cloud may execute content analysis only for artifacts explicitly allowed in Cloud or Hybrid mode.
- Every execution uses an immutable JRA RecipeVersion ID/hash, pinned Folder Autopilot profile hash, and typed action schema versions. Unknown, mismatched, or downgraded contracts fail closed.
- File contents are captured as immutable artifact versions before processing. File-system rename or move may change location, but not the captured content version.
- Conversions, renamed-content transformations, redactions, and generated packages create derivative artifact versions with source lineage.
- A file event is eligible only after its size and modification timestamp remain unchanged for the configured stabilization interval and an exclusive-open probe no longer indicates an active writer, subject to connector limitations.
- The engine uses stable idempotency keys derived from assignment, JRA RecipeVersion, trigger occurrence, and input content/version. A replacement file at the same Desktop-local location is a new input.
- JRA RecipeVersion steps execute in topological order with explicit resource and time bounds and cannot create dynamic unbounded loops.
- JRA is authoritative for Job dispatch, progress, cancellation, retry, step state, and terminal state. Folder Autopilot maps JRA state and the pinned result manifest idempotently into user-facing business outcomes such as `HANDLED`, `EXCEPTION`, `UNDO_AVAILABLE`, or `UNDO_EXPIRED`; these projections never drive JRA transitions.

Business projection mapping is explicit:

- non-terminal JRA states, including queued, device-wait, running, review, approval, and cancel-requested states, expose a read-through status and no terminal Folder Autopilot outcome;
- `SUCCEEDED` plus a complete pinned result manifest projects to `HANDLED` unless that manifest declares a product exception requiring follow-up;
- `PARTIALLY_SUCCEEDED`, `FAILED`, `CANCELLED`, or `EXPIRED` projects to `EXCEPTION` with the JRA reason and result-manifest evidence; and
- `UNDO_AVAILABLE` and `UNDO_EXPIRED` are later business conditions over a completed operation and never replace or mutate the JRA terminal state.

### Evidence

- Evidence for every plan includes the observed input artifact/version, Desktop observation reference, content hash, policy-permitted metadata, matched JRA trigger/conditions, and exact typed step parameters; Folder Autopilot evidence stores no path.
- Classification evidence identifies deterministic signatures and extracted features; optional AI explanations are labeled as suggestions.
- Desktop's encrypted journal stores pre- and post-operation fingerprints and any path tokens. Folder Autopilot retains only journal/receipt references and permitted fingerprints. A content derivative stores page/sheet/cell/row evidence when its processing supports those coordinates.
- Preview evidence is invalidated if the source hash, JRA RecipeVersion, expected DSO capability digest, DeviceGrant authorization/status, destination fingerprint, or governing policy changes.
- Audit displays human-readable Vietnamese reason text backed by stable machine reason codes.

### Confidence and approvals

- `JRA` is the sole approval authority. Folder Autopilot may request approval, render an authorized module projection, and release or block an execution from the resulting decision; it never persists a second ApprovalPolicy, ApprovalRequest, or ApprovalDecision.
- Deterministic conditions have `PASS`, `FAIL`, or `UNKNOWN`, not probabilistic confidence.
- Statistical or AI-assisted classification stores calibrated class probabilities, model/provider adapter version, and feature/evidence references.
- Default policy requires review below `0.90` confidence for a class-dependent move or rename and below `0.80` for a non-mutating module route; workspaces may make thresholds stricter or disable auto-action entirely.
- Confidence never overrides a deterministic failure, Desktop path-containment rule, collision, revoked DSO DeviceGrant, required approval, or effective DSO data-mode restriction.
- AI is provider-neutral and optional. If unavailable, deterministic recipes continue; AI-dependent classifications become `NEEDS_REVIEW` rather than guessing.

## 9. Permissions, privacy, and data modes

Folder Autopilot module permissions are:

- `autopilot.folder_binding.manage`
- `autopilot.profile.edit`
- `autopilot.assignment.manage`
- `autopilot.execution.read`
- `autopilot.execution.approve`
- `autopilot.execution.retry`
- `autopilot.execution.undo`
- `autopilot.assignment.pause`
- `autopilot.audit.export`

Creation/revocation of DeviceCapability and DeviceGrant records uses DSO-owned workspace/action authorization through the module facade; Folder Autopilot defines no grant permission or policy. Canonical recipe authoring/publication uses JRA-owned authorization, while assignment and Folder Autopilot profile/binding management remain separate module actions. Read access to execution metadata does not grant source-content access. The module permission `autopilot.execution.approve` authorizes use of the Folder Autopilot facade but never bypasses `JRA` eligibility or policy evaluation. Approval notifications contain only policy-permitted labels and evidence excerpts.

Data-mode behavior:

The workspace `DSO` policy is always the maximum authority. A Folder Autopilot `dataModeConstraint` on a RecipeAssignment may only narrow it; the evaluated policy is referenced by `effectiveDataModePolicyRef`. The module cannot select a broader mode, copy policy fields as its own authority, or continue under a stale effective reference.

- **Local:** File bytes, canonical paths, extracted content, previews, derivatives, and journals remain on Desktop. Only content-safe JRA recipe definitions, Folder Autopilot profiles/bindings, and `CONTROL_METADATA` synchronize automatically; a derivative or value-bearing audit/report output requires a separately confirmed `APPROVED_DERIVED_RESULT` under `DSO`.
- **Hybrid (default):** Originals may remain local. Selected structured metadata, thumbnails/evidence excerpts, derivative artifacts, and module submissions synchronize only when the canonical JRA recipe and effective DSO policy permit them.
- **Cloud:** Approved artifact versions and derived outputs may upload for cloud processing or cross-device review under the effective DSO policy, but Windows file operations still execute on the Desktop authorized by the bound DeviceGrant.

IAE is the canonical retention and byte-deletion authority. Folder Autopilot may store only `retentionConstraint` and `effectiveRetentionPolicyRef`; constraints may narrow ordinary availability or request a policy-governed extension but never authorize module code to delete IAE bytes. Desktop local cache cleanup is a separate device operation and cannot be represented as artifact deletion.

Device keys sign execution receipts and protect sync. Devices or DeviceGrants reported revoked by DSO cannot accept assignments or approvals. Secrets for standards-based destinations, if later supported through a typed action, live in the platform secret store or OS credential vault and never in JRA recipe JSON, Folder Autopilot profiles, logs, or previews.

## 10. Offline, sync, failure, and recovery

- Desktop caches assigned JRA RecipeVersions, Folder Autopilot profiles/bindings, schemas, and DSO/IAE policy snapshots for offline operation. Any `dataModeConstraint` can narrow but never broaden the cached DSO workspace policy. Each assignment declares whether pre-authorized offline actions, local-confirmation actions, or observation-only behavior is allowed.
- A local confirmation may authorize only the low-risk, local-only effects allowed by an unexpired offline policy lease. It is recorded locally and revalidated after synchronization; actions requiring a `JRA` ApprovalRequest remain blocked until the server records an authoritative online ApprovalDecision.
- Local executions use stable provisional IDs and append-only sync records. Server acknowledgement idempotently registers/binds the canonical JRA Job, and the feature projection stores its `jraJobId` and pinned `resultManifestId`.
- JRA recipe edits do not replace a cached published version. Desktop switches versions only at an execution boundary after verifying JRA signature/hash, Folder Autopilot profile hash, DSO DeviceGrant/digest, capabilities, and effective policy references.
- Watcher overflow, device sleep, or service restart sets the watch to `RECONCILING`; a bounded scan compares file fingerprints and queues missing observations without duplicating completed work.
- Locked files use exponential retry within a configured maximum age, then become `FILE_STILL_IN_USE`.
- If a file changes after preview, the execution becomes `STALE_PLAN`; its approval is invalid and no mutation occurs.
- If a device loses power between staged file steps, the journal recovers to the last durable commit, verifies actual file state, and either continues, compensates, or raises `RECOVERY_CONFLICT`.
- Cross-volume moves are implemented as verified copy plus destination checksum plus recoverable source relocation; they are never represented as an atomic rename.
- Insufficient disk, lost Desktop-local authorization, revoked/expired DSO DeviceGrant, path disappearance, antivirus quarantine, and destination conflicts produce distinct reason codes and retain recoverable checkpoints.
- JRA owns recipe draft conflicts and never merges typed graphs field by field. Concurrent drafts remain JRA branches; a designer explicitly selects or recreates a new version through the authoring facade.
- Undo stops on fingerprint mismatch and does not discard later user edits. It provides exact manual recovery guidance and preserves both versions where a safe copy is possible.

## 11. APIs, events, and extension points

### REST resources

- `/v1/workspaces/{workspaceId}/autopilot-recipes` and `/v1/autopilot-recipes/{recipeId}/versions` — authorized Folder Autopilot authoring facades over canonical JRA Recipe/RecipeVersion resources; responses return `jraRecipeId`, `jraRecipeVersionId`, JRA recipe hash, and pinned profile hash
- `/v1/autopilot-recipes/{recipeId}/assignments`
- `/v1/devices/{deviceId}/folder-grant-aliases` — an authorized DSO facade over content-free DeviceCapability/DeviceGrant resources; Folder Autopilot receives only the resulting `deviceGrantId` and capability digest for binding
- `/v1/autopilot-assignments/{assignmentId}/previews`
- `/v1/autopilot-assignments/{assignmentId}/executions` — a JRA Job facade plus the idempotent Folder Autopilot business projection, always returning `jraJobId` and pinned `resultManifestId`
- `/v1/autopilot-executions/{executionId}/approvals` — an authorized module facade using `AutopilotApprovalBinding.jraApprovalRequestId` plus the exact subject type/ID/version/hash to create/read/decide the bound `JRA` ApprovalRequest; it never stores an independent decision
- `/v1/autopilot-executions/{executionId}/undo`
- `/v1/autopilot-exceptions`
- `/v1/autopilot-assignments/{assignmentId}/health`

The folder-grant-alias route delegates all workspace/action authorization, DeviceCapability/DeviceGrant creation, status, expiry, and revocation to `DSO`; it exposes no path and creates no Folder Autopilot grant record. The recipe authoring routes delegate canonical IDs, draft lineage, typed graph, validation, publication, and immutable version hashes to `JRA`; Folder Autopilot adds only its typed profile payload/hash and assignment/binding views. All mutation endpoints use idempotency keys and resource versions. The module-specific approvals facade delegates authorization, policy evaluation, `requestedAction`, optional job linkage, request state, and decision persistence to `JRA`; its response may add only `jraApprovalRequestId`, the exact subject type/ID/version/hash, and the subject-bound Folder Autopilot execution/release projection. Streaming execution updates project JRA state through authorized server-sent events; device dispatch uses the platform’s authenticated, signed job channel.

### Typed jobs

- `VALIDATE_AUTOPILOT_RECIPE`
- `PREVIEW_AUTOPILOT_RECIPE`
- `RECONCILE_FOLDER_WATCH`
- `INSPECT_AUTOPILOT_FILE`
- `EXECUTE_AUTOPILOT_PLAN`
- `COMPENSATE_AUTOPILOT_EXECUTION`
- `UNDO_AUTOPILOT_EXECUTION`
- `SUBMIT_ARTIFACT_TO_MODULE`

`JRA` owns every typed Job's dispatch, progress, cancellation, retry, result manifest, and terminal state. Only Desktop may accept file-operation jobs, and only when `jraJobId`, JRA RecipeVersion ID/hash, assignment, DSO `deviceGrantId` values, expected capability digests, device, signature, schema version, effective DSO policy reference, and expiry match local state. Job payloads contain typed parameters and content-free binding IDs, never paths, local handles, command strings, or executable content.

### Domain events

- `autopilot.folder_binding.created`
- `autopilot.folder_binding.invalidated` (a projection of authoritative DSO grant status/revocation or digest mismatch)
- `autopilot.profile.updated`
- `autopilot.recipe_version.available` (a projection of authoritative JRA publication)
- `autopilot.assignment.activated`
- `autopilot.execution.previewed`
- `autopilot.execution.approval_requested` (a module projection emitted from the authoritative `JRA` request)
- `autopilot.execution.handled` (an idempotent business projection from JRA terminal state and pinned result manifest)
- `autopilot.execution.exception_projected` (an idempotent business projection, not a Job terminal state)
- `autopilot.execution.undone`
- `autopilot.watch.overflowed`
- `autopilot.assignment.paused`

Events are versioned, permission-filtered, and delivered at least once. Consumers deduplicate by event ID and may not infer permission from event receipt. DSO `device.*`/`device_grant.*`, JRA `recipe.*`/`job.*`/`approval.*`, and IAE retention/deletion events remain authoritative; Folder Autopilot events are profile, binding, assignment, or business-result projections only.

### Extension points

- File inspectors and classifiers implement a bounded artifact-to-typed-result contract.
- Typed actions declare supported executor, input/output schema, determinism, permissions, reversible behavior, resource limits, and evidence output.
- DataBreeze module routes register a typed intake contract and idempotent response.
- Notification adapters receive redacted template fields only.
- New file-operation actions require security review, path-containment tests, preview support, audit semantics, and an inverse or explicit non-reversible classification. Arbitrary script adapters are prohibited.

## 12. Performance and capacity budgets

Defaults are workspace-configurable within device and license guardrails. Each assignment records its effective limits.

| Budget | Default target |
|---|---|
| Active bindings | 50 active DSO-backed AutopilotFolderBindings and 100 watch-health projections per Desktop device. |
| Recipe complexity | 100 JRA-owned typed steps, 200 conditions, 20 output bindings, and 10 module routes per JRA RecipeVersion. |
| File size | 10 GB maximum observed file; content-processing actions default to 2 GB unless the processor declares a higher bounded capability. |
| Folder scan | 1 million directory entries per active DSO-backed binding, with pagination, checkpointing, cycle protection, and configurable exclusions. |
| Event pickup | Stable eligible files begin evaluation within 5 seconds at p95 under a sustained rate of 10 new files per second on reference hardware. |
| Burst handling | Queue 50,000 observations without loss; watcher overflow triggers reconciliation rather than dropping state silently. |
| Simple operations | At least 600 metadata-only rename/copy plan evaluations per minute per device, excluding transfer time and approval. |
| Preview | First 100 proposed plans within 10 seconds for a bounded 10,000-file preview on reference hardware. |
| Pause | A connected device acknowledges a remote pause within 5 seconds at p95; no new execution passes its next safe checkpoint afterward. |
| Progress freshness | Connected execution status is no more than 5 seconds behind durable local state at p95. |
| Journal durability | A committed step and its inverse metadata survive process or device restart once success is shown. |
| Control-plane availability | 99.9% monthly for the JRA/DSO facades plus Folder Autopilot profile, binding, assignment, projection, and audit APIs, excluding declared maintenance. |

Desktop enforces CPU, memory, disk, and concurrency budgets per assignment/JRA RecipeVersion. When limits are reached, JRA work queues or fails with a specific capacity reason; it does not expand scope or skip safety checks.

## 13. Observability and product success metrics

### Operational observability

- Structured logs include correlation ID, workspace, content-free binding/DeviceGrant IDs, JRA RecipeVersion, assignment, `jraJobId`, business projection, device, duration, and reason code. Canonical paths, local handles, file contents, and independent external-domain state copies are prohibited.
- OpenTelemetry spans cover preview creation, dispatch, local observation, stabilization, processing, approval wait, file operation, sync, and undo.
- Metrics include watcher health, queue depth/age, stabilization delay, files matched, classification review rate, approval latency, step latency, retries, collisions, stale plans, compensation attempts, undo success, sync lag, and disk-pressure pauses.
- Alerts cover watcher overflow without completed reconciliation, repeated path-containment failures, stuck staged operations, growing queue age, high failure/undo rate after a JRA RecipeVersion, revoked-device activity, and unexpected output recursion.
- Assignment health compares the current JRA RecipeVersion/profile combination with its predecessor and flags material shifts in match, approval, error, collision, and undo rates.

### Product success metrics

- At least 99.5% of eligible files reach a JRA terminal state plus an idempotent `HANDLED` or explained `EXCEPTION` business projection without duplicate output.
- Zero file operations occur outside an active DSO DeviceGrant whose digest matches both the AutopilotFolderBinding and Desktop-local authorization.
- At least 95% of successful file operations retain a valid undo path for the configured undo window, excluding actions explicitly disclosed as non-reversible.
- Median operator time spent per routine handled file decreases by at least 70% after a recipe’s first 30-day baseline.
- Fewer than 1% of auto-executed classifications are later corrected by an operator.
- At least 90% of failed executions expose a user-actionable stable reason code without support intervention.
- 100% of sensitive operations have a valid plan-bound approval or a recorded published policy allowing automatic execution.

Product analytics contain aggregate outcomes only. File names, paths, extracted values, and evidence are excluded unless the workspace separately enables diagnostic sharing for a bounded support case.

## 14. Acceptance and testing criteria

A release is acceptable when all P0 requirements pass and the following tests are automated or documented:

1. Desktop cannot create its encrypted local folder authorization without native picker confirmation and cannot access a sibling path by `..`, case variation, short name, junction, symlink, or reparse-point escape. DSO receives no path, and the resulting Folder Autopilot record contains only `deviceGrantId`, `role`, and `expectedCapabilityDigest`.
2. A cloud job containing a raw path/local handle, unknown typed action, invalid signature, expired assignment/DSO DeviceGrant, mismatched capability digest, or mismatched JRA RecipeVersion hash is rejected before file access.
3. A file written slowly is not processed until stable; repeated native watcher events yield exactly one execution.
4. Replacing a file at the same path with different bytes creates a new artifact version and execution key.
5. Preview accurately reports rename, copy, move, derivative, collision, required approval, and undo behavior for a Vietnamese-named fixture set.
6. A changed source or destination after approval invalidates the plan and prevents execution.
7. A destination collision never overwrites an existing file under `REVIEW`, `SKIP`, or unique-name policies.
8. Conversion creates a derivative while the original bytes and immutable artifact version remain unchanged.
9. A cross-volume move interrupted after copy recovers without duplicate visible success or source loss.
10. Device restart at every journal checkpoint results in completion, safe compensation, or an explained conflict.
11. Undo restores eligible rename/move operations and refuses to overwrite a later user edit.
12. Pausing a RecipeAssignment, retiring its JRA RecipeVersion, or revoking a bound DSO DeviceGrant prevents new work within the stated connected-device budget and preserves in-flight audit state without creating a feature-owned revocation or Job state.
13. Watcher overflow followed by reconciliation finds missed files without reprocessing completed content.
14. Local mode completes classification, file operations, audit, and undo with no file bytes, canonical paths, or extracted values sent to cloud.
15. Permission tests prove the folder-grant-alias route delegates authorization and lifecycle to DSO, recipe authoring/publication delegates to JRA, and unauthorized binding, assignment, approval, pause, retry, evidence, or undo actions fail closed.
16. Property and fuzz tests cover Desktop path containment, JRA typed-graph validation, DSO capability-digest matching, filename normalization, collision generation, idempotency, and journal recovery; persistence tests prove Folder Autopilot stores no path, independent grant/status/revocation, canonical recipe graph, or Job terminal state.
17. Web, Desktop, and Android critical review and approval paths meet WCAG 2.2 AA or native accessibility equivalents.
18. Job contract tests prove every asynchronous run stores `jraJobId` and pinned `resultManifestId`, that every business projection follows the documented JRA-state mapping idempotently, and that module retry/cancel/status routes cannot create an independent execution transition.
19. Data-mode tests prove an assignment `dataModeConstraint` can narrow but never broaden the DSO workspace maximum and becomes unusable when `effectiveDataModePolicyRef` is stale or revoked.
20. Retention tests prove constraints resolve to `effectiveRetentionPolicyRef`, Folder Autopilot cannot delete IAE bytes, and Desktop cache cleanup neither deletes nor reports deletion of the canonical artifact.

## 15. Delivery slices and future expansion

### Slice 1 — Safe folder watch

Desktop encrypted local folder authorization, DSO content-free DeviceGrant facade, AutopilotFolderBindings, file stabilization and fingerprinting, watcher reconciliation, simple inspect/validate/copy/rename/move actions, JRA recipe/version authoring facade, Folder Autopilot profile payload, preview, local journal, pause, audit, and Local mode.

### Slice 2 — Governed automation

Web JRA-recipe/Folder-Autopilot-profile editor, DSO-backed device assignment, classification and extraction, approval queues, Android approval, collision policies, derivative creation, recovery folders, undo, Hybrid synchronization, and health monitoring.

### Slice 3 — Module routing and scale

Typed intake actions for other DataBreeze modules, bulk review/retry, scheduled scans, resource policies, high-volume queueing, recipe comparison, redacted ledger export, and Cloud-mode content analysis.

### Future expansion

- Additional reviewed file inspectors, converters, and DataBreeze module routes.
- DSO-policy-approved network-share capabilities with explicit credentials, content-free grants, capability probes, and stricter recovery semantics.
- Signed JRA recipe-template plus Folder Autopilot profile exchange with compatibility checking and no embedded paths, DSO binding IDs, secrets, or executable code.
- Better calibrated local classifiers and on-device models behind provider-neutral interfaces.
- Time-bounded dual approval for narrowly defined non-reversible actions, only after a separate safety specification.

Future expansion must preserve Desktop-only local path ownership, DSO grant/data-mode authority, JRA recipe/job/approval authority, IAE retention authority, typed bounded actions, preview semantics, immutable evidence, auditability, and safe undo. It must never introduce arbitrary scripts or unrestricted PC control.
