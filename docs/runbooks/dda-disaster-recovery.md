# DDA Disaster Recovery Runbook

**Blocked on:** MANUAL-PREREQUISITES §2 (AWS accounts, PITR, KMS) and §8 (restore rehearsal acceptance)

## Target

- RPO/RTO recorded from a real restore drill into isolated staging.
- RDS PITR + versioned S3 + KMS recovery; Redis loss must not drop authoritative work.

## Agent-safe preparation

1. Keep OpenTofu production-shaped tfvars examples reviewed (no apply).
2. Use `tools/recovery/verify-dda-restore.mjs` after a human-driven restore.
3. Record measured RPO/RTO in `docs/evidence/dda/restore-drill-report.md`.

## Commands (owner-operated)

```text
# After restore into staging (example; adjust identifiers):
node tools/recovery/verify-dda-restore.mjs --database-url <staging-restored-url>
```
