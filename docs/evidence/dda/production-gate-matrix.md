# DDA Production Gate Matrix (Plan 401)

**Branch:** `codex/dda-400-production`  
**HEAD (docs refresh):** see latest `feat(dda|engine|desktop|web|android):` commits on this branch  
**Status:** G5 blocked — agent-implementable prototype gaps closing; owner MANUAL-PREREQUISITES incomplete  
**Authority:** `docs/plans/401-dda-production-readiness.md`, `docs/plans/402-dda-code-first-completion.md`, `docs/plans/MANUAL-PREREQUISITES.md`

| Task | Gate area | Agent status | Owner blocker | Evidence / notes |
|---|---|---|---|---|
| 1 | Release manifest + evidence matrix | in-progress | — | This file + `release-manifest.json` (`productionReady: false`) |
| 2 | Staging/production AWS OpenTofu | partial | §2 AWS accounts/OIDC | `infrastructure/aws/environments/{staging,production}` plan-only |
| 3 | OpenAI receipt/AI adapters | partial | §3 OpenAI project/key/eval + quality | Fail-closed adapters for receipt + mapping/analyst/narrative/dashboard; offline corpus **repaired** (readable 600×900 fixtures + admission tests). Prior live run retained as **plumbing only** (solid-square corpus invalidated model-quality conclusions). Assistance Tasks 6–10 offline green; live assistance not run. `productionReady`/`promotionEligible` false. See `openai-receipt-evaluation.md` + `openai-assistance-evaluation.md`. |
| 4 | Tenant isolation / API protection | partial | §2 staging deploy | Unit/composition tests; e2e against live staging blocked |
| 5 | Retention / deletion / privacy | partial | §2 retention approvals, §3 OpenAI retention | Runbook drafted; live proof blocked |
| 6 | Backup / restore / DR | blocked | §2 AWS + restore rehearsal | Content-safe environment-only live verifier implemented; real isolated restore evidence pending |
| 7 | Observability / alarms | partial | §8 on-call owners | Runbooks drafted; CloudWatch apply blocked |
| 8 | Performance / cost | partial | §3/§8 budgets | Bounded HTTPS staging readiness load probe implemented; representative live p95/cost evidence pending |
| 9 | Web a11y / i18n / CSP | partial | §4 devices/browsers | Strict CSP retained (no `unsafe-eval`); dashboard live/API mode wired with fail-closed empty states; full AA review blocked |
| 10 | Desktop signing / release | blocked | §5 Windows signing identity | Runbook drafted; governed FS watcher attaches after capability-backed binding (capability still fail-closed until DSO enrollment) |
| 11 | Android Play / signing | blocked | §6 Play account/signing | CameraX + durable staging + authenticated v2 upload/extraction clients when `AuthenticatedApiConfig` supplied (else fail-closed); JVM/lint/assemble green; emulator `connectedDebugAndroidTest` blocked without device; Play signing blocked |
| 12 | CI/CD / rollback | partial | §2 OIDC protected envs | Workflow hardening notes; apply blocked |
| 13 | E2E acceptance / staged release | blocked | §1/§4/§8 audience + owners | Mentor demo ≠ production acceptance |
| 14 | G5 approval | blocked | All applicable MANUAL-PREREQUISITES | Do not mark complete without evidence |

## Prototype gap closures (agent wave)

| Gap | Status | Notes |
|---|---|---|
| DdaModule foundation ports (IAE/DSM/JRA/BUA/AUD/DSO) | closed (composition) | Defaults fail closed (`DDA_FOUNDATION_UNAVAILABLE`); lookup-backed adapters + `platform/dda-foundation.composition.ts` for real authorities when composed. No silent prototype success. |
| Prisma-backed DDA metadata repos | closed (code) | Dashboard / analysis-plan / refresh repositories + durable refresh coordinator when `ddaDatabase` supplied; in-memory remains test/dev fallback without DB. |
| ActionRegistry DDA enrollment | closed (code) | Engine closed registry enrolls pinned DDA handlers; digest mismatch fails closed (`b1f53ba`). |
| Desktop native FS watcher | closed (code path) | Watcher lifecycle after capability-backed binding; unfamiliar schemas quarantine; capability resolver still null/deny until DSO (`e7010f5`). |
| Android CameraX / upload | partial | Capture→encrypted staging→contracts v2 authenticated upload/extraction/review clients (`8971a89`); fail-closed without API session; no emulator/device/Play verification. |
| Web CSP / live dashboards | partial | No `unsafe-eval`; `GET /v1/dda/dashboards/:id/draft` authorizes via request tenant context and returns structural draft only (no invented cells); Web live client fails closed on 401/403. Full AA/Playwright still blocked. |
| Refresh persistence | closed (code) | Durable coordinator persists open refresh/idempotency/snapshots/state; ETL proposals, drafts, dependency sequence pointers Prisma-backed when `ddaDatabase` supplied; production composition fails closed without DB (`DDA_PRODUCTION_DATABASE_REQUIRED`). |

## Honesty rules

- Mentor/fixture golden journey (G4) is complete; production-shaped live journey is not.
- `delivery.productionReady` remains `false`.
- Missing credentials must never be fabricated; tasks stay `blocked` with checklist IDs.
- G5 remains blocked on MANUAL-PREREQUISITES — do not claim production readiness.
