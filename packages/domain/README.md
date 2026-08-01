# Shared Domain Values

Pure TypeScript value logic with no network, filesystem, database, UI-framework, or
service-implementation dependencies.

## Public interfaces

All imports are explicitly versioned. There is intentionally no unversioned package root.

- `@databreeze/domain/permissions/v1` publishes the closed version-1 permission vocabulary,
  the six initial immutable role bundles, explicit resource/channel applicability, and
  deny-by-default lookup helpers.
- `@databreeze/domain/tenant-scope/v1` publishes branded UUIDv4/UUIDv7 and UTC values,
  complete organization/workspace/project scopes, and equality, containment, and narrowing
  helpers.
- `@databreeze/domain/authorization/v1` publishes a provider-bound evaluator for exact tenant
  filters, authoritative resource/membership/policy resolution, and authorization decisions.
- `@databreeze/domain/v1` aggregates the three version-1 interfaces.

The package uses the public `@databreeze/contracts/v1` validator. It does not deep-import
generated files or duplicate the canonical protocol schemas.

## Initial roles

The initial identifiers are `owner`, `admin`, `analyst`, `operator`, `approver`, and `viewer`.
Their names remain Owner, Admin, Analyst, Operator, Approver, and Viewer. A role is only a
permission bundle: it never establishes tenant membership, resource ownership, or a final
authorization decision.

Owner materializes every Admin permission plus ownership-transfer and billing permissions.
Neither Owner nor Admin receives `approval.decision.create`. Approval, retention, legal-hold,
data-mode, device, entitlement, separation-of-duties, and recent-MFA conditions remain
independent policy gates. Request consumers cannot submit those results; the authority provider
evaluates applicable policy from trusted application state.

## Trusted authorization flow

1. At server composition, inject an `AuthorizationAuthorityProviderV1` whose methods are backed
   by the authenticated principal, scoped repositories, membership store, and policy engine.
2. Give request handling only the frozen evaluator. Its sole method is `authorizeV1`; it has no
   public filter, resource, membership, role, or policy minting API.
3. Submit only the permission, channel, complete tenant filter, and resource selector. Extra
   request fields are rejected before any authority lookup.
4. The evaluator validates the permission's explicit resource/channel applicability, resolves
   the authenticated principal, and sends the exact frozen tenant filter to the provider's
   scoped resource lookup.
5. It validates the returned resource and intrinsic organization/workspace/project identity,
   then resolves membership and policy internally. Unknown or inactive roles, unavailable or
   malformed authority results, unmet policy, scope mismatch, and identity mismatch all deny.

Provider methods are captured when the evaluator is created, so later mutation cannot replace
its authority. Provider results are always runtime-validated even when an adapter is typed.
Each provider call has an independently cleaned-up deadline: 1 second by default, configurable
per evaluator from 1 millisecond through 60 seconds with `providerCallTimeoutMs`. A provider
timeout or exception fails closed as `AUTHORITY_UNAVAILABLE`; late provider settlement cannot
resume the authorization flow.
Clients may use published permission bundles and applicability as display hints, but
authoritative enforcement belongs to a server or trusted worker with its own provider-backed
evaluator.

## Requirement traceability

This package and its tests provide partial foundation coverage only:

- `IAM-001`: branded UUIDv4/UUIDv7 identifiers and strict UTC timestamp parsing.
- `IAM-002`: pure action, explicit channel/resource applicability, and scoped decision
  primitives.
- `IAM-003`: default denial and runtime/type-level rejection of caller-supplied authority facts.
- `IAM-004`: versioned permissions and exactly six immutable initial role bundles.
- `IAM-009`: exact provider-owned scoped lookup and resource-identity gates.
- `IAM-019`: complete scope parsing, exact filters, ancestry containment, and non-broadening
  narrowing.

These requirements are not complete. This package does not implement authentication, IAM
persistence, memberships, repository queries, API guards, custom roles, offline snapshots,
policy engines, audit writes, or feature workflows.

## Local commands

```text
corepack pnpm --filter @databreeze/domain typecheck
corepack pnpm --filter @databreeze/domain test
corepack pnpm --filter @databreeze/domain build
```
