# Jobs, Recipes, and Approvals

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.2 |
| Requirement prefix | `JRA` |
| Dependencies | `IAM` authorization; `IAE` immutable inputs/evidence; `DSM` immutable definitions; composed with `DSO` route decisions and `BUA` admission proposals by the application-layer `ExecutionAdmissionCoordinator` |

## Purpose

Define the durable orchestration model for repeatable recipes, signed typed jobs, local or cloud execution, human review, approval, retry, cancellation, and auditable side effects. PostgreSQL is the source of truth for work and approvals. Redis Streams is a replaceable dispatch accelerator and is never authoritative state.

## Scope and non-goals

### In scope

- Versioned recipes, triggers, typed actions, job graphs, steps, attempts, results, findings, reviews, and approvals.
- Cloud-worker and registered-Desktop dispatch using signed, capability-checked job envelopes.
- Durable state, transactional outbox/inbox, leases, idempotency, retries, cancellation, and compensation.
- Policy-driven review and approval, including separation of duties.
- Safe extension through schema-registered action types.

### Non-goals

- Arbitrary scripts, shell commands, unrestricted browser automation, or general remote PC control.
- Redis queues as the record of whether work exists or completed.
- Silent AI decisions for financial, destructive, external-sharing, publication, or platform-billing actions.
- Customer payment execution, funds transfer, withholding, reversal, or settlement.
- Mutating published recipe versions or rewriting job history.
- Exactly-once execution claims across external systems; DataBreeze provides effectively-once effects through idempotency and reconciliation.

## Concepts and components

- **Recipe:** stable named automation within a workspace.
- **Recipe version:** immutable graph of triggers and typed action definitions, including validated inputs, policies, and processor constraints.
- **Typed action:** allowlisted operation with versioned JSON Schema, declared input/output types, required capabilities, side-effect class, retry policy, and approval class.
- **Job:** server-registered durable execution instance pinned to one RecipeVersion or one direct typed action. Its canonical state and history exist in PostgreSQL.
- **Provisional execution:** device-local typed execution created while the control plane is unreachable. It has a client execution ID, immutable input/result manifests, and local status, but is not a Job and cannot claim canonical approval, publication, billing, or external-effect state until accepted by the server.
- **Job step:** one typed action invocation in the graph.
- **Attempt:** one leased execution of a step by a worker or device.
- **Review task:** human correction/confirmation requested for uncertain extraction or validation.
- **Approval request:** policy decision required before a gated action or publication.
- **Job result:** immutable output manifest linking artifact versions, datasets, evidence, findings, and side-effect receipts.
- **Outbox/inbox:** transactional delivery records for dispatch and callback deduplication.
- **Execution admission coordinator:** application-layer composition point outside the JRA domain. It gathers version-bound authorization, input, definition, route/capability, and entitlement/reservation decisions, then invokes JRA and BUA persistence through one modular-monolith unit of work.

### Components

- Recipe registry and schema validator.
- Trigger service and scheduler.
- Job state service in PostgreSQL.
- Transactional outbox relay.
- Redis Streams dispatcher with consumer groups.
- Device dispatch gateway using authenticated signed WebSocket messages.
- Python cloud worker and Desktop sidecar executors.
- Review queue and approval policy engine.
- Lease/retry/reconciliation service.
- Audit and progress-event publisher.

## Subsystem workflows

### Publish a recipe

1. An authorized user drafts a recipe from registered typed actions.
2. The server validates graph acyclicity, JSON Schemas, capability availability, data-mode rules, secrets references, retry safety, and approval coverage.
3. Publication creates an immutable RecipeVersion, canonical hash, canonical AUD AuditEvent, and signed `RecipePublicationEnvelope` that binds every action/schema/DSM dependency required for offline verification.
4. Edits create a new draft and version; existing jobs stay pinned to their original version.

### Create and dispatch a job

