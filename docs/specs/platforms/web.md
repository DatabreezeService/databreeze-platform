# Web Platform

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.1 |
| Requirement prefix | `WEB` |
| Dependencies | `IAM`, `IAE`, `JRA`, `DSO`, `DSM`, `INT`, `NCO`, `BUA`, and `AUD` foundation specifications; Web consumes governed data definitions/results, integration/API/webhook status, and audit history through their published contracts |

## Purpose

Define the DataBreeze Web application as the complete organizational and cloud control center. Web owns tenant onboarding, users, workspaces, projects/clients, cloud Inbox and artifacts, recipes and jobs, approvals, reports, collaboration, devices, security policy, billing, usage, API administration, and audit history. It also coordinates typed work executed by the Windows Desktop agent without becoming a remote-control console.

## Scope and non-goals

### In scope

- A Vietnamese-first React, TypeScript, and Vite application for supported evergreen desktop and mobile browsers.
- Full organization, workspace, project, role, device, policy, billing, usage, and audit administration.
- Cloud and synchronized artifact, evidence, job, review, approval, report, comment, and notification experiences.
- Control and status views for local Desktop execution using `JRA` and `DSO`.
- Generated API contracts, accessible workflows, content-safe telemetry, and resilient live progress.

### Non-goals

- Watching Windows folders, reading local files directly, or running the Python processing engine in the browser.
- Arbitrary remote desktop, shell, file-browser, keyboard, mouse, or script control.
- Replacing the focused native Android capture experience.
- Treating browser state, query caches, live events, or optimistic UI as authoritative.
- Making private local artifact content available merely because metadata appears on Web.

## Concepts and components

### Application architecture

- **App shell:** authenticated routing, organization/workspace/project switcher, global search, notification center, locale, help, and session controls.
- **Identity and administration:** profile, sessions, MFA, memberships, roles, security policy, ownership, and audit.
- **Inbox and artifact workspace:** intake, classification, metadata, versions, preview, evidence navigation, retention, and export.
- **Automation center:** recipe builder, job queue, progress, review, approval, retry, cancellation, and result manifests.
- **Reports and collaboration:** reports, evidence-linked findings, comments, mentions, assignments, and publication.
- **Devices and sync:** enrollment confirmation, status, capabilities, grants, conflicts, data mode, and migration controls.
- **Billing and usage:** subscription, entitlement, quota, invoice metadata, usage, grace, remediation, and export.
- **Developer administration:** service accounts, API credentials, approved webhooks, schemas, and logs under explicit permissions.

### Technical baseline

- React with strict TypeScript and Vite.
- React Router for route ownership; TanStack Query for server-state cache; React Hook Form with schema validation for forms.
- Generated TypeScript client and types from the NestJS/Fastify control plane OpenAPI document.
- Shared domain/permission constants and JSON Schemas from the monorepo; all boundary payloads are runtime-validated.
- Server-Sent Events (SSE) for notifications and committed job progress, with paginated REST reconciliation.
- Component primitives that meet WCAG 2.2 AA, shared design tokens, and `vi-VN` as the default locale with `en` fallback.
- Static assets served from a CDN; all sensitive application data comes from the authorized control plane.

## Platform workflows

### First organization and workspace

1. The user signs in and completes required MFA.
2. Web loads a `/me/bootstrap` response containing safe profile, organizations, membership summaries, and server-derived permissions.
3. An Owner creates a workspace, selects `HYBRID` by default, reviews storage implications, and creates or accepts the default project.
4. Web displays next actions for Inbox intake, Desktop enrollment, Android install, members, and recipes according to permission.

### Cloud or hybrid intake

1. The user selects files or creates an intake record.
2. Web asks the server whether original upload is allowed for each item and data class.
3. Allowed uploads stream through resumable sessions without buffering the whole file in JavaScript memory.
4. Finalization returns one InboxItem and immutable ArtifactVersion per successful idempotency key.
5. Web navigates to classification/review and resolves evidence only through short-lived authorized preview grants.

For `LOCAL` workspaces, Web offers Desktop capture or metadata-only registration. It does not present an original-upload control.

### Run and approve work

1. The user selects a published recipe or direct registered action.
2. A server-side preflight returns required inputs, target executor, policy gates, estimated quota class, and permission decision.
3. Web submits one idempotent job command and renders committed state.
4. SSE supplies low-latency progress; any gap or reconnect triggers REST reconciliation.
5. Review corrections create versioned results. Approval requires the protected approval view, current eligibility, and recent MFA when policy requires.

