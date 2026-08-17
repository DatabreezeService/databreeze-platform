# Workspace Creation and Switching Implementation Plan

**Status:** Approved for implementation
**Approved by:** Product owner in the active implementation conversation on 2026-08-17
**Requirements:** IAM-027, IAM-028; WEB-028; IAM-002, IAM-003, IAM-019 (reuse); WEB-002 (reuse)

## Outcome

Let a user create additional workspaces in their organization and switch the active workspace from the signed-in shell. The workspace name in the top bar becomes an explicit control with an arrow that opens a chooser listing the user's workspaces plus a create action. Creation provisions the same server-owned initial `HYBRID` data-mode policy and a default private project that registration bootstrap uses today; selecting a different initial mode remains a DSO workspace-policy action. Creating a workspace switches the session into it.

## Architecture and security

- Workspace creation stays on `POST /v1/organizations/{organizationId}/workspaces`, authorized by an active organization membership holding `ORGANIZATION_SETTINGS_MANAGE` (Owner/Admin), evaluated server-side per request. The previously unreachable organization-scope session precondition is replaced by a same-organization check on the live workspace-scoped session.
- Creation is one transaction: the DSO `InitialWorkspacePolicyProvisionerPortV1` publishes revision 1 of the immutable initial policy (server-owned `HYBRID`), the workspace row records only policy/version IDs plus the content-safe projection and `authorizationEpoch: 1`, and a default private INTERNAL project is created. No memberships are granted.
- `POST /v1/auth/scope` switches scope by issuing a new scope-bound session only after server-side verification of an ACTIVE membership covering the target workspace (organization membership or membership for exactly that workspace), reusing the session principal predicate. The superseded session, refresh token, and access tokens are expired atomically. Client-supplied scope hints never authorize anything.
- `GET /v1/me/bootstrap` returns the member-visible organization/workspace/project tree: every organization with an ACTIVE membership, all ACTIVE workspaces for organization members, only their own workspaces for workspace-only members, bounded by the existing contract limits.
- Both new request/response shapes are closed generated v4 contracts; the switch response reuses `iam-auth-session`.

## Tasks

### Task 1: Add the workspace and scope contracts

**Primary requirements:** IAM-027; IAM-028

Add the v4 `iam-workspace-create-command`, `iam-workspace-create-accepted`, and `iam-scope-switch-command` generated contracts with valid/invalid fixtures; the switch response reuses `iam-auth-session`.

### Task 2: Make workspace creation work end to end

**Primary requirements:** IAM-027; IAM-002; IAM-019

Replace the unreachable organization-scope precondition with a same-organization session check, keep `ORGANIZATION_SETTINGS_MANAGE` authorization, provision the initial HYBRID policy and the default private project in the same transaction, and validate the command and accepted response against the generated contracts.

### Task 3: Add the protected scope-switch endpoint

**Primary requirements:** IAM-028; IAM-003

Add authenticated `POST /v1/auth/scope`: verify an ACTIVE membership covering the target workspace and an ACTIVE organization/workspace, resolve the target authorization epoch, expire the superseded session, issue the new scope-bound session, and return the `iam-auth-session` contract.

### Task 4: Return the visible workspace tree from bootstrap

**Primary requirements:** IAM-027; IAM-002

Extend the identity bootstrap repository to return every organization with an ACTIVE membership, its ACTIVE workspaces (all for organization members, own only for workspace-only members), and each workspace's ACTIVE projects, within the existing contract bounds.

### Task 5: Deliver the workspace switcher and creation dialog

**Primary requirements:** WEB-028; WEB-002

Replace the cosmetic select with an accessible dropdown on the workspace name (arrow affordance, current workspace marked, create action), add the create-workspace dialog with Vietnamese and English states, switch scope through the new API, re-bootstrap the session, and reset transient navigation state after a switch.

### Task 6: Verify contracts, API, web, and the local journey

**Primary requirements:** IAM-027; IAM-028; WEB-028

Add requirement-linked API and web tests, regenerate OpenAPI and the requirement index, update traceability, and run the local browser journey: sign in, open the dropdown, create a workspace, land switched into it, and switch back.

## Acceptance

- An organization Owner/Admin creates a workspace through a closed command; the response is the closed accepted contract; the workspace has an initial `HYBRID` policy, `authorizationEpoch` 1, and a default private project; no new memberships are created.
- A member without `ORGANIZATION_SETTINGS_MANAGE` receives `403` and no workspace is persisted.
- Switching to a workspace the actor's memberships cover issues a new scope-bound session, expires the previous one, and the following requests authorize in the target scope.
- Switching to a foreign or inactive workspace fails closed without changing the current session.
- Bootstrap lists only member-visible organizations/workspaces/projects, bounded by the contract.
- The switcher is keyboard operable, available in both top bar modes, keeps Vietnamese complete with English fallback, and never renders synthetic workspace data.

## Deferred

- Owner-chosen initial `LOCAL`/`CLOUD` at creation (requires per-mode DSO default policy matrices; mode changes use the existing DSO workspace-policy authority).
- Cross-organization switching, workspace rename/archive surfaces, and switcher search/pagination beyond the bounded bootstrap list.