1. A trigger or authorized API call submits a workspace-scoped idempotency key and typed input references to the `ExecutionAdmissionCoordinator`.
2. The coordinator obtains version-bound IAM authorization, IAE input/placement, DSM definition, DSO execution-route/capability, and BUA entitlement/reservation decisions through their public application contracts.
3. One PostgreSQL unit of work invokes JRA to create the Job and ready JobSteps, invokes BUA to persist any required quota reservation, appends the canonical AUD AuditEvent, and inserts delivery/dispatch outbox messages. The outbox is not audit history, and JRA does not import DSO or BUA services.
4. JRA validates and records the supplied decision IDs, revisions, subject hash, and expiry; a stale or mismatched decision aborts the transaction.
5. The dispatcher publishes a job hint to Redis or the device gateway selected by the recorded route decision.
6. The executor claims a database-backed lease, verifies the signed envelope, fetches authorized inputs, and heartbeats.
7. Completion writes result manifests and the next state in PostgreSQL before acknowledgement. A missing Redis message is recoverable from ready rows and the outbox.

### Review and approval

1. An action emits a review need or reaches a policy-gated boundary.
2. The job enters `NEEDS_REVIEW` or `AWAITING_APPROVAL`; no gated downstream step is dispatchable.
3. Eligible users receive content-safe notifications and read the protected details from the application.
4. Review corrections create versioned extraction/output records.
5. Approval records the policy version, decision, actor, reason, evidence/result hash, and expiry.
6. Any material input, output, action, policy, or recipe change invalidates an unused approval.

### Retry, cancellation, and reconciliation

