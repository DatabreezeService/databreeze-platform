# Identity, Workspaces, and Permissions

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.1 |
| Requirement prefix | `IAM` |
| Dependencies | Platform architecture baseline; all other specifications depend on this specification |

## Purpose

Define the identity, tenant hierarchy, membership, session, device identity, and authorization model used by every DataBreeze surface and service. The model is deny-by-default, Vietnamese-first, multi-tenant, and consistent across REST, event streams, WebSockets, background workers, local-device synchronization, downloads, exports, and shared links.

## Scope and non-goals

### In scope

- Human accounts, service accounts, sessions, MFA, recovery, and device identity.
- The hierarchy `User -> Organization -> Workspace -> Project/Client`.
- Membership lifecycle, initial roles, resource-level authorization, and policy evaluation.
- Invitation, ownership transfer, account deactivation, and tenant-safe audit records.
- Authentication through email/password with six-digit OTP verification, Google OIDC, and configured OIDC providers without coupling the domain model to one provider.
- Customer-visible Owner/Editor/Viewer access presets and independent workspace agent grants that never expand dataset or action permission.

### Non-goals

- Building a general-purpose identity provider.
- Allowing a role name alone to grant access without tenant and resource checks.
- Cross-organization data sharing through implicit membership.
- Authentication by long-lived bearer tokens stored in browser or application plaintext.
- Bypassing approval, retention, or legal-hold policies because a user is an Owner.

## Concepts and components

### Identity hierarchy

- A **User** is a global human identity with a stable UUID, normalized email identities, locale, and security state.
- An **Organization** is the billing, policy, and ownership boundary. A personal account receives a personal organization governed by the same rules as a team organization.
- A **Workspace** is the primary data-isolation and authorization boundary. Data mode, retention, device, and processing policies are set here.
- A **Project** groups work inside one workspace. A project may represent a client, engagement, location, or internal initiative.
- A **Membership** binds one principal to one organization, workspace, or project and carries one role plus optional time bounds.
- A **Service account** belongs to one organization, is explicitly scoped to workspaces and actions, and cannot sign in interactively.
- A **Device identity** is an IAM-owned, organization-scoped enrollment for one Desktop or Android installation and user. It has one public key, security epoch, activation state, and permanent revocation lifecycle; DSO references its ID for capabilities, grants, health, routing, synchronization, and transfer.
- An **Offline authorization snapshot** is an IAM-issued, Device-bound, signed, expiring statement of already authorized offline-capable actions and resource scopes. It is narrower than current online access and never substitutes for server reauthorization.

### Initial roles

| Role | Intended authority |
|---|---|
| Owner | Organization ownership, billing, destructive administration, ownership transfer, and all Admin capabilities |
| Admin | Members, devices, security policies, workspace configuration, recipes, and audit access |
| Analyst | Data intake, extraction, analysis, findings, recipes, and report creation |
| Operator | Capture, run approved recipes, handle routine review, and resolve assigned exceptions |
| Approver | Review and approve policy-gated actions or report publication |
| Viewer | Read approved artifacts, reports, and dashboards within assigned scope |

Roles are permission bundles, not authorization decisions. Every request also requires an active membership, matching organization/workspace/project scope, resource visibility, data-mode compatibility, and applicable policy conditions.

The normal customer UI exposes Owner, Editor, and Viewer access presets. Those presets map to the six canonical server roles and versioned permission constants. Preset mapping is explicit, versioned, and deny-by-default. Presets are presentation metadata; the six server roles remain the policy-enforcement vocabulary.

Workspace agent authority is an independent member grant with levels `NONE`, `ANALYZE`, `PROPOSE_CHANGES`, and `APPLY_CONFIRMED_CHANGES`. Viewer defaults to `NONE`. A grant never expands dataset or action permission beyond the member's current authority.

### Authentication and authorization services

- **Identity service:** account records, identities, recovery, and security state.
- **Session service:** short access sessions, rotating refresh-token families, logout, and revocation.
- **MFA service:** organization policy, authenticator enrollment, recovery codes, and step-up challenges.
- **Tenant service:** organizations, workspaces, projects, membership, and invitations.
- **Authorization service:** one shared policy engine and generated permission constants used by API guards, workers, and clients.
- **Offline authorization issuer:** creates and verifies signed, versioned, maximum-24-hour snapshots from current membership, security/authorization epochs, resource policies, and Device identity.
- **Device identity service:** organization-scoped Device identity IDs, public keys, enrollment challenges, activation, security epochs, and permanent revocation. It does not own capabilities, workspace grants, health, routing, synchronization, or transfer state.
- **AUD append client:** records canonical immutable security and administration events with actor, target, decision, and correlation identifiers in the shared Audit Ledger.

