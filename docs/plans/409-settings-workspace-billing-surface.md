# Plan 409: Workspace administration and entitlement surface

**Status:** Approved for implementation by the product owner in this task.

**Goal:** Make the authenticated Web administration surface honest and useful for
the signed-in account, workspace creation, membership invitations, Owner/Editor/Viewer
access presets, independent agent grants, AI-credit visibility, and provider-backed billing while
preserving server-side IAM/BUA authority.

## Authority and requirements

- IAM-010: single-use, email-bound, scope-bound invitations with bounded expiry.
- IAM-018: revisioned/idempotent membership mutations.
- IAM-025: explicit Owner/Editor/Viewer presentation presets over canonical roles.
- IAM-027/IAM-028: server-owned workspace creation and scope-bound switching.
- IAM-005/IAM-009/IAM-023: account identity, MFA state, and current-session posture
  are displayed from authenticated bootstrap/session state, never client-entered identity.
- BUA-001/002/015/022: server-authoritative entitlement limits and reasoned display.
- BUA-011: billing mutations require Owner authority and idempotency.
- WEB-001/002/019: complete administration surface with server reauthorization.

## Bounded implementation

1. Compose the existing invitation repository, principal lookup, HMAC digest, and
   local Mailpit delivery in the durable local profile using a separate invitation
   digest key. No invitation bearer material is returned to Web.
2. Add an additive server-owned invitation-by-email command that resolves an
   existing principal, creates the scoped invited membership, and delivers the
   single-use token through the existing invitation service. Do not accept client
   tenant, actor, role authority, or expiry fields.
3. Add generated v4 Web transports and a settings UI for inviting members,
   changing Owner/Editor/Viewer access presets, changing independent agent grants,
   and revision-conflict/error states. Keep Viewer ceilings enforced by IAM.
4. Add a server-authoritative entitlement summary read that exposes plan/status and
   usage for the `job_count` AI-credit meter without exposing provider secrets or
   treating browser counters as authority. Use the existing BUA repository and
   billing/PayOS routes for plan purchase and checkout status.
5. Refresh the premium cobalt/blue settings and usage surfaces, including loading,
   empty, unavailable, forbidden, and successful states. Preserve Vietnamese-first
   copy and English parity.

## Verification

- Contract generation/parity and fixture checks; published v1-v3 compatibility is
  unchanged.
- Focused IAM invitation/membership, BUA entitlement-summary, API controller, and
  Web settings/usage tests.
- API/Web typechecks, ESLint, Prettier, `git diff --check`, and local authenticated
  journey: create workspace -> invite existing principal -> inspect Mailpit -> accept
  invitation -> change access preset/grant -> read AI credits -> open billing checkout.

## Explicit non-goals

- No provider payment credentials or raw card data in DataBreeze.
- No fake subscription success, browser-only credit counters, or client authority
  fields.
- No invitation to an email that has no existing principal unless a future
  registration-link workflow is separately approved.

## Implementation checkpoint (2026-08-18)

- Server-backed workspace creation and scope switching, invitation issuance and
  acceptance, Owner/Editor/Viewer membership changes, independent agent grants,
  entitlement/AI-credit summaries, and PayOS checkout/status reads are wired
  through the authenticated Web routes. Browser request bodies do not carry
  tenant or role authority.
- The Web settings, usage, billing, and workspace-switcher surfaces now provide
  Vietnamese-first loading, empty, forbidden, conflict, unavailable, and success
  states, with explicit links between them. Local demo content is behind the
  explicit demo flag only.
- The workspace chooser remains available for an organization-level account that
  has create permission even when no active workspace exists yet. Localhost
  settings identify Mailpit invitation delivery, and local billing explicitly
  identifies the signed mock checkout rather than presenting it as a real charge.
- Focused API and Web tests, API/Web typechecks, Web build/budget, and scoped
  formatting checks are green. A real local authenticated journey still needs
  to be rerun in an environment with Docker and the local services available.
- The local composition suite now also proves the configured MinIO intake and
  processing-content seams used by the settings-to-data walkthrough; the
  suite is 10/10 green. This is wiring evidence, not a substitute for the
  Docker-backed browser journey.