Transient failures retry only under the action's declared policy. An expired lease may be reclaimed with a new attempt ID. Effect-producing actions use an effect idempotency key and record receipts. Cancellation prevents new steps, requests cooperative cancellation of active steps, and runs only registered compensations; it never sends arbitrary undo code.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| JRA-001 | P0 | Every job and step state transition shall be durably committed in PostgreSQL; Redis Streams shall carry dispatch hints only and shall never be the source of truth. |
| JRA-002 | P0 | Job creation, ready-step creation, any required BUA quota reservation, canonical AUD AuditEvent append, and delivery/dispatch outbox insertion shall occur through the `ExecutionAdmissionCoordinator` in one database transaction and be idempotent by workspace plus caller key; an outbox record shall never substitute for the AuditEvent. |
| JRA-003 | P0 | Recipes and published recipe versions shall be immutable, content-hashed, and pinned by every job created from them. |
| JRA-004 | P0 | Executors shall accept only registered typed actions whose versioned schema, capability requirements, side-effect class, and handler digest match the signed envelope. |
| JRA-005 | P0 | DataBreeze shall not dispatch arbitrary scripts, shell commands, unrestricted URL navigation, arbitrary filesystem paths, or remote keyboard/mouse control. |
| JRA-006 | P0 | Every job envelope shall be workspace-bound, job/step/attempt-bound, expiry-bound, nonce-protected, and signed by the control plane; devices shall verify it before input access or execution. |
| JRA-007 | P0 | A worker or device shall claim a time-bounded lease before execution and use attempt-scoped heartbeats; stale completions from superseded attempts shall be rejected. |
| JRA-008 | P0 | Retried jobs and steps shall not duplicate artifacts, imports, reports, notifications, exports, external actions, or usage charges; effecting handlers shall use stable idempotency keys and receipts. |
| JRA-009 | P0 | Actions classified as destructive, external-sharing, platform-billing-provider-effecting, publication, or policy-sensitive shall require an unexpired approval when workspace policy says so. |
| JRA-010 | P0 | Approval eligibility shall use `IAM` at decision time and support separation of duties that prohibits the requester or executor from approving their own action. |
| JRA-011 | P0 | An approval shall bind the canonical hash of inputs, proposed effects, recipe version, action version, and policy version; any material change shall invalidate it. |
| JRA-012 | P0 | Job results shall be immutable manifests containing source ArtifactVersion IDs, output IDs and hashes, evidence coverage, handler/engine versions, attempt, reviewer, and approval state. |
| JRA-013 | P0 | The scheduler and dispatcher shall reconstruct all ready work from PostgreSQL after Redis loss, process restart, or outbox delay. |
| JRA-014 | P1 | Job states shall be `CREATED`, `QUEUED`, `WAITING_FOR_DEVICE`, `DISPATCHED`, `RUNNING`, `NEEDS_REVIEW`, `AWAITING_APPROVAL`, `SUCCEEDED`, `PARTIALLY_SUCCEEDED`, `FAILED`, `CANCEL_REQUESTED`, `CANCELLED`, or `EXPIRED`, with a documented transition table enforced by the domain layer. |
| JRA-015 | P1 | Recipe triggers shall include manual, schedule, artifact-created, folder-event, webhook, and approved API trigger types, each with deduplication and authorization context. |
| JRA-016 | P1 | Review and approval queues shall support assignee, eligible group, due time, escalation rule, reason, and immutable decision history. |
| JRA-017 | P1 | Progress events shall be monotonic per job, derive from committed state, and tolerate duplicate or out-of-order transport delivery. |
| JRA-018 | P1 | Cancellation and compensation shall use registered typed handlers, preserve originals and prior results, and expose partial-effect receipts for manual recovery. |
| JRA-019 | P1 | AI-assisted actions shall record provider/model/configuration versions and confidence, but deterministic validation and explicit approvals shall remain authoritative where required. |
| JRA-020 | P1 | A direct typed-action job shall meet the same schema, authorization, data-mode, approval, idempotency, and audit rules as a recipe job. |
| JRA-021 | P0 | Every executor shall isolate temporary source-derived data by tenant and job/attempt, encrypt it at rest, exclude it from telemetry and backup, enforce declared byte/retention limits, and verify cleanup or quarantine after success, cancellation, rejection, crash, and terminal failure. |
| JRA-022 | P0 | Every typed action shall declare an action risk class of `READ_ONLY`, `LOW`, `CONSEQUENTIAL`, or `RESTRICTED`; policy shall require online authorization and approval for `RESTRICTED` actions and shall invalidate an existing approval after any material change to its bound subject or effect. |
| JRA-023 | P0 | Processing workers shall claim leases, obtain inputs, send heartbeats, and commit results only through the authenticated internal worker API and job-bound object grants; they shall receive no PostgreSQL credential or workspace-enumeration capability. |
| JRA-024 | P0 | Offline Desktop work shall be recorded as a `ProvisionalExecution`, never as a canonical Job; synchronization shall re-authorize and idempotently register an accepted execution as one PostgreSQL Job linked by client execution ID, while rejected work remains locally quarantined and exportable when policy permits. |
| JRA-025 | P0 | `BILLING_PROVIDER_EFFECT` shall be reserved to the BUA adapter for DataBreeze's own subscription account; no feature, connector, or extension may register customer payment, funds-transfer, withholding, reversal, or settlement behavior without a separately approved product-boundary and safety specification. |
| JRA-026 | P0 | JRA shall own one canonical actionable `Finding` envelope unique by full applicable TenantScope plus source subsystem, finding type, and fingerprint, including immutable diagnostic-detail reference, severity, workflow state, assignment, evidence references, disposition, and history; DSM and feature modules shall own diagnostic detail and link it by `sharedFindingId` rather than creating competing workflow authority. |
| JRA-027 | P0 | JRA shall own the canonical `ReviewTask` envelope and state; resolution shall reference a versioned correction or disposition created through the subject-owning module contract, and no review completion shall count as an approval unless a distinct valid JRA ApprovalDecision also exists. |
| JRA-028 | P0 | JRA shall be the only authority for ApprovalPolicy, ApprovalRequest, and ApprovalDecision; a feature may expose an authorized facade and persist a subject binding/projection containing the JRA request ID, exact resource version, and subject hash, but shall not persist an independent decision or weaken eligibility, separation of duties, MFA, expiry, or invalidation. |
| JRA-029 | P0 | Every asynchronous feature run shall reference one canonical `jraJobId` and pinned JRA result manifest; JRA alone shall own dispatch, progress, cancellation, retry, and terminal execution state, while feature lifecycle state is an idempotent projection from committed JRA results/events with a documented mapping when states differ. |
| JRA-030 | P0 | Offline execution shall accept a cached RecipeVersion only with a supported signed RecipePublicationEnvelope binding workspace, recipe ID/version/hash, action definitions and handler/schema hashes, referenced DSM definition hashes, policy references, issue/offline-validity time, schema version, and signer/key version; cache encryption alone shall not establish authenticity. |
| JRA-031 | P0 | Cloud result commit shall use a two-command protocol. `PREPARE_RESULT`, while the exact latest lease and security epoch remain current, shall derive the descriptor-owned output policy and issue stable attempt/descriptor-bound IAE write capabilities without making the Job terminal. After IAE transfer and immutable-result attestation, `FINALIZE_RESULT` shall accept only a stable submission ID, attestation references, descriptor/attempt binding hash, and typed result-binding echo. JRA shall resolve attestations server-side, recheck the current latest attempt, lease, epoch, descriptor, action/output schema and exact subject bindings, then atomically insert the canonical ResultManifest, terminal Attempt/Job transitions, completion replay receipt, canonical AUD/outbox effects, and usage settlement in one serializable transaction. Identical retries shall return the stored completion; changed reuse shall conflict. The legacy completion path shall not issue output grants after committing success and shall not accept caller-asserted object references as authoritative. |
| JRA-032 | P0 | An admitted Job that can produce metered customer results shall carry exactly one opaque BUA `ResultUsageSettlementBinding` ID supplied by the server-owned `ExecutionAdmissionCoordinator`; the worker and browser shall never supply or alter it. JRA result preparation and immutable descriptors may carry that opaque ID but shall not copy or infer BUA reservation, meter, formula or quantity authority. `FINALIZE_RESULT` shall provide the stored ID and verified result facts to the injected BUA transaction participant and shall roll back ResultManifest, Attempt, Job, replay, AUD and outbox writes if settlement is missing, mismatched, unavailable or rejected. |

