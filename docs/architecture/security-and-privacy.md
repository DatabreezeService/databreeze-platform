# Security and Privacy Architecture

**Status:** Product specification<br>
**Version:** 1.0

## 1. Security Objectives

DataBreeze protects tenant isolation, user-controlled data location, artifact integrity, device trust, processing integrity, and the auditability of consequential actions.

Primary threats include:

- Cross-workspace data access
- Credential or session theft
- Malicious files and parser exploitation
- Compromised or lost devices
- Forged jobs, results, approvals, webhooks, or usage records
- Desktop renderer compromise reaching local files
- Sensitive data leakage through logs, notifications, analytics, AI providers, or support
- Supply-chain compromise and unsafe updates

## 2. Authentication

### Web

- Short-lived access credentials are held in memory.
- Refresh credentials use Secure, HttpOnly, appropriately SameSite cookies.
- State-changing cookie-authenticated endpoints use CSRF protection.
- Passwords use Argon2id with versioned parameters.
- Email verification, recovery, and login challenges expire, are rate-limited, and are single-use.
- OIDC providers use authorization code flow with PKCE and verified issuer, audience, nonce, and state.

### Desktop and Android

Authentication uses the system browser and authorization code with PKCE. A successful user login is followed by device-key registration. Refresh material is stored only in the OS credential vault or Android Keystore-backed storage.

### MFA and sessions

Workspace policy may require phishing-resistant passkeys/WebAuthn, TOTP, or another supported factor. Recovery events and factor changes require recent authentication and generate audit notifications.

Users can view and revoke sessions and devices. Risk events may force reauthentication without silently deleting offline work.

## 3. Authorization

Authorization is evaluated server-side for every API, sync mutation, job dispatch, result acceptance, object transfer, webhook operation, and shared link.

The decision combines:

- authenticated actor and session
- organization/workspace membership
- role capabilities
- project/resource assignment
- data classification and retention policy
- device status and grant
- module entitlement
- action-specific conditions and separation of duties

Client-side visibility improves UX but is never enforcement.

## 4. Tenant Isolation

- Tenant-owned rows declare exactly one primary scope: `organization_id` for organization-level membership, billing, verified-domain, and global-policy records; `workspace_id` for artifacts, jobs, datasets, reports, and other workspace content. Project-owned rows include `workspace_id` and `project_id`.
- Organization-scoped repositories require an organization scope, and workspace-scoped repositories require a workspace scope; neither accepts an optional tenant filter. Cross-workspace organization administration uses an explicit organization-scoped projection rather than bypassing workspace repositories.
- Foreign keys and application services verify the complete `organization -> workspace -> project -> resource` ancestry. A caller-supplied tenant identifier never proves that relationship.
- Object keys use opaque IDs and access is mediated by short-lived signed requests.
- Cache keys, stream entries, traces, and rate limits include tenant scope.
- Worker dispatch tokens identify one job and allowed resources.
- Automated tests attempt horizontal and vertical authorization bypass across every resource class.

Database row-level security may be added as defense in depth after repository scoping is stable; it is not a substitute for application authorization.

## 5. Encryption and Secrets

- TLS is required for all network communication.
- Managed storage encryption is mandatory; application-level envelope encryption is available for higher classifications.
- Key material resides in a managed KMS, OS vault, or Android Keystore and is rotated.
- Secrets are injected at runtime and never stored in source, build logs, telemetry, crash dumps, or fixtures.
- Passwords, refresh tokens, API keys, and device private keys are never recoverable in plaintext.
- Customer-managed keys are an enterprise extension, not a foundation dependency.

### Temporary processing data

Cloud workers, the Desktop sidecar, previews, exports, checkpoints, and parsers use a per-job or per-attempt working directory with an unguessable identifier and an OS/service identity that cannot read another tenant’s directory.

- Source-derived spill, extracted text, thumbnails, checkpoints, and partial outputs are encrypted at rest with a job- or device-scoped key and excluded from backup, indexing, crash reporting, antivirus cloud submission where controllable, and telemetry.
- A manifest records owner, workspace, job/attempt, data classification, byte budget, creation time, and expiry without copying source content into control-plane logs.
- Success, cancellation, rejection, and terminal failure close file handles and remove the working set. Cloud orphan scavenging runs at startup and at least hourly, with a 24-hour hard maximum after a terminal attempt.
- An interrupted Desktop job may retain an encrypted recovery checkpoint only when policy permits, the user can see its storage use, and expiry is no more than seven days by default. Sign-out, device revocation, or data-mode policy may require earlier lock or purge.
- Cleanup uses cryptographic key destruction plus best-effort unlink/overwrite appropriate to the storage medium. Failure is retried and alerted; DataBreeze never claims physical secure erasure that the filesystem or SSD cannot prove.
- A resumed job accepts a checkpoint only when job, attempt policy, input hashes, processor version, authorization, and data mode still match.

