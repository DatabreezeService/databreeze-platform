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

```powershell
# After restoring into an isolated staging database, enter the URL privately.
$restoredSecret = Read-Host 'Restored staging DATABASE_URL' -AsSecureString
$restoredPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($restoredSecret)
try {
  $env:DATABREEZE_RESTORED_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($restoredPointer)
  node tools/recovery/verify-dda-restore.mjs --acknowledge-isolated-restored-staging
} finally {
  Remove-Item Env:DATABREEZE_RESTORED_DATABASE_URL -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($restoredPointer)
}
```

The verifier prints only allowlisted table counts and never prints the URL or row contents.
