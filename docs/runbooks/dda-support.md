# DDA Support Runbook

**Blocked on:** MANUAL-PREREQUISITES §8 (support owners, escalation, paging)

## Content-safe diagnostics

Ask for correlation IDs, workspace IDs, job IDs, snapshot IDs, and device enrollment state only. Refuse screenshots/logs containing receipt images, OCR text, spreadsheet cells, local paths, or secrets.

## Common states

| Symptom | Check | Safe action |
|---|---|---|
| OCR unavailable | OpenAI kill switch / credential | Manual correction path |
| Stale dashboard | Freshness reason on snapshot | Do not force partial refresh |
| Desktop folder blocked | DSO capability grant | Re-enroll device; no path in tickets |
| Android upload stuck | WorkManager + transport configured | Confirm auth; no image in tickets |