## Subsystem workflows

### Email/password registration with OTP

1. The client submits email, password, and password confirmation. Public responses never disclose whether the email already owns an account.
2. The server creates a bounded unverified registration challenge and delivers a six-digit OTP. Only protected challenge material is stored.
3. The OTP expires in 10 minutes, permits five failed attempts, and may be resent after 60 seconds.
4. Successful verification atomically activates the user, personal organization, personal workspace, Owner membership, and a refresh family, then signs the user in.
5. Unverified registrations expire and are removed according to the declared retention policy.

### Google OIDC linking

1. Google Authorization Code with PKCE returns a provider-verified issuer, subject, normalized email, email-verification flag, and authentication time. Provider access tokens never reach clients.
2. A verified Google email that matches an existing password identity requires a current authenticated session, correct password, or valid email OTP before link creation.
3. The server never merges accounts silently.

### Sign-in and session rotation

1. The client authenticates with an enabled identity method.
2. The server evaluates account state, organization MFA policy, risk signals, and requested scope.
3. After required MFA, the server issues an access token of at most 15 minutes and a single-use refresh token in a server-tracked token family.
4. Refresh rotates both tokens. Reuse of an already-consumed refresh token revokes the entire family and records a security event.
5. Web refresh families expire after 30 days of inactivity and 180 days absolute. Desktop and Android refresh families expire after 90 days of inactivity and 365 days absolute. Recovery, suspension, logout-all, device revocation, or compromise revokes the family.
6. A step-up MFA assertion is valid for 10 minutes for ownership transfer, data deletion, key management, billing changes, and security-policy changes.

Browser refresh credentials use `HttpOnly`, `Secure`, and `SameSite=Lax` cookies. Desktop and Android refresh credentials are bound to a registered device and stored only in the OS credential vault or Keystore. There is no Keep me signed in checkbox; persistent appearance follows the refresh-family policy above.

### Device identity enrollment and revocation

1. An authenticated user with recent MFA requests a five-minute, single-use IAM enrollment challenge for one organization and installation.
2. The client generates an organization-specific non-exportable signing key, signs the challenge and canonical installation claim, and submits the public key.
3. IAM verifies membership, challenge freshness, proof of possession, organization device limit, and key policy, then creates a `PENDING` DeviceIdentity and appends the canonical AUD event in the same transaction.
4. The user explicitly activates that exact identity. IAM changes it to `ACTIVE`, increments its security epoch, appends the AUD event, and exposes the identity ID to DSO for separately authorized capabilities and workspace grants.
5. Revocation is permanent. IAM changes the identity to `REVOKED`, increments its security epoch, revokes its token families, appends the AUD event, and publishes `iam.device.revoked`; recovery always enrolls a new DeviceIdentity.

### Organization and workspace creation

1. An authenticated user creates or receives a personal organization.
2. Organization creation atomically creates an Owner membership and audit event.
3. A permitted Owner or Admin creates a workspace, chooses `LOCAL`, `HYBRID`, or `CLOUD`, and receives a default private project; the application transaction asks DSO to publish the initial immutable WorkspaceDataModePolicyVersion and records only its IDs/projection on Workspace.
4. The system provisions default policies without creating sample customer data or granting access to other members.

### Invitation and membership change

1. An Owner or Admin specifies email, scope, role, and a maximum seven-day invitation expiry.
2. The service validates role-delegation limits and emits a single-use, hashed invitation token.
3. Acceptance binds the authenticated identity after exact normalized-email verification.
4. Role changes and removals increment the authorization epoch for the affected scopes, revoke cached grants, and terminate now-invalid streams and share sessions.

### Ownership transfer

Ownership transfer requires recent MFA from the current Owner, an eligible active organization member, explicit acceptance by the recipient, and a seven-day signed transfer request. Completion is transactional and cannot leave an organization without an Owner.

### Authorization decision

