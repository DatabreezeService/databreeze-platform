# Notifications and Collaboration

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.1 |
| Requirement prefix | `NCO` |
| Dependencies | `IAM` Identity, Workspaces, and Permissions; `IAE` Inbox, Artifacts, and Evidence; `JRA` Jobs, Recipes, and Approvals; `DSO` Devices, Synchronization, and Offline Operation |

## Purpose

Define secure, deduplicated, preference-aware notifications and contextual collaboration for inbox items, artifacts, evidence, findings, jobs, approvals, reports, and administration. Notifications direct a user to an authorized application view; they never become an alternate channel for sensitive source content.

## Scope and non-goals

### In scope

- In-app notification center, Android push, Desktop local notifications, transactional email, and digest delivery.
- User and organization preferences, quiet hours, mandatory security notices, deduplication, escalation, and read state.
- Resource comments, evidence anchors, mentions, assignments, reactions, thread resolution, and edit history.
- Authorization at creation, delivery, subscription, and read time.
- Offline drafts and idempotent synchronization.

### Non-goals

- Sending document text, extracted values, evidence snippets, file names, client names, invoice amounts, or secrets through push/email payloads.
- General-purpose chat, public social feeds, or unauthenticated comment links.
- Using notifications as the source of truth for approvals, jobs, assignments, or audit history.
- Allowing preferences to suppress account-security, data-loss, or billing-access notices that policy marks mandatory.
- Guaranteeing delivery by third-party push or email providers.
- Wiring Slack or Discord as V1 notification or agent channels; those integrations remain deferred.

## Concepts and components

- **Notification event:** content-minimized intent to inform a set of recipients about a committed domain event.
- **Notification:** durable per-recipient in-app record with category, resource locator, state, and deduplication key.
- **Delivery:** one attempt through `IN_APP`, `EMAIL`, `ANDROID_PUSH`, or `DESKTOP_LOCAL`.
- **Preference:** recipient rules by organization, workspace, category, urgency, channel, and quiet-hours schedule.
- **Digest:** bounded summary of notification counts and generic action labels, with protected details available only after sign-in.
- **Comment thread:** collaboration context attached to a resource or EvidenceReference.
- **Mention:** explicit reference to a current authorized member; it creates a notification intent, not access.
- **Assignment:** authoritative domain ownership stored by the owning subsystem and surfaced through collaboration.

### Components

- Notification policy and recipient resolver.
- Transactional notification outbox and deduplication service.
- Preference, quiet-hours, digest, and escalation scheduler.
- In-app notification API and secure live stream.
- Email, Android push, and Desktop local-delivery adapters.
- Comment/thread service with revision and edit history.
- Mention parser and authorization filter.
- Delivery receipt, suppression, and bounce processor.

## Subsystem workflows

### Domain event to notification

1. A committed domain event enters the notification policy engine through the outbox.
2. The engine derives category, urgency, allowed channels, resource locator, and deterministic deduplication key.
3. The recipient resolver evaluates current membership, assignment, mentions, approval eligibility, and notification policy without reading source content.
4. One durable Notification is upserted per recipient and deduplication window.
5. Preferences and quiet hours select deliveries. Mandatory security notices ignore channel opt-out but still minimize content.
6. External delivery contains a generic localized template and opaque deep-link token. Opening the link requires authentication and fresh resource authorization.

### Comment and mention

1. An authorized user creates a comment on a supported resource or evidence anchor with an idempotency key.
2. The server validates resource access, comment permission, evidence scope, length, and mentions.
3. The comment and immutable creation event commit together.
4. Only mentioned users who currently have access receive a mention notification. Invalid or unauthorized mentions render as plain text.
5. Comment edits create history entries; deletion creates a tombstone visible as “comment removed” to thread participants.

### Approval escalation

Approval requests use the authoritative `JRA` due date and eligible users. The notification scheduler emits an initial request, one due-soon reminder, and one overdue escalation per policy. A decision or invalidation cancels unsent reminders through the deduplication key; the notification itself cannot approve.

### Digest

