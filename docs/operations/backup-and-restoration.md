# Backup and Restoration Runbook

PostgreSQL is authoritative for metadata, permissions, jobs, approvals, sync
changes, usage, and audit records. Versioned object storage is authoritative
for cloud artifact bytes. Redis is disposable and is rebuilt from durable
state.

## Routine evidence

- RDS point-in-time recovery and encrypted snapshots are enabled.
- Object buckets use versioning, lifecycle policy, KMS encryption, and a
  separately monitored recovery configuration.
- Restoration is exercised at least quarterly and after material migration or
  storage changes. The release record stores RPO/RTO evidence.

## Restore test

1. Open a change/incident record and select a synthetic or approved redacted
   snapshot. Never restore production data into a developer machine.
2. Restore PostgreSQL and object versions into isolated names and verify KMS,
   schema migrations, tenant scopes, audit seals, artifact hashes, and deletion
   holds.
3. Rebuild Redis, run outbox reconstruction, reconcile job leases and usage,
   rebuild sync cursors, and run the dogfood workflow.
4. Compare counts, hashes, sequences, and release evidence. Keep the restored
   environment isolated until an authorized cutover is approved.

## Recovery failure

Stop the cutover, preserve the failed evidence, page the incident owner, and
use the last known-good restore point. Do not rewrite audit history or silently
discard unreconciled jobs, approvals, conflicts, or provider delivery state.