Every protected operation supplies `principal`, `action`, `organizationId`, `workspaceId`, optional `projectId`, `resourceType`, `resourceId`, channel, device, and request context. The policy engine verifies:

1. Valid subject and session or device credential.
2. Active membership at the required scope.
3. Role permission for the action.
4. Resource ownership and visibility in the same tenant.
5. Workspace policy, approval, data-mode, and device constraints.
6. Explicit denies, suspension state, and recent-MFA requirements.

The evaluated tenant identifiers come from trusted server-side resource lookup; a client-supplied `workspaceId` never proves resource ownership.

### Issue an offline authorization snapshot

1. An online registered Device requests a snapshot for exact workspace/project, resource selectors, and action types that the product marks offline-capable.
2. IAM evaluates current principal, membership, Device, security and authorization epochs, resource policies, DataMode, and maximum offline duration.
3. IAM removes actions requiring online authority, binds the remaining scope to the Device and policy revisions, signs the canonical snapshot, and expires it within 24 hours.
4. The client verifies schema, signer/key version, signature, Device, scope, epochs, and expiry before local use. Encryption of the cached snapshot protects confidentiality but does not establish authenticity.
5. Every reconnect, sync, imported provisional result, or server command is fully re-authorized against current state. The snapshot can never broaden newly reduced access.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| IAM-001 | P0 | Every user, organization, workspace, project, membership, service account, session, and device shall use a non-guessable stable UUID and store timestamps in UTC. |
| IAM-002 | P0 | The server shall enforce organization, workspace, project, resource, action, and channel authorization on every request, stream subscription, job execution, sync mutation, download, export, and shared-link access. |
| IAM-003 | P0 | Authorization shall deny by default and shall not trust role, tenant, or resource claims supplied outside a verified credential and server-side lookup. |
| IAM-004 | P0 | The initial roles shall be Owner, Admin, Analyst, Operator, Approver, and Viewer; permission constants shall be versioned independently so bundles can expand without renaming roles. |
| IAM-005 | P0 | Access tokens shall expire within 15 minutes; refresh tokens shall be rotating and single-use, and detected reuse shall revoke the token family. |
| IAM-006 | P0 | Organization policy shall support required MFA for all members, privileged roles, or privileged actions, with WebAuthn or TOTP and one-time recovery codes. |
| IAM-007 | P0 | Each organization enrollment on a Desktop or Android installation shall create a distinct asymmetric Device-identity key pair; private keys shall remain in the OS credential store and server records shall be independently and permanently revocable. |
| IAM-008 | P0 | Membership removal, device revocation, account suspension, and ownership changes shall invalidate server-side and connected-client authorization within 60 seconds and reject newly authenticated operations immediately; an offline device receives no remote-wipe guarantee and its narrowly allowed cached authorization shall expire within 24 hours. |
| IAM-009 | P0 | Resource lookup shall prove that the resource belongs to the evaluated workspace before a handler reads metadata or object bytes, preventing identifier-based tenant probing. |
| IAM-010 | P0 | Invitations shall be single-use, hashed at rest, email-bound, scope-bound, role-bound, and expire in no more than seven days. |
| IAM-011 | P0 | An organization shall always have at least one active Owner; the last Owner cannot leave or be removed without a completed transfer or organization deletion workflow. |
| IAM-012 | P0 | Privileged actions shall require a step-up MFA assertion no older than 10 minutes and an immutable audit event containing actor, target, before/after summary, IP class, device, and correlation ID. |
| IAM-013 | P0 | Service accounts shall be organization-owned, workspace-scoped, action-scoped, non-interactive, and authenticated with hashed rotating secrets or signed keys that show their last-use time. |
| IAM-014 | P1 | Project membership may only narrow workspace access unless an explicit project guest policy grants access to that project alone; it shall never imply access to sibling projects. |
| IAM-015 | P1 | Account recovery shall revoke all refresh-token families and require MFA re-enrollment confirmation before privileged actions resume. |
| IAM-016 | P1 | User locale shall default to Vietnamese (`vi-VN`) while allowing English (`en`) per user without changing stored business values or audit semantics. |
| IAM-017 | P1 | Client applications may use permission hints to hide controls, but all authoritative enforcement shall remain server-side. |
| IAM-018 | P1 | Bulk membership and policy changes shall use idempotency keys, return per-item outcomes, and never partially apply an ownership transfer. |
| IAM-019 | P0 | Every tenant-owned record and repository operation shall declare either organization or workspace scope, validate the complete tenant ancestry for nested resources, and reject optional, missing, or mismatched tenant filters before data access. |
| IAM-020 | P0 | IAM shall issue versioned signed OfflineAuthorizationSnapshots bound to organization/workspace/project, principal, Device, security and authorization epochs, allowed action/resource scopes, policy revisions, issue time, expiry no later than 24 hours, and signer/key version; a snapshot shall not authorize approval, membership, security/data-mode/retention/billing policy change, deletion, cloud/external effects, or access broader than the last online decision, and every reconnect shall re-authorize current state. |
| IAM-021 | P0 | IAM shall be the sole authority for DeviceIdentity ID, organization/user ownership, public key, enrollment challenge, activation status, security epoch, and permanent revocation; a revoked identity shall never reactivate, recovery shall create a new identity, and DSO shall reference the IAM identity without maintaining a second identity, key, or authoritative status. |
| IAM-022 | P0 | Email/password registration shall use a six-digit OTP that expires in 10 minutes, permits five failed attempts, permits resend after 60 seconds, stores only protected challenge material, avoids account enumeration, and atomically activates the user, personal organization, personal workspace, Owner membership, and session after verification. |
| IAM-023 | P0 | Access tokens shall remain at most 15 minutes; rotating refresh families shall expire after 30 days of Web inactivity and 180 days absolute, or 90 days of Desktop/Android inactivity and 365 days absolute; reuse, recovery, suspension, logout-all, device revocation, or compromise shall revoke the family; browser credentials shall remain `HttpOnly`, `Secure`, and `SameSite=Lax`. |
| IAM-024 | P0 | Agent authority shall be an independent workspace-member grant with `NONE`, `ANALYZE`, `PROPOSE_CHANGES`, or `APPLY_CONFIRMED_CHANGES`; Viewer shall default to `NONE`; grants shall never expand dataset or action permission. |
| IAM-025 | P0 | The normal UI shall expose Owner, Editor, and Viewer access presets while the six canonical server roles and versioned permission constants remain available to policy enforcement; preset mapping shall be explicit, versioned, and deny-by-default. |