## 6. Artifact and Parser Safety

Every intake enforces declared and observed size, media type, archive depth, decompressed size, sheet/row/page limits, and processor time/resource limits.

- Cloud processors run without broad network or database access.
- Malicious or suspicious files are quarantined with safe metadata.
- Office macros and embedded executables are never run.
- Archive traversal, symlink escape, formula injection, XML entity expansion, decompression bombs, and unsafe filenames are explicitly tested.
- Generated CSV and spreadsheet cells that could execute formulas are escaped according to export policy.
- Preview rendering is isolated from authenticated application origins.

## 7. Desktop Security

- Electron context isolation and sandboxing are enabled.
- Node integration is disabled in renderer content.
- Preload exposes a small allowlisted IPC API with schema validation.
- Navigation, new windows, permissions, and external protocols are deny-by-default.
- Folder grants use canonical paths and reject traversal and symlink escape.
- Main process validates every request again; renderer state is untrusted.
- Python sidecar binaries and processor manifests are signed and hash verified.
- Sidecar messages are length-bounded and schema-versioned.
- Updates are code-signed, verified, staged, and rollback-aware.
- No cloud request can submit arbitrary shell commands.

## 8. Android Security

- Device secrets use Keystore-backed storage.
- Network security configuration prohibits cleartext production traffic.
- Exported activities, providers, and receivers are minimized and permission-checked.
- Share intents copy content through scoped URIs and validate size/type.
- Sensitive screenshots and backups follow workspace policy.
- Local Room data uses platform encryption controls and application-level encryption for designated fields.
- A rooted or failed-integrity signal informs risk policy but does not claim perfect device trust.

## 9. Jobs and Approvals

Dispatch and result envelopes are authenticated, time-limited, and bound to job, device/worker, processor, inputs, and attempt. The API rejects stale leases, changed input hashes, unsupported schemas, revoked devices, and undeclared outputs.

Approval decisions are append-only, capture policy version, and cannot be forged through a job result. High-risk policies may require a second person.

## 10. AI and External Providers

- Workspace policy controls whether a data class may reach a provider.
- Adapters minimize and redact payloads where possible.
- Provider training/retention terms must satisfy the selected policy.
- Provider credentials are organization-owned or DataBreeze-managed through secrets storage.
- Prompts and responses are not placed in general application logs.
- A provider failure or refusal does not lower validation or approval requirements.

## 11. API Keys, Webhooks, and Connectors

- API keys are hashed at rest, scoped, expiring where possible, and shown once.
- Webhook secrets support rotation with overlap.
- Outgoing webhooks are signed and include timestamp and replay protection.
- Destination URLs are validated against SSRF, private-network, redirect, and DNS-rebinding policy.
- Connectors use least-privilege OAuth scopes and encrypted token storage.
- Revocation and connector failure do not delete imported artifacts.

## 12. Privacy

DataBreeze collects only product telemetry required to operate and improve the service. Telemetry excludes artifact contents, extracted values, filenames where unnecessary, full paths, voice recordings, and personal contact data.

Users can:

- inspect artifact location and synchronization policy
- export workspace metadata and governed outputs
- request deletion subject to retention and legal constraints
- disable optional analytics and AI features
- revoke devices, sessions, API keys, links, and connectors

Support access is time-limited, user-authorized, scoped, audited, and disabled by default.

## 13. Audit and Detection

Security-relevant events include authentication, recovery, role changes, device registration/revocation, policy changes, artifact access, exports, shared links, job dispatch/result rejection, approval, API key use, billing changes, and administrative support access.

Detection alerts on unusual cross-resource access, repeated authorization failures, large exports, webhook abuse, worker result anomalies, and disabled security controls. Alerts use safe metadata.

## 14. Security Delivery Gate

No production release proceeds without:

- dependency and secret scanning
- tenant-isolation and authorization tests
- parser and upload abuse tests
- temporary-data isolation, crash-scavenging, expiry, and cleanup-failure tests
- Desktop IPC and update verification
- Android exported-component review
- backup restoration evidence
- incident contact and revocation procedure
- documented residual risks for newly enabled providers
