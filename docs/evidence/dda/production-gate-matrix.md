# DDA Production Gate Matrix (Plan 400)

**Branch:** `codex/dda-400-production`  
**Status:** G5 blocked — agent scaffolding in progress; owner MANUAL-PREREQUISITES incomplete  
**Authority:** `docs/plans/400-production-readiness.md`, `docs/plans/MANUAL-PREREQUISITES.md`

| Task | Gate area | Agent status | Owner blocker | Evidence / notes |
|---|---|---|---|---|
| 1 | Release manifest + evidence matrix | in-progress | — | This file + `release-manifest.json` |
| 2 | Staging/production AWS OpenTofu | partial | §2 AWS accounts/OIDC | `infrastructure/aws/environments/{staging,production}` plan-only |
| 3 | OpenAI receipt/AI adapters | partial | §3 OpenAI project/key/eval | Fail-closed adapter + egress tests; live eval blocked |
| 4 | Tenant isolation / API protection | partial | §2 staging deploy | Unit/composition tests; e2e against live staging blocked |
| 5 | Retention / deletion / privacy | partial | §2 retention approvals, §3 OpenAI retention | Runbook drafted; live proof blocked |
| 6 | Backup / restore / DR | blocked | §2 AWS + restore rehearsal | Runbook + verify script scaffold |
| 7 | Observability / alarms | partial | §8 on-call owners | Runbooks drafted; CloudWatch apply blocked |
| 8 | Performance / cost | partial | §3/§8 budgets | Load scripts scaffold; live p95 blocked |
| 9 | Web a11y / i18n / CSP | partial | §4 devices/browsers | CSP remains strict (no `unsafe-eval`); full AA review blocked |
| 10 | Desktop signing / release | blocked | §5 Windows signing identity | Runbook drafted |
| 11 | Android Play / signing | blocked | §6 Play account/signing | Runbook drafted; durable staging landed |
| 12 | CI/CD / rollback | partial | §2 OIDC protected envs | Workflow hardening notes; apply blocked |
| 13 | E2E acceptance / staged release | blocked | §1/§4/§8 audience + owners | Mentor demo ≠ production acceptance |
| 14 | G5 approval | blocked | All applicable MANUAL-PREREQUISITES | Do not mark complete without evidence |

## Honesty rules

- Mentor/fixture golden journey (G4) is complete; production-shaped live journey is not.
- `delivery.productionReady` remains `false`.
- Missing credentials must never be fabricated; tasks stay `blocked` with checklist IDs.