## Domain and data contracts

### Core records

```text
User {
  id, status: ACTIVE|LOCKED|SUSPENDED|DEACTIVATED,
  displayName, locale, createdAt, securityEpoch
}

Organization {
  id, name, slug, status, personal, ownerMembershipId,
  authPolicyId, billingAccountId, createdAt
}

Workspace {
  id, organizationId, name, status,
  dataModePolicyId, currentDataModePolicyVersionId,
  dataModeProjection: LOCAL|HYBRID|CLOUD,
  iaeRetentionPolicyId, authorizationEpoch, createdAt
}

Project {
  id, workspaceId, kind: INTERNAL|CLIENT|LOCATION|ENGAGEMENT,
  name, status: ACTIVE|ARCHIVED, createdAt
}

Membership {
  id, principalType: USER|SERVICE_ACCOUNT, principalId,
  organizationId, workspaceId?, projectId?,
  role, status: INVITED|ACTIVE|SUSPENDED|REMOVED,
  startsAt?, expiresAt?, createdBy, revision
}

DeviceIdentity {
  id, userId, organizationId, platform: WINDOWS|ANDROID,
  publicKey, keyAlgorithm, status: PENDING|ACTIVE|REVOKED,
  installationIdHash?, enrolledAt, activatedAt?, revokedAt?,
  securityEpoch, revision
}

OfflineAuthorizationSnapshot {
  id, schemaVersion,
  organizationId, workspaceId, projectId?,
  principalType, principalId, deviceId,
  principalSecurityEpoch, workspaceAuthorizationEpoch,
  allowedActions[], resourceScopeSelectors[],
  policyRevisions, issuedAt, expiresAt,
  signingKeyId, signature
}
```

`DeviceIdentity` is organization-scoped and is IAM's sole identity/key/status record. A physical installation used in multiple organizations maintains a distinct identity and key for each one. DSO stores operational projections keyed by `iamDeviceId`; its capabilities and workspace grants can only narrow an active IAM identity and cannot activate, revoke, or recreate one.