## Domain and data contracts

### Recipe and job records

```text
Recipe {
  id, workspaceId, name, status: DRAFT|ACTIVE|PAUSED|ARCHIVED,
  currentVersionId?, createdBy, revision
}

RecipeVersion {
  id, recipeId, version, canonicalHash, triggerDefinitions[],
  stepGraph, requiredCapabilities[], policyRefs[], publishedBy, publishedAt
}

RecipePublicationEnvelope {
  schemaVersion, workspaceId, recipeVersionId, recipeVersion,
  recipeCanonicalHash,
  actionRefs[]: {
    type, version, handlerDigest, inputSchemaHash, outputSchemaHash
  },
  dsmDefinitionRefs[]: { type, id, version, canonicalHash },
  policyRefs[]: { id, version, canonicalHash },
  issuedAt, offlineValidUntil,
  signingAlgorithm, signingKeyId, signature
}

TypedActionDefinition {
  type, version, inputSchemaId, outputSchemaId,
  handlerDigest, requiredCapabilities[],
  sideEffectClass: NONE|REVERSIBLE|EXTERNAL|DESTRUCTIVE|BILLING_PROVIDER_EFFECT,
  riskClass: READ_ONLY|LOW|CONSEQUENTIAL|RESTRICTED,
  defaultTimeoutSeconds, retryPolicy, approvalClass
}

Job {
  id, workspaceId, projectId?, recipeVersionId?, directAction?,
  idempotencyKey, state, priority, requestedBy,
  inputManifestHash, createdAt, startedAt?, finishedAt?, revision
}

JobStep {
  id, jobId, nodeKey, actionType, actionVersion, state,
  dependencyStepIds[], target: CLOUD|DEVICE, targetDeviceId?,
  maxAttempts, nextAttemptAt?, leaseOwner?, leaseExpiresAt?, revision
}

JobAttempt {
  id, jobStepId, ordinal, executorId, envelopeHash,
  startedAt, heartbeatAt, endedAt?, outcome?, errorCode?
}

ProvisionalExecution {
  clientExecutionId, deviceId, workspaceId, recipeVersionId,
  inputManifestHash, authorizationSnapshotId, entitlementLeaseId,
  localStatus: CREATED_LOCAL|RUNNING_LOCAL|COMPLETED_LOCAL|
      BLOCKED_ONLINE_APPROVAL|AWAITING_SYNC|QUARANTINED,
  resultManifestHash?, localEventLogHash, createdAt, completedAt?
}
```

`ProvisionalExecution` is a local contract, not a PostgreSQL Job row. On accepted synchronization, one server transaction deduplicates `clientExecutionId`, creates the canonical Job, records a valid canonical transition history and imported-offline attempt metadata, validates the immutable result, appends the canonical AUD AuditEvent, writes usage and delivery outbox records, and returns the Job ID. A rejected execution never receives a Job ID.

### Approval records