### Local execution coordination

Web shows registered devices, content-free capability summaries, last seen, queue state, and compatible job types. It may request a signed typed job for an approved device/folder capability. It cannot browse the filesystem or send paths, scripts, commands, or arbitrary URLs.

### Administration and billing

Owners/Admins manage members, devices, data mode, policy, retention, API access, billing, and usage through separate permission gates. Destructive or billing-sensitive actions show an impact summary, require recent MFA, use revision preconditions, and display the resulting audit event.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| WEB-001 | P0 | Web shall provide the complete management surface for organizations, workspaces, projects/clients, members, roles, policies, devices, billing, usage, and audit history. |
| WEB-002 | P0 | Every route, query, mutation, download, SSE subscription, and action shall rely on server-side `IAM` authorization; client permission hints shall affect presentation only. |
| WEB-003 | P0 | The application shall use generated OpenAPI types plus runtime validation and shall reject an incompatible control-plane contract before mutating state. |
| WEB-004 | P0 | Browser refresh credentials shall remain in `HttpOnly`, `Secure`, `SameSite` cookies; long-lived bearer tokens, device secrets, and provider secrets shall not be stored in localStorage or JavaScript-readable persistence. |
| WEB-005 | P0 | Original upload controls shall follow the server data-mode decision; a `LOCAL` workspace shall never send original bytes or reconstructable derived content such as previews, OCR/transcripts, row/cell values, thumbnails, source snippets, or chunks from Web. |
| WEB-006 | P0 | Artifact originals shall be presented as immutable versions; corrections, transformations, redactions, and publications shall create explicit new versions. |
| WEB-007 | P0 | Every material extraction, finding, and report value shall expose its evidence state and navigate to an exact authorized `IAE` EvidenceReference or an explicit resolution error. |
| WEB-008 | P0 | Job and recipe controls shall create only registered typed actions through `JRA`; Web shall expose no arbitrary script, shell, filesystem, or remote-control input. |
| WEB-009 | P0 | Approval decisions shall display the bound input/effect hash summary, policy, expiry, and evidence, and shall be re-authorized with MFA when required at submission time. |
| WEB-010 | P0 | Live progress and notifications shall be derived from committed events, tolerate duplicate/out-of-order delivery, and reconcile from REST after reconnect or event-ID gap. |
| WEB-011 | P0 | Billing entitlements, limits, grace, and suspension shall be enforced by the control plane; Web shall render stable denial/remediation states and preserve read/export/delete-request access. |
| WEB-012 | P0 | Destructive actions shall show the exact scope and consequences, require explicit confirmation and recent MFA where specified, and never conflate billing cancellation with data deletion. |
| WEB-013 | P1 | Vietnamese shall be the default complete locale, including dates, numbers, pluralization, validation, notification templates, and accessible names; English shall be a complete fallback. |
| WEB-014 | P1 | Core workflows shall meet WCAG 2.2 AA, support keyboard-only use and screen readers, preserve focus across dialogs/routes, and not rely on color, pointer hover, sound, or motion alone. |
| WEB-015 | P1 | All list and activity views shall use cursor pagination, stable filters encoded in the URL where safe, explicit empty/error states, and virtualized rendering for large result sets. |
| WEB-016 | P1 | Mutations shall use idempotency keys and revision preconditions, show pending state, prevent accidental duplicate submit, and reconcile ambiguous network outcomes. |
| WEB-017 | P1 | The recipe builder shall validate schemas, graph structure, capabilities, data mode, approval requirements, and entitlements before allowing publication. |
| WEB-018 | P1 | Device management shall expose opaque capabilities, status, grants, revocation, conflicts, and data-mode migrations without revealing local paths or enabling filesystem browsing. |
| WEB-019 | P1 | External notifications and shared links shall remain content-minimized; protected details shall load only after authenticated authorization. |
| WEB-020 | P1 | The browser shall retain only content-minimized cached server state by default; source previews and original bytes shall not be available offline unless an explicit encrypted download/export completes. |
| WEB-021 | P1 | Every error shall map to a stable problem code with a Vietnamese user message, correlation ID, safe retry guidance, and no stack trace, tenant existence leak, or source content. |
| WEB-022 | P1 | Feature modules shall register routes, navigation, permissions, message keys, schemas, and telemetry at build time; arbitrary runtime third-party code shall not execute in the application origin. |
| WEB-023 | P0 | For `LOCAL` evidence, Web shall show an open-on-source-device action and explicit device availability; it shall not request or display a live source-derived relay unless the user first publishes a governed Hybrid/Cloud derivative. |
| WEB-024 | P0 | The signed-in product shall expose exactly three primary destinations (`Bảng điều khiển`, `Phân tích`, and `Dữ liệu`) and use one shared workspace-agent store, with the compact agent on Dashboard/Data and the full thread/history surface in Analysis. |