Membership scope is exactly one of organization, workspace, or project. Database constraints reject cross-tenant foreign keys. Authorization decisions return `ALLOW` or a stable denial code plus `policyVersion`; public responses map sensitive denial details to `NOT_FOUND` where existence would leak.

Organization-level membership, billing, verified-domain, and global-policy records use `organizationId` as their primary tenant scope. Artifact, dataset, job, report, and other workspace content use `organizationId` plus `workspaceId`; project resources additionally carry `projectId`. Organization-wide administration reads workspace information through explicit organization-scoped projections rather than an unscoped workspace repository.

DSO owns the immutable WorkspaceDataModePolicyVersion and signed DataModePolicyManifest; `dataModeProjection` is a content-safe IAM/UI projection and cannot authorize placement, processing, or synchronization. IAE owns effective retention/deletion policy; `iaeRetentionPolicyId` is a foreign contract reference and IAM does not evaluate deletion eligibility.

### Permission naming

Permissions use `domain.resource.action`, for example `artifact.original.download`, `job.approve`, `device.revoke`, and `billing.manage`. New permissions default to no role until explicitly mapped in a reviewed policy migration.

## Permissions, security, and privacy

- Password verifiers, OIDC secrets, refresh tokens, invitation tokens, recovery codes, and service-account secrets are hashed or encrypted with separated keys and never logged.
- Rate limits apply per IP class, identity, organization, and device; lockout uses progressive delays without revealing whether an email exists.
- Security-sensitive endpoints reject stale authorization epochs and enforce CSRF protection for cookie-authenticated browser mutations.
- Device signatures cover method, canonical path, body hash, timestamp, nonce, and device ID. Nonces are rejected after first use; clock skew tolerance is five minutes.
- OfflineAuthorizationSnapshot signatures cover the canonical full snapshot. Clients trust only supported schemas and active/overlap verification keys; cache encryption does not replace signature verification.
- Workspace membership never grants access to another workspace in the same organization unless an organization-level membership explicitly includes the needed permission.
- Support personnel have no standing artifact access. Time-limited support access requires customer authorization, reason, recent MFA, and complete audit logging.
- Audit payloads contain identifiers and redacted change summaries, not source-document text, secrets, or notification content.

## Offline, failure, and recovery

- Desktop and Android may cache only an IAM-signed OfflineAuthorizationSnapshot for operations explicitly marked offline-capable. It expires within 24 hours, is Device-bound, and is rechecked locally for action/resource scope and policy revisions before every use.
- Offline denial is final; offline allowance creates a pending audit record and is revalidated at synchronization. Server rejection quarantines the local result without deleting it.
- Membership and device changes are server-authoritative and cannot be made offline.
- If the authorization service is unavailable, protected mutations fail closed. Read-only local access may continue only for already-encrypted local data and a valid offline snapshot.
- Recovery from a lost device revokes its device identity and token families. Data already stored on that device remains protected by platform encryption and is outside remote-wipe guarantees.
- Database restoration must preserve security epochs, token-family revocations, and audit ordering; a restored system increments a global credential epoch before accepting refresh tokens.

## APIs, events, and extension points

### REST resources

- `POST /v1/auth/sessions`, `POST /v1/auth/sessions/refresh`, `DELETE /v1/auth/sessions/{id}`
- `POST /v1/auth/mfa/enroll`, `POST /v1/auth/mfa/challenge`, `POST /v1/auth/recovery`
- `GET|POST /v1/organizations`, `PATCH /v1/organizations/{organizationId}`
- `GET|POST /v1/organizations/{organizationId}/workspaces`
- `GET|POST /v1/workspaces/{workspaceId}/projects`
- `GET|POST|PATCH|DELETE /v1/.../memberships`
- `POST /v1/invitations/{token}/accept`
- `POST /v1/organizations/{organizationId}/ownership-transfers`
- `POST /v1/devices/enrollment-challenges`, `POST /v1/devices/enroll`, `POST /v1/devices/{deviceId}/activate`, `GET /v1/organizations/{organizationId}/devices`, `POST /v1/devices/{deviceId}/revoke`
- `POST /v1/authorization/check` for trusted internal batch checks only
- `POST /v1/workspaces/{workspaceId}/offline-authorization-snapshots`