```text
ApprovalPolicy {
  id, workspaceId, version, actionMatcher,
  minimumApprovals, eligibleRoles[], selfApprovalAllowed,
  expiresAfterMinutes, requireMfa, conditions
}

ApprovalRequest {
  id, workspaceId,
  subjectRef: { type, id, version, hash }, requestedAction,
  jobId?, jobStepId?, policyId, policyVersion,
  status: OPEN|APPROVED|REJECTED|EXPIRED|CANCELLED,
  requestedBy, dueAt?, revision
}

ApprovalDecision {
  id, approvalRequestId, actorId,
  decision: APPROVE|REJECT, reason?, mfaAssertionId?,
  subjectHash, decidedAt
}
```

Approval is satisfied only by distinct active eligible users and the configured minimum. Revoked memberships make undecided eligibility disappear but do not rewrite historical decisions; the policy engine re-evaluates whether remaining decisions still satisfy policy before dispatch.

Every ApprovalRequest has exactly one canonical `subjectRef`; `jobId` and `jobStepId` are optional execution links, not the subject authority. Reports, waivers, packages, forms, definitions, and other non-job resources therefore use the same policy/decision model without inventing module-owned approval records.

### Finding and review records

```text
Finding {
  id, workspaceId, projectId?, fingerprint,
  sourceSubsystem, sourceDetailRef: { type, id, version, hash },
  findingType, severity, confidenceBand?, evidenceReferenceIds[],
  state: OPEN|ACKNOWLEDGED|IN_REVIEW|RESOLVED|DISMISSED|SUPPRESSED,
  assigneePrincipalId?, dueAt?, dispositionCode?,
  resolutionDetailRef?, firstSeenAt, lastSeenAt, revision
}

ReviewTask {
  id, workspaceId, projectId?, findingId?,
  subjectRef: { type, id, version, hash },
  reviewKind, reasonCodes[], evidenceReferenceIds[],
  state: OPEN|ASSIGNED|IN_PROGRESS|COMPLETED|RETURNED|CANCELLED|EXPIRED,
  assigneePrincipalId?, eligibleGroupId?, dueAt?,
  resolutionDetailRef?, resolvedBy?, resolvedAt?, revision
}
```

Finding uniqueness includes `organizationId` through TenantScope and `projectId` whenever the subject is project-scoped; a matching fingerprint in another project never merges occurrence, assignment, visibility, or disposition.

The source subsystem owns immutable diagnostic and correction details. JRA owns only the actionable envelope and its workflow history. A module-specific UI or API may call the JRA application contract as a facade, but the module does not store an independent actionable state, assignee, disposition, review result, or approval decision. Comments remain NCO collaboration records linked to the JRA or module subject.

### Signed job envelope

```text
JobEnvelope {
  schemaVersion, jobId, stepId, attemptId, workspaceId,
  action: { type, version, handlerDigest },
  inputRefs[], outputPolicy, capabilityGrantIds[],
  idempotencyKey, issuedAt, expiresAt, nonce, controlPlaneKeyId, signature
}
```

The envelope carries references, not secrets or unrestricted paths. Executors exchange secret references for narrowly scoped values only when authorized.

### State transitions

- `CREATED -> QUEUED`
- `QUEUED -> WAITING_FOR_DEVICE|DISPATCHED|CANCEL_REQUESTED`
- `WAITING_FOR_DEVICE -> QUEUED|CANCEL_REQUESTED|FAILED|EXPIRED`
- `DISPATCHED -> RUNNING|QUEUED|CANCEL_REQUESTED|FAILED`
- `RUNNING -> NEEDS_REVIEW|AWAITING_APPROVAL|SUCCEEDED|PARTIALLY_SUCCEEDED|FAILED|CANCEL_REQUESTED`
- `NEEDS_REVIEW -> QUEUED|FAILED|CANCEL_REQUESTED`
- `AWAITING_APPROVAL -> QUEUED|FAILED|CANCEL_REQUESTED`
- `CANCEL_REQUESTED -> CANCELLED|FAILED`

Terminal states are immutable. A retry creates a new job or a new attempt according to action policy; it does not move a terminal job backward.

## Permissions, security, and privacy