A digest groups eligible low/normal urgency notifications by user and organization. It shows counts and generic categories, such as “3 reviews need attention,” not customer or source details. Each link resolves to a server-filtered view after authentication.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| NCO-001 | P0 | Notifications shall be generated only from committed domain state through a transactional outbox and shall never be the authoritative record of the underlying action. |
| NCO-002 | P0 | Each notification intent shall use a deterministic recipient-scoped deduplication key and category-specific window so retries do not create duplicate alerts. |
| NCO-003 | P0 | Push, email, lock-screen, and Desktop notification payloads shall exclude sensitive source content, including file/client names, extracted values, evidence snippets, amounts, paths, and secrets. |
| NCO-004 | P0 | Notification creation, external delivery, live-stream subscription, deep-link opening, and protected detail read shall each enforce active membership and resource authorization. |
| NCO-005 | P0 | A mention shall not grant access; unauthorized or removed recipients shall receive no notification and shall not resolve the target resource. |
| NCO-006 | P0 | User preferences shall be applied per organization/workspace, category, urgency, and channel, with locale-aware quiet hours and digest schedules. |
| NCO-007 | P0 | Mandatory security, ownership, data-loss-risk, and access-suspension notices may not be disabled, but shall still use content-minimized templates. |
| NCO-008 | P0 | Comments shall be tenant- and resource-scoped, versioned on edit, tombstoned on removal, and recorded with author, timestamps, and audit correlation. |
| NCO-009 | P0 | Evidence-anchored comments shall reference a valid `IAE` EvidenceReference and preserve the referenced ArtifactVersion even when newer versions exist. |
| NCO-010 | P0 | Notification actions such as approve, assign, or retry shall deep-link to the application; no external notification button shall perform the privileged action without authenticated re-authorization and applicable MFA. |
| NCO-011 | P0 | Membership removal, device revocation, or resource-access loss shall suppress unsent deliveries and make prior deep links return a non-disclosing denial. |
| NCO-012 | P1 | In-app notification states shall be `UNREAD`, `READ`, `ARCHIVED`, or `DISMISSED`; state changes shall synchronize idempotently per user without changing underlying work state. |
| NCO-013 | P1 | Threads shall support reply, resolve/reopen, reaction, and assignment reference while preserving immutable event history. |
| NCO-014 | P1 | Notification bundles shall update an existing notification count and last-occurrence time within the deduplication window instead of emitting one alert per event. |
| NCO-015 | P1 | Approval/review reminders shall be preference-aware within policy bounds, stop after resolution or invalidation, and be limited to one initial, one due-soon, and one overdue delivery unless policy explicitly escalates. |
| NCO-016 | P1 | Email and push provider webhooks shall be signature-verified, idempotent, and limited to delivery metadata; they shall not mutate domain decisions. |
| NCO-017 | P1 | Vietnamese shall be the default notification locale with English fallback; templates shall use stable message keys and sanitized parameters. |
| NCO-018 | P1 | Workspace administrators shall be able to configure allowed external channels and retention without reading private notification content beyond authorized resources. |
| NCO-019 | P1 | Offline comment, read-state, and dismissal operations shall use stable operation IDs and explicit conflict rules from `DSO`. |
| NCO-020 | P1 | The system shall provide accessible, filterable notification and thread views with pagination and no reliance on color or sound alone. |

## Domain and data contracts

### Notification records

```text
Notification {
  id, recipientUserId, organizationId, workspaceId?,
  category, urgency: LOW|NORMAL|HIGH|CRITICAL,
  messageKey, safeParameters, resourceType?, resourceId?,
  resourceRevision?, dedupeKey, occurrenceCount,
  firstOccurredAt, lastOccurredAt,
  state: UNREAD|READ|ARCHIVED|DISMISSED, revision
}

NotificationDelivery {
  id, notificationId, channel,
  templateVersion, providerMessageId?,
  status: PENDING|SENT|DELIVERED|SUPPRESSED|BOUNCED|FAILED,
  attemptCount, nextAttemptAt?, lastErrorCode?
}

NotificationPreference {
  id, userId, organizationId, workspaceId?,
  category, channel, enabled, minimumUrgency,
  deliveryMode: IMMEDIATE|DIGEST, quietHours, timezone, revision
}
```

`safeParameters` is schema-validated per `messageKey` and permits generic counts, category labels, due-time classes, and actor display name only when workspace policy permits. It rejects arbitrary text from source records.

### Collaboration records

```text
Thread {
  id, workspaceId, resourceType, resourceId,
  evidenceReferenceId?, status: OPEN|RESOLVED,
  createdBy, createdAt, revision
}

Comment {
  id, threadId, parentCommentId?, authorId,
  bodyMarkdown, bodyPlainTextHash, createdAt,
  editedAt?, deletedAt?, revision
}

CommentRevision {
  id, commentId, revision, bodyMarkdown,
  changedBy, changedAt, changeKind: CREATE|EDIT|DELETE
}

Reaction {
  id, commentId, userId, reactionType, createdAt
}
```

Markdown supports plain text, line breaks, lists, emphasis, code spans, and safe links. Raw HTML, embedded media, scriptable URLs, tracking pixels, and remote image loads are rejected. Mentions are structured tokens resolved to user IDs, never parsed solely from display names.

### Deduplication keys

The canonical format is `category:resourceId:resourceRevision:recipientId:reason`. Bundled repetitive events may omit the revision and use a fixed window. Security events never bundle across distinct sessions or devices.

## Permissions, security, and privacy

- Comment create/read/edit/delete permissions are evaluated against the target resource. Authors may edit their own comment for 15 minutes; after that, only permitted moderators may tombstone it, and history remains auditable.
- External channel adapters receive only recipient address/token, localized generic template, opaque link, and provider correlation ID.
- Push deep links carry a random one-time routing token, not tenant/resource identifiers. The token expires within 15 minutes and still requires authentication.
- HTML email is escaped and link destinations are allowlisted to DataBreeze origins.
- Live notification streams use short sessions, heartbeat re-authorization, tenant-filtered subscriptions, and monotonically increasing event IDs.
- Organization administrators may view aggregate delivery health but not another user's unrelated notification center.
- Comment and notification search indexes are tenant-partitioned and encrypted; source artifacts are not copied into the index.