Mutations accept `Idempotency-Key` and `If-Match` where a revision exists. Pagination is cursor-based.

### Domain events

`identity.user.security_epoch_changed`, `iam.membership.changed`, `iam.invitation.created`, `iam.ownership.transferred`, `iam.policy.changed`, `iam.session.revoked`, `iam.device.enrolled`, `iam.device.activated`, `iam.device.revoked`, and `iam.offline_authorization.issued`.

Events use the transactional outbox and contain tenant identifiers, entity revision, actor, and correlation ID. Consumers must re-fetch protected details under their own service identity.

### Extension points

- OIDC provider adapter with verified issuer, audience, nonce, and claim mapping.
- Permission-bundle registry with schema validation and migration review.
- Risk-evaluation hook that may require MFA or deny, but may never silently grant a missing permission.

## Performance and capacity budgets

- Cached authorization checks: p95 under 10 ms and p99 under 25 ms within the control plane.
- Uncached authorization checks including membership lookup: p95 under 75 ms.
- Sign-in completion excluding external identity-provider time: p95 under 500 ms.
- Revocation propagation to API nodes, stream gateways, and dispatchers: 60 seconds maximum.
- A workspace shall support 10,000 active memberships and 100,000 projects; membership listing remains cursor-paginated with p95 under 500 ms for a 100-item page.
- The authorization cache key must include principal security epoch, workspace authorization epoch, action, and resource-policy revision.

## Observability and metrics

- Authentication success/failure by method and coarse reason, refresh-token reuse, MFA enrollment/challenge outcomes, invitation lifecycle, and recovery events.
- Authorization allow/deny counts by permission and channel without logging resource content.
- Revocation propagation lag, stale-epoch rejection count, policy evaluation latency, and cache hit ratio.
- Cross-tenant access probes, repeated `NOT_FOUND` patterns, suspicious device-signature failures, and privileged-action volume feed security alerts.
- Every trace carries `correlationId`, `actorId`, tenant IDs, policy version, and channel; emails, tokens, document names, and source values are excluded.

## Acceptance and testing

- A matrix test covers every role against representative organization, workspace, project, artifact, job, approval, billing, and device actions.
- Tenant-isolation tests attempt direct identifiers, nested route mismatches, batch requests, exports, object URLs, event subscriptions, and sync mutations across two organizations.
- Session tests prove rotation, replay-family revocation, logout, expiry, account recovery, and device revocation.
- OTP registration tests cover six-digit codes, 10-minute expiry, five failed attempts, 60-second resend, protected challenge storage, generic public responses, and atomic personal workspace activation.
- OIDC linking tests cover Google nonce/PKCE verification and denial of silent merge for an existing password identity.
- Refresh-family tests cover Web 30/180-day and Desktop/Android 90/365-day inactivity/absolute policies plus reuse revocation.
- Access-preset tests prove Owner/Editor/Viewer map to explicit versioned bundles without replacing the six server roles.
- Agent-grant tests prove Viewer defaults to `NONE`, grants never expand dataset/action permission, and cross-workspace member IDs resolve as not found.
- MFA tests cover mandatory enrollment, step-up expiry, recovery-code single use, and policy changes.
- Property tests prove no narrower membership expands access and no project grant reaches a sibling project.
- Offline-snapshot tests cover schema/signature/key rotation, another principal/Device/workspace/project, security and authorization epoch change, resource/action overreach, clock rollback, 24-hour expiry, and denial of approval, membership/policy/billing/deletion, cloud, or external effects.
- Load tests meet the authorization latency and revocation budgets.
- Acceptance requires identical allow/deny outcomes through Web, Desktop, Android, REST, SSE, WebSocket dispatch, worker callbacks, and sync.

## Delivery and expansion

1. **Foundation release:** users, personal/team organizations, workspaces, projects, six roles, invitations, short sessions, MFA, Device enrollment, signed offline authorization snapshots, a minimal scoped service-account issuance/rotation/revocation primitive, policy engine, and AUD events.
2. **Administration release:** OIDC federation, expanded service-account administration and signed-key management, time-bound memberships, ownership transfer, and organization security policy.
3. **Expansion:** custom roles and SCIM may be added through versioned permission bundles. They must preserve deny-by-default evaluation, tenant/resource checks, security epochs, and the six initial roles for backward compatibility.