## Domain and data contracts

### Bootstrap and route context

```text
WebBootstrap {
  user: { id, displayName, locale, mfaState },
  organizations: OrganizationSummary[],
  recentScopes: { organizationId, workspaceId?, projectId? }[],
  session: { expiresAt, stepUpValidUntil? },
  platform: { minimumClientVersion, apiVersion, featureFlagsSafe }
}

RouteScope {
  organizationId,
  workspaceId?,
  projectId?,
  resourceType?,
  resourceId?
}
```

Route scope is a navigation input only. Each resource response carries its authoritative scope; mismatches are treated as not found and never merged into another tenant's cache. Query keys include organization/workspace/project and current principal security epoch.

### Server-state command envelope

```text
WebCommand {
  commandId,
  idempotencyKey,
  expectedRevision?,
  scope,
  commandType,
  payload,
  clientOccurredAt,
  clientVersion
}
```

The server ignores `clientOccurredAt` for authorization, ordering, billing, and conflict decisions.

### Problem response

```text
Problem {
  type, titleKey, status, code, correlationId,
  retryable, retryAfterSeconds?, fieldErrors?,
  currentRevision?, remediationAction?
}
```

Error payloads contain no stack, SQL, storage locator, provider credential, local path, or inaccessible tenant/resource identifier.

### Feature module contract

```text
WebFeatureModule {
  key, routes[], navigationItems[], requiredPermissions[],
  queryNamespaces[], messageNamespaces[], formSchemas[],
  telemetryAllowlist[]
}
```

Modules consume foundation APIs and must not create independent identity, artifact, job, approval, sync, notification, or entitlement sources of truth.

## Permissions, security, and privacy

- Content Security Policy denies inline script, `eval`, unapproved frames, unapproved network origins, and unapproved object embedding. Trusted Types are enabled where browser support permits.
- State-changing cookie-authenticated requests require a CSRF token bound to the session and verified Origin/Fetch Metadata.
- The application escapes user content. Comment Markdown uses the constrained `NCO` sanitizer; artifact content renders in isolated safe-preview origins or sandboxed viewers.
- Signed object/evidence grants remain memory-only, single-resource, and expire within five minutes. Referrer policy prevents token leakage.
- Browser telemetry and error reporting use an explicit allowlist and scrub URLs, query strings, file names, comment bodies, source values, evidence snippets, emails, tokens, and local paths.
- Organization/workspace switching clears incompatible queries, closes streams, and resets transient forms.
- Sensitive administration pages disable embedding, require recent session validation, and never expose full provider or credential values.
- Dependency builds use lockfiles, integrity checks, vulnerability scanning, reproducible CI, and a software bill of materials.

## Offline, failure, and recovery

- Web is an online control center. A service worker may cache versioned static assets and an offline shell, but shall not intercept or persist authenticated API responses containing sensitive content by default.
- Safe drafts such as unsent comment text or recipe layout may be stored in IndexedDB only after explicit user action, scoped by user/workspace, size-limited, and cleared on logout; approval decisions and policy/billing changes are never queued offline.
- Query retry uses bounded exponential backoff and honors `Retry-After`. Non-idempotent mutation retries reuse the same idempotency key.
- If SSE fails, Web displays a degraded-live-state indicator and polls durable REST state with backoff.
- If an upload loses connectivity, the resumable session and verified part list are restored; selecting changed bytes creates a new intake rather than corrupting the session.
- Stale revision responses show a field-level comparison or reload path. They never overwrite server state automatically.
- A forced minimum-client version blocks mutations, preserves read-only safe context, and reloads after assets are verified.

## APIs, events, and extension points

### API consumption

