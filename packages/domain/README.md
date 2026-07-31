# Shared Domain Values

Pure TypeScript value logic with no network, filesystem, database, UI-framework, or
service-implementation dependencies.

## Public interfaces

All imports are explicitly versioned. There is intentionally no unversioned package root.

- `@databreeze/domain/permissions/v1` publishes the closed version-1 permission vocabulary,
  the six initial immutable role bundles, and deny-by-default lookup helpers.
- `@databreeze/domain/tenant-scope/v1` publishes branded UUIDv4/UUIDv7 and UTC values,
  complete organization/workspace/project scopes, and equality, containment, and narrowing
  helpers.
- `@databreeze/domain/authorization/v1` publishes an instance-scoped evaluator for exact
  tenant filters, trusted resource-lookup results, evaluated contexts, and authorization
  decisions.
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
independent policy gates. Callers must set `policyConditionsSatisfied` only after those
applicable policies have been authoritatively evaluated.

## Trusted authorization flow

1. Parse a complete tenant scope from trusted application state.
2. Call `verifyTenantFilterV1` with that authority scope and the required request/repository
   filter. Missing, optional, malformed, broader, narrower, or mismatched filters are rejected.
3. Perform the repository lookup with the verified exact filter. Pass only its minimal
   server-side ownership tuple to `acceptTrustedResourceLookupV1`; never pass a request body,
   route claim, cached UI value, or client-provided ownership object to this trust boundary.
4. Create an evaluated context from the trusted resource token, current membership result,
   channel, role identifier, evaluation time, and policy outcome.
5. Call `authorizeV1`. Unknown roles, permissions, channels, foreign evaluator tokens,
   inactive memberships, unmet policies, resource-type mismatch, and tenant-scope mismatch all
   deny.

Tokens are bound to the evaluator instance that created them. A structurally identical object
or a token created by another evaluator cannot establish trust. Clients may use published
permission bundles as display hints, but authoritative enforcement belongs to the server or
trusted worker using results from its own lookups.

## Requirement traceability

This package and its tests provide partial foundation coverage only:

- `IAM-001`: branded UUIDv4/UUIDv7 identifiers and strict UTC timestamp parsing.
- `IAM-002`: pure action, channel, resource, and scope decision primitives.
- `IAM-003`: default denial and runtime/type-level rejection of untrusted claims.
- `IAM-004`: versioned permissions and exactly six immutable initial role bundles.
- `IAM-009`: exact scoped-lookup and trusted resource-ownership gates.
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
