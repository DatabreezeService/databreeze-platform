# DDA Retention and Deletion

**Status:** Partial — policy ports and IAE retention constraints exist; live provider privacy proof blocked (§2/§3)

## Rules

- Immutable originals and accepted DatasetVersions are never silently overwritten.
- Retention holds go through IAE (`addRetentionConstraint`); DDA cannot delete IAE bytes directly.
- Ordinary telemetry excludes source values, receipt images/text, local paths, prompts with customer content, evidence snippets, and secrets.
- OpenAI retention posture must match the approved project configuration before G5.

## Validation (when staging exists)

```powershell
corepack pnpm --filter @databreeze/api exec node --test test/features/dda/dda-policy.service.test.ts
# Future: dda-retention-deletion.e2e.test.ts against restored staging
```