- Job creation requires permission for the action and all referenced inputs. Execution rechecks workspace/resource authorization and device status.
- Job input references are least-privilege, short-lived, and bound to the attempt. Workers cannot enumerate a workspace.
- Device capability grants restrict typed action, approved folder handle, object set, maximum bytes, and expiry.
- Approval details are visible only to eligible users with access to the underlying resources. Notification transports receive no sensitive source content.
- Signed-envelope keys rotate with overlapping verification windows. Revoked control-plane keys or devices cannot claim new leases.
- Recipe-publication signing keys and verification bundles rotate with explicit key IDs, overlap, revocation metadata, and bounded offline-validity times. Desktop verifies the full canonical envelope and every referenced hash before a provisional execution; encrypted cache storage provides confidentiality, not authenticity.
- Logs and progress messages exclude source text, local paths, secrets, credentials, full external payloads, and evidence snippets.
- Recipe secrets are references to an encrypted secret store and are never embedded in recipe JSON or job envelopes.
- Working directories and checkpoints follow the temporary-processing lifecycle in the security architecture. A cleanup failure quarantines the attempt, emits a safe operational alert, and blocks directory reuse.

## Offline, failure, and recovery

- Desktop may create a ProvisionalExecution only from a locally available signed published RecipeVersion and valid offline authorization/entitlement leases. Each receives a device-generated client execution UUID and idempotency key; it is never presented as a server Job.
- Provisional execution writes an append-only local event log and immutable result manifest. Synchronization revalidates authorization, recipe version, entitlement, data mode, inputs, effects, and approval requirements before atomically registering one canonical Job.
- A provisional action that requires online approval stops at local status `BLOCKED_ONLINE_APPROVAL`. After accepted registration, the canonical Job enters `AWAITING_APPROVAL`; cached roles never create an approval.
- Loss of Redis is non-disruptive to durable state; an outbox sweeper and ready-step scanner republish dispatch hints.
- Worker crash causes lease expiry and a new attempt. Non-idempotent external effects enter `FAILED` with a reconciliation task unless a receipt proves the effect outcome.
- If a target device is offline, jobs remain `WAITING_FOR_DEVICE` until policy timeout, reassignment, cancellation, or device revocation.
- Revoking a device cancels unclaimed envelopes for it and prevents new leases; running results require reconciliation and signature validation.
- Control-plane restoration regenerates dispatch from PostgreSQL and never trusts Redis consumer offsets as job state.

## APIs, events, and extension points

### REST resources

- `GET|POST /v1/workspaces/{workspaceId}/recipes`
- `POST /v1/recipes/{recipeId}/versions`
- `POST /v1/recipe-versions/{versionId}/publish`
- `POST /v1/workspaces/{workspaceId}/jobs`
- `GET /v1/jobs/{jobId}`, `GET /v1/jobs/{jobId}/steps`
- `POST /v1/jobs/{jobId}/cancel`, `POST /v1/jobs/{jobId}/retry`
- `GET /v1/workspaces/{workspaceId}/reviews`
- `POST /v1/reviews/{reviewId}/resolve`
- `GET /v1/workspaces/{workspaceId}/findings`
- `GET /v1/findings/{findingId}`, `PATCH /v1/findings/{findingId}`
- `GET /v1/workspaces/{workspaceId}/approvals`
- `POST /v1/approvals/{approvalId}/decisions`
- Internal executor endpoints for lease claim, heartbeat, progress, completion, and receipt reconciliation

All commands use idempotency keys; revisioned decisions use `If-Match`. Completion accepts one immutable result manifest per attempt and rejects mismatched envelope or lease data.

### Events

`recipe.version.published`, `job.created`, `job.state_changed`, `job.step.ready`, `job.progressed`, `finding.opened`, `finding.state_changed`, `job.review.requested`, `review.resolved`, `approval.requested`, `approval.decided`, `approval.invalidated`, `job.succeeded`, `job.failed`, and `job.cancelled`.

Events are produced by the PostgreSQL outbox. Consumers deduplicate by event ID and use aggregate revision to ignore stale delivery.

### Extension points

- Typed-action registry loaded from signed packages at deployment, not user-uploaded executable code.
- Trigger adapters that emit a normalized trigger with tenant, actor, source event, and deduplication key.
- Executor adapters for cloud Python workers and Desktop JSON-RPC sidecars.
- Approval condition evaluator with a constrained declarative expression language over validated metadata; no arbitrary code.

