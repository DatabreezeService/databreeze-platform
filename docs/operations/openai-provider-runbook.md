# OpenAI Provider Runbook (ADR-0005)

**Status:** Agent-authored setup; live production use blocked on MANUAL-PREREQUISITES §3  
**Secret name:** `databreeze/{staging|production}/openai/api-key`
**Env mapping (API/worker only):** `OPENAI_API_KEY` from Secrets Manager; never Web/Desktop/Android

## Owner setup (content-safe)

1. Create a dedicated OpenAI production project with billing, spend limits, rate limits, and a named owner (§3).
2. Approve retention / regional processing posture and update privacy disclosures to match.
3. Create a service credential in the OpenAI console and paste it **only** into AWS Secrets Manager secret `databreeze/<env>/openai/api-key`.
4. Set ECS task secrets to inject `OPENAI_API_KEY` from that secret ARN.
5. Pin `DATABREEZE_OPENAI_RECEIPT_MODEL` to an evaluated snapshot (not a floating alias).
6. Keep `DATABREEZE_OPENAI_RECEIPT_ENABLED=true` only after evaluation passes; set `false` for kill switch.

## Validation commands (no secret printing)

```powershell
# Fail-closed without credentials
$env:OPENAI_API_KEY=$null
$env:DATABREEZE_OPENAI_RECEIPT_ENABLED='true'
corepack pnpm --filter @databreeze/api exec node --test test/features/dda/openai-egress-policy.test.ts

# Confirm secret exists (ARN only)
aws secretsmanager describe-secret --secret-id databreeze/staging/openai/api-key --region ap-southeast-1 --query ARN
```

## Fail-closed behavior

- Missing key → `OPENAI_CREDENTIAL_UNAVAILABLE`; deterministic/manual receipt path remains.
- Kill switch false → adapter disabled even if key present.
- `store` forced false; tools disabled.
- Unevaluated model mapping → `OPENAI_EVALUATION_REQUIRED` (no invented fields).

## Incident

See `docs/runbooks/dda-openai-outage.md`.
