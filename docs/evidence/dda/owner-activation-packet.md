# DDA Owner Activation Packet

**Purpose:** Minimal owner actions required after code-first Tasks 1–11. Cursor does not ask for secret values in chat.  
**G5 / `productionReady`:** remain blocked until every applicable row is verified with rollback.

| Action | Purpose | Provider console | Non-secret decision needed | Secret destination | Validation Cursor runs after | Rollback / revoke |
|---|---|---|---|---|---|---|
| AWS accounts + OIDC | Staging/prod apply path | AWS Organizations / IAM OIDC | Account IDs, role ARNs, regions, budgets | CI OIDC trust only (no long-lived keys in repo) | `corepack pnpm infra:validate` then owner-approved plan/apply | Destroy staging stack / revoke OIDC role |
| DNS + TLS hostnames | Public API/Web endpoints | Route53 / ACM | Hostnames | ACM/private key in AWS | Staging smoke GET health | Detach alias; revoke cert |
| OpenAI project + key | Live receipt OCR eval / staging | OpenAI project settings | Model pin, `store:false`, retention, spend cap | Secret store / CI protected env `OPENAI_API_KEY` | Offline eval (already green); capped `--live` after corpus approval | Rotate key; disable project |
| OpenAI protected corpus | Quality gate for DDA-044 | Owner corpus store | Synthetic-only attestation | Not in git | Live eval runner with `--live` | Withdraw corpus access |
| Windows code signing | Desktop release | Cert vendor / Azure Key Vault | Identity subject | HSM/Key Vault | Unsigned build already; signed verify after | Revoke cert |
| Google Play signing + listing | Android distribution | Play Console | Package id, privacy declarations | Play App Signing | `:app:assembleRelease` unsigned first; then Play upload | Unpublish / revoke key |
| Pilot tenants + devices | Staged enablement | IAM tenant admin | Invite list | — | Tenant isolation e2e on staging | Revoke grants |
| On-call / legal / privacy owners | Alarms + retention approvals | Internal roster | Named owners | — | Alarm dry-run docs | Reassign ownership |
| Final release authority | G5 | Internal change board | Go / no-go | — | Full gate matrix review | Keep `productionReady: false` |

## Do not

- Paste secrets into chat or commit them
- Mark G5 complete from mentor/fixture journeys alone
- Promote DDA-044 while live quality remains failing