## Performance and capacity budgets

- Job creation: p95 under 300 ms.
- Ready-step dispatch hint: p95 under two seconds and p99 under ten seconds when an eligible executor is online.
- Progress commit-to-client event: p95 under two seconds; correctness does not depend on live progress.
- Lease heartbeat interval: 15 seconds; normal lease expiry: 60 seconds; long actions may renew without changing attempt ID.
- Support at least 100,000 queued jobs per organization, 1,000-step recipe graphs, and 10,000 concurrently running steps per control-plane deployment.
- Job history and result manifests remain queryable for the workspace retention period; large logs and outputs are artifact versions, not unbounded database columns.

## Observability and metrics

- Jobs created, queue age, dispatch lag, wait-for-device duration, running duration, outcome, and retry count by typed action/version and target class.
- Lease expiries, stale completions, idempotency deduplications, outbox age, Redis replay count, and reconciliation backlog.
- Review and approval request age, decision latency, rejection rate, expiry rate, self-approval denials, and invalidations.
- Result evidence coverage, processor version, deterministic-validation failures, and AI confidence bands.
- Structured traces join trigger, job, step, attempt, executor, artifact version, approval, and correlation IDs without source content.

## Acceptance and testing

- State-machine tests reject every undocumented transition and prove terminal immutability.
- Transaction tests crash between job insert, outbox insert, Redis publish, lease claim, result commit, and acknowledgement, then prove no job is lost.
- Redis-loss tests delete all stream state and reconstruct the same ready work from PostgreSQL.
- Idempotency tests repeat job creation, callbacks, completion, exports, notifications, and simulated external effects.
- Security tests tamper with signatures, schemas, action versions, handler digests, tenant IDs, nonces, expiry, folder grants, and device identity.
- Approval tests cover quorum, separation of duties, role revocation, policy change, input change, expiry, rejection, and concurrent decisions.
- Admission-composition tests prove stale or mismatched IAM, IAE, DSM, DSO, or BUA decisions abort atomically, and a concurrent replay creates one Job, at most one quota reservation, and one logical outbox set without direct cross-domain service imports.
- Action-registry tests reject `BILLING_PROVIDER_EFFECT` outside the BUA subscription adapter and reject every customer payment or funds-transfer handler.
- Finding/review tests deduplicate actionable envelopes by source fingerprint, retain every immutable diagnostic-detail version, enforce legal states and assignment permissions, require a valid owning-module resolution reference, and prove review completion cannot satisfy an ApprovalRequest.
- Approval-authority contract tests exercise every module facade and prove it creates or decides the same JRA request, cannot create a second module decision, and rejects mismatched subject version/hash, ineligible actors, stale MFA, expired requests, self-approval, and material changes.
- Risk-policy tests cover every action risk class, online/MFA enforcement for Restricted actions, and approval invalidation after each defined material-change category.
- Temporary-data tests crash and cancel executors with open spill files, then prove tenant isolation, encryption, size/expiry enforcement, startup scavenging, cleanup alerting, and checkpoint binding.
- Desktop-offline tests execute allowed local recipes, stop at cloud approval, and synchronize one result.
- Recipe-publication tests tamper with the graph, canonical hash, action handler/schema hashes, DSM definitions, policy references, workspace, validity time, schema version, signer, and cached verification bundle; Desktop rejects each mismatch even when the local cache remains encrypted.
- Offline-registration tests prove a provisional execution has no canonical Job ID or state before acceptance, concurrent replay creates exactly one Job, a rejected execution is quarantined without a Job, and accepted history links the original device/client execution ID and immutable manifests.
- Golden fixtures prove equivalent material outputs and evidence contracts from cloud and Desktop Python engine handlers.

## Delivery and expansion

1. **Foundation release:** manual/artifact/folder triggers, immutable recipes, core typed actions, PostgreSQL jobs/outbox, Redis dispatch, Desktop dispatch, review, one-approver policies, and complete audit history.
2. **Automation release:** schedules, declarative branching, multi-approver quorum, escalation, compensation handlers, and operational reconciliation.
3. **Expansion:** approved webhook triggers, customer-defined declarative validation actions, and additional worker pools may be added without allowing arbitrary code or making transport state authoritative.