Web consumes all applicable versioned REST/OpenAPI endpoints defined by `IAM`, `IAE`, `JRA`, `DSO`, `DSM`, `INT`, `NCO`, `BUA`, and `AUD`, plus typed feature APIs and:

- `GET /v1/me/bootstrap`
- `GET /v1/workspaces/{workspaceId}/overview`
- `GET /v1/workspaces/{workspaceId}/activity`
- `GET /v1/search` with tenant-scoped, permission-filtered result types
- `GET /v1/client-compatibility`

The NestJS/Fastify control plane owns authorization, validation, idempotency, and domain transactions. Web does not call PostgreSQL, S3, Redis, workers, or Desktop directly.

### Live events

- Authenticated SSE endpoints for notifications, job progress, approval/review changes, and administration events.
- Every event includes `eventId`, aggregate revision, safe type, occurred time, and identifiers authorized for the subscriber.
- The client persists only the last event ID for short reconnect recovery and reconciles durable state by API.

### Extension points

- Build-time feature-module registry.
- Versioned safe viewer registry for supported artifact media.
- Admin form registry generated from reviewed schemas.
- Analytics event registry with allowed fields; unregistered properties are dropped before transport.

## Performance and capacity budgets

- Production initial JavaScript: at most 250 KiB gzip for the authenticated shell; route chunks at most 200 KiB gzip each, with exceptions reviewed against a budget file.
- p75 on supported mid-range hardware and 4G: LCP at most 2.5 seconds, INP at most 200 ms, CLS at most 0.1.
- Authenticated shell usable after cached assets: at most 1.5 seconds on a typical office broadband connection, excluding identity-provider interaction.
- Route transition with cached shell: p95 under 300 ms to loading state; primary API data visible within its foundation API budget.
- Tables remain responsive at 100,000 logical records through server pagination and virtualization; no route loads an unbounded collection.
- Memory target under 300 MiB for ordinary workflows and under 500 MiB during large resumable upload management, independent of source file size.
- SSE reconnect begins within one second, uses jittered backoff up to 30 seconds, and reconciles gaps before showing final state.

## Observability and metrics

- Core Web Vitals by route, locale, browser, release, and coarse network class.
- Route/query/mutation latency, error code, retry, revision conflict, SSE disconnect/gap, upload resume, and viewer failure.
- Funnel metrics for onboarding, intake, review, approval, device enrollment, plan remediation, export, and evidence navigation.
- Accessibility regression counts, missing translation keys, client-contract incompatibility, and unsupported browser rate.
- Security signals include CSP reports, CSRF failure, repeated authorization denial, suspicious object-grant use, and dependency integrity failure.
- Telemetry uses pseudonymous user/session IDs and tenant IDs only where operationally necessary; payload allowlists are tested in CI.

## Acceptance and testing

- Unit tests cover domain view models, permission hints, formatters, validators, state reducers, and error mapping.
- React component tests cover keyboard, screen reader names, focus, localization, loading/empty/error, and restricted-control states.
- Contract tests compile against OpenAPI and validate runtime fixtures for every foundation API and live event.
- Playwright end-to-end tests cover organization/workspace creation, roles, data modes, cloud/hybrid/local intake, evidence navigation, jobs, reviews, approvals, device revocation, comments, notifications, billing grace/suspension, export, and deletion request.
- Navigation tests prove exactly three primary destinations and one shared workspace-agent store with compact agent on Dashboard/Data and full history in Analysis.
- Tenant-isolation tests reuse direct identifiers, object grants, cached queries, URLs, browser history, and SSE event IDs across two organizations.
- Security tests cover XSS, Markdown sanitization, CSRF, CSP, clickjacking, token storage, signed URL leakage, file-type confusion, and authorization race.
- Performance tests enforce bundle and Web Vitals budgets on Vietnamese content and large paginated fixtures.
- Acceptance requires every P0 workflow to complete with keyboard only in Vietnamese and return the same committed state after refresh or SSE loss.

## Delivery and expansion

1. **Foundation release:** app shell, IAM administration, workspaces/projects, Inbox/artifacts/evidence, jobs/review/approval, devices/sync status, notifications/comments, billing/usage, and audit.
2. **Module waves:** add the ten DataBreeze modules through the build-time registry, reusing foundation contracts and platform patterns.
3. **Expansion:** enterprise federation, custom roles, customer-managed keys, approved public report sharing, and additional developer administration may extend Web without moving local execution into the browser or weakening authorization.
