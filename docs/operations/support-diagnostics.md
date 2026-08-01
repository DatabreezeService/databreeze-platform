# Support Diagnostics Runbook

Support diagnostics are authorization-scoped, time-bounded, and content-safe.
They may contain component versions, processor digests, correlation IDs,
status/reason codes, durations, counts, and redacted health summaries. They do
not contain source values, evidence snippets, file names or paths, credentials,
provider payloads, or unrestricted tenant identifiers.

## Collect

1. Confirm the support actor, organization/workspace scope, customer consent
   where required, and the incident correlation ID.
2. Export the minimum redacted diagnostics, audit references, job/result IDs,
   device health, and provider/processor status needed to reproduce the issue.
3. Prefer a synthetic reproduction or a customer-supplied redacted fixture.
   Attach the manifest and hashes, not the original file.
4. Set an expiry and retention class. Delete the support package through the
   governed workflow and record the deletion result.

Access to diagnostics never grants access to linked source content, evidence,
billing secrets, or another workspace. Any suspected leakage is a security
incident: preserve the audit event, revoke the access path, and follow the
secret-rotation runbook.
