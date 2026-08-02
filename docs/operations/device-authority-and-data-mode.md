# Device authority and data-mode operations

The DSO control plane stores only content-free device capabilities, typed workspace grants, and immutable data-mode policy versions. IAM remains the authority for device identity, public keys, status, and security epochs. DSO asks the IAM bridge before synchronization; an absent bridge, revoked device, stale security epoch, or unavailable authority fails closed.

## Persistence

- `dso.device_capabilities` stores a device-reported capability, an opaque local handle, a constraint digest, status, report timestamp, and revision.
- `dso.device_operational_grants` stores the workspace, capability, authorization epoch, allowed action types, data classifications, synchronization payload classes, lifetime, status, and revision.
- `dso.device_data_mode_policies` stores immutable workspace policy versions and the payload matrix used by sync admission.
- `iam.devices` and `iam.authorization_snapshots` remain IAM-owned. DSO must not add a second public-key or identity record.

All writes are tenant-scoped and immutable by identifier. State transitions require the expected revision. Corrections or narrower policy decisions create new versions; they never overwrite an accepted version.

## Composition

Production composition supplies `deviceIdentityAuthority` to `DsoModule.register`. The adapter may also receive the generated Prisma client for DSO repositories. The default module intentionally uses an unavailable authority and therefore rejects sync authorization until IAM is wired. Tests may inject in-memory ports, but must preserve the same fail-closed behavior.

## Safe rollout and rollback

1. Apply the centrally ordered DSO migrations `20260802190000_dso_capabilities_grants` and `20260802200000_dso_data_mode_policies` before enabling capability or policy routes.
2. Verify Prisma validation, generated-client drift, tenant-isolation tests, and OpenAPI validation.
3. Enable typed grant synchronization only after the IAM bridge is deployed and device status/revocation checks are observable.
4. To roll back, disable the routes/feature flag and deploy the previous API/worker image. Do not delete capability, grant, or policy rows; they are needed for audit and replay analysis.

## Content-safety invariant

Capability and policy endpoints accept IDs, digests, classifications, action names, and bounded metadata only. Local paths, source bytes, previews, OCR, and reconstructable chunks are rejected at the DTO/domain boundary and are never persisted in DSO.
