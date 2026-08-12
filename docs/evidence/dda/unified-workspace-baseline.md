# Unified Workspace Baseline

**Recorded:** 2026-08-12  
**Branch:** `codex/dda-400-production`  
**HEAD at Task 1 gate:** `a30acd3b934ce558e7f9aa6dcbfb091303c35806`  
**Plan authority:** `docs/plans/406-unified-data-workspace-implementation.md`

## Retained commits

| Commit | Summary | Treatment |
|---|---|---|
| `a30acd3` | docs(product): approve unified data workspace requirements | Task 1 canonical gate; retained |
| `fe85d94` | docs(plan): map unified workspace implementation | Retained plan map |
| `7008a0e` | docs(dda): design unified data workspace experience | Retained design |
| `f46eb9b` and ancestors | Prior DDA/web durable and ETL hardening on this branch | Retained committed baseline |

## Dirty worktree audit (not folded into UDW base)

At Task 2 freeze time the worktree still contained substantial uncommitted plan 402/403/405 product diffs and untracked OpenAI assistance adapters. Per plan 406 Task 2 Step 2, slices are folded only when focused commands are green. These paths remain **isolated / uncommitted** and are not claimed as UDW regressions:

### Owner groups observed

| Owner / slice | Paths (representative) | Status |
|---|---|---|
| Plan 403 OpenAI assistance | `services/api/src/features/dda/{analyst,dashboard,etl}/**`, matching tests, `tools/fixture-validation/fixtures/dda/openai-assistance/**` | Uncommitted; not freshly verified in this gate |
| Plan 402 / receipt / durable runtime | Modified `services/api/src/features/dda/**`, prisma migration, engine digests, recovery tool | Dirty; treat as in-flight plan 402/403 |
| Web ETL accept / live config | `apps/web/src/features/**`, matching tests | Dirty; not folded |
| Desktop folder / sidecar | `apps/desktop/src/**`, matching tests | Dirty; not folded |
| Android receipt transport | `apps/android/**` | Dirty; not folded |
| Evidence / runbooks / infra examples | `docs/evidence/dda/**`, `docs/runbooks/**`, `infrastructure/aws/**` | Dirty; owner/environment evidence only |
| Runtime / agent scratch | `.superpowers/**` | Must not commit |

### Commands

| Command | Result |
|---|---|
| `git status --short` | ~147 dirty/untracked entries (excluding committed Task 1 docs) |
| `git diff --check` | CRLF warning noise only; no whitespace-error footer observed in the sampled run |
| `corepack pnpm orchestration:check` | Pass after Task 2 edits (`UDW-CONTRACTS` next; 60 DDA IDs assigned) |
| `corepack pnpm requirements:check` | Pass |
| `corepack pnpm contracts:check` | Fail on dirty uncommitted `dda-receipt-upload` schema bytes (plan 403/receipt in-flight); not folded into UDW base |
| `corepack pnpm --filter @databreeze/api typecheck` | Pass |
| `corepack pnpm --filter @databreeze/web typecheck` | Pass |
| `corepack pnpm --filter @databreeze/desktop typecheck` | Pass |
| Live OpenAI | Not run; G5 / `productionReady` remain blocked |
| Slice-focused green commits for dirty 402/403/405 product trees | Deferred; failing or unverified work stays uncommitted |

## Environment-only / owner gates

- `productionReady`: false
- Gate G5: blocked on `MANUAL-PREREQUISITES` and real owner evidence
- No fabricated secrets, signing material, or live provider promotion

## Task 2 activation records

- Added UDW work packages: `UDW-CONTRACTS`, `UDW-IAM`, `UDW-DATA`, `UDW-CONVERSATION`, `UDW-WEB`, `UDW-DESKTOP`, `UDW-ANDROID`, `UDW-INTEGRATION`
- Assigned new DDA IDs `DDA-052` … `DDA-060` once to `UDW-CONTRACTS`
- Extended orchestration checker to accept `UDW-*` packages while preserving legacy `DDA-081` … `DDA-087` validation
- Added planned traceability rows for `IAM-022` … `IAM-025`, `DDA-052` … `DDA-060`, `WEB-024`, `DSK-027`, `AND-024`
- ID reconciliation note: platform deltas use `DSK-027` and `AND-024` because `DSK-024` and `AND-023` were already allocated

## Execution discipline note

Plan dependency order still requires Task 4 durable persistence before Tasks 5–7 and 11. `UDW-INTEGRATION` owns Prisma/migration write paths including Task 4; lane agents must not start IAM/DATA/CONVERSATION product commits until Task 4 is green on the integration branch.
