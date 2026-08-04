# Secret Rotation Runbook

Secrets are references, not configuration values in source, logs, telemetry,
job envelopes, or client storage. Rotation is performed by an authorized
operator through the provider adapter and is audited without recording the
plaintext value.

Service-account create-replay envelopes require a stable, managed 32-byte
envelope key in every durable environment. The process-local random fallback
is limited to tests and private alpha instances with no durable service-account
repository; it must not be used by replicas or after a restart. Rotate the
managed key through an overlap plan and invalidate old replay envelopes before
retiring the previous key.

## General procedure

1. Identify the secret reference, owning organization/workspace, provider,
   capability scope, and reason. Confirm the incident or maintenance ticket.
2. Create a new version in the managed secret store with a short overlap. Do
   not print or paste the value into a terminal transcript.
3. Update the adapter reference atomically, test a harmless capability probe,
   and monitor failures, retries, and rate limits.
4. Revoke the old version after the overlap, invalidate affected sessions or
   connector grants, and verify that old credentials fail.
5. Append the audit event and record only reference ID, key version, actor,
   correlation ID, outcome, and timestamps.

## Emergency compromise

Disable the provider/connector or processor kill switch, revoke all affected
versions, rotate signing keys with overlap, revoke device/service-account
identities when required, and notify the incident owner. Preserve audit and
delivery evidence. Never attempt a remote wipe claim for a local device; revoke
new authorization and require a newly enrolled identity.

## Verification

Check that logs, notifications, exports, error responses, SBOM/provenance, and
support diagnostics contain no secret material. Run the provider contract tests
and one synthetic authorized operation before re-enabling the capability.