## Offline, failure, and recovery

- Android and Desktop queue new comments, edits within the allowed window, read states, dismissals, and reactions using `DSO` operation IDs.
- Comments are append-only for synchronization. Concurrent replies coexist; concurrent edits to the same comment create a conflict and never overwrite silently.
- Read-state conflicts resolve monotonically: `UNREAD < READ < ARCHIVED`; explicit `DISMISSED` is a separate user action and wins only for the same notification revision.
- Provider outage does not roll back the durable in-app notification. Deliveries retry with exponential backoff up to 24 hours for ordinary notices and the policy window for time-critical notices.
- Invalid or expired push tokens are disabled per device. Email hard bounces suppress non-mandatory email and prompt an in-app address check.
- Outbox replay is harmless through deduplication. Digest jobs reconstruct from pending Notification records, not provider state.
- If the target resource is deleted or inaccessible, the in-app record retains a generic historical label and the link no longer reveals target details.

## APIs, events, and extension points

### REST and streams

- `GET /v1/notifications`
- `PATCH /v1/notifications/{notificationId}`
- `POST /v1/notifications/bulk-state`
- `GET|PUT /v1/notification-preferences`
- `GET /v1/notifications/stream` using authenticated SSE
- `GET|POST /v1/resources/{resourceType}/{resourceId}/threads`
- `GET|POST /v1/threads/{threadId}/comments`
- `PATCH|DELETE /v1/comments/{commentId}`
- `POST|DELETE /v1/comments/{commentId}/reactions/{reactionType}`
- `POST /v1/threads/{threadId}/resolve`
- Provider webhook endpoints under `/v1/webhooks/notification-providers/{provider}`

Mutations require idempotency keys and revision preconditions where applicable. Thread/comment lists use cursor pagination.

### Events

`notification.created`, `notification.state_changed`, `notification.delivery_changed`, `notification.preference_changed`, `collaboration.thread.created`, `collaboration.comment.created`, `collaboration.comment.edited`, `collaboration.comment.deleted`, `collaboration.thread.resolved`, and `collaboration.mention.created`.

Notification generation consumes events from other domains but does not republish their sensitive payloads.

### Extension points

- Channel adapters implement templated send, delivery-webhook verification, token/address suppression, and health reporting.
- Message-template registry supports versioned `vi-VN` and `en` templates with strict safe-parameter schemas.
- Notification policies map domain event types to category, recipients, urgency, bundling, and allowed channels using reviewed declarative rules.

## Performance and capacity budgets

- Committed event to in-app notification: p95 under five seconds.
- Committed event to provider submission for high/critical immediate alerts: p95 under 30 seconds.
- Notification list first page: p95 under 300 ms for 50 items.
- Thread first page: p95 under 300 ms for 100 comments.
- Live event delivery while connected: p95 under two seconds; clients recover gaps by paginated API.
- Support 1 million notification intents per hour per deployment, 100,000 notifications per user retained under policy, and threads with 100,000 comments through cursor pagination.
- External delivery retries are rate-limited per organization, recipient, category, and provider.

## Observability and metrics

- Notification intent, deduplication/bundle rate, recipients resolved/suppressed, in-app latency, and unread age by category.
- Delivery submission, delivered/bounced/failed rate, provider latency, retry depth, invalid token count, and digest completion.
- Preference opt-out rate, quiet-hours deferral, mandatory-notice delivery, and deep-link authorization denial.
- Thread/comment creation, mention resolution/suppression, edit/delete, conflict, resolution time, and evidence-anchor resolution.
- Privacy schema rejection count and canary detection for source names, paths, currency/amount patterns, or evidence snippets in external payloads.
- Logs contain message keys, IDs, category, and provider codes, never comment bodies, email addresses, push tokens, or source content.

## Acceptance and testing

- Template tests prove every external message key accepts only its documented safe parameters in Vietnamese and English.
- Privacy tests seed sensitive names, amounts, paths, values, and evidence text and assert none appears in push, email, lock-screen, provider logs, or analytics.
- Authorization tests remove membership or resource access between intent, send, stream, and open; every stage suppresses or denies correctly.
- Deduplication tests replay outbox events, provider webhooks, reminder schedules, and offline operations.
- Collaboration tests cover evidence anchors, mentions without access, edit windows, history, tombstones, thread resolution, sanitization, and cross-tenant IDs.
- Preference tests cover quiet hours across daylight/offset changes, digests, mandatory categories, and channel policy.
- Provider-failure tests prove in-app records remain durable and retry limits do not flood recipients.
- Accessibility tests cover screen readers, keyboard navigation, focus, contrast, motion settings, and localized time descriptions.

## Delivery and expansion

1. **Foundation release:** in-app center, SSE, Android push, Desktop local notifications, transactional email, preferences, quiet hours, comments, evidence anchors, mentions, and deduplication.
2. **Collaboration release:** digests, reactions, thread resolution, assignment views, escalation policies, and moderation audit.
3. **Expansion:** additional provider adapters and approved enterprise archival may be added through the channel and template registries; public chat and source-rich external payloads remain out of scope.
