# DDA Release Readiness

## Verdict

**Not production ready.** Mentor/fixture G4 journey is evidenced. G5 remains blocked on plan 401 gates and unchecked MANUAL-PREREQUISITES. `delivery.productionReady` remains `false`.

## Branch

`codex/dda-400-production` integrates G1–G4 evidence from plans `081`–`087`. Plan authority is split: legacy WEB control stays in `400-production-readiness.md`; DDA production/G5 is `401-dda-production-readiness.md`; agent-first resume is `402-dda-code-first-completion.md`; OpenAI development validation is `403-openai-development-validation.md`.

## Code-first resume baseline (plan 402 Task 1)

| Item | Value |
|---|---|
| Baseline commit (pre-Task-1 tip) | `4968003f53357bc4c28bca45aff37a7e5f84d5d1` |
| Planned create paths (081–087) | 206 existing / 211 declared (5 missing) |
| Known missing create paths | OpenAI adapter/contract tests, offline OpenAI evaluation corpus, production journey runbook, consolidated release evidence |
| G5 | `blocked` |
| `DDA-051` | deferred / post-ga |
| External blockers | MANUAL-PREREQUISITES (AWS, OpenAI production project, signing, Play, legal, on-call, release approval) |

### Fresh command posture at resume (do not treat as completion evidence)

| Check | Resume observation |
|---|---|
| TypeScript typecheck | pass (historical on tip) |
| requirements / orchestration / contracts | pass |
| domain / engine / Web tests | pass after `@databreeze/ui` build |
| format:check | fail (repo Prettier drift) |
| lint | fail (ESLint errors, including promise-returning ports) |
| shared fixture counts / OpenAPI DDA routes | fail / incomplete — owned by plan 402 Task 3 |
| Live OpenAI / AWS / signing | blocked — never fabricated |

## Requirement honesty

| ID | Verification |
|---|---|
| DDA-038 | `partial` — messy-sales processor parity harness green; foundation ports still partly prototype |
| DDA-040 | `partial` — durable encrypted Android staging landed; real-device CameraX/upload blocked |
| DDA-044 | `partial` — OpenAI fail-closed + egress policy tests; live eval blocked (§3) |
| DDA-051 | `deferred` / `post-ga` — streaming rejected in V1 enums |
| DDA-001..050 others | remain lane `partial` / planned unless already evidenced |

No requirement is promoted by this baseline freeze.

## Prototype gaps closed on this branch

- OpenAI adapter interface + fail-closed config (no fake credentials)
- DDA processor digest pin catalog
- Desktop folder UI composed into shell nav; watcher adapter owned by main
- Android `FileBackedReceiptStagingStore` for durable encrypted staging
- Staging/production OpenTofu environments + OpenAI secret definition
- Production gate matrix, runbooks, restore/load scaffolds

## Prototype gaps still open

- Real IAE/DSM/JRA/BUA/AUD/DSO adapters instead of DdaModule prototype ports
- Full ActionRegistry ActionHandler enrollment (digest pins exist; typed multi-action protocol pending)
- Live OpenAI evaluation corpus + pinned model promotion
- Prisma-backed DDA repositories (still in-memory adapters)
- CSP-safe chart paths without `unsafe-eval` (CSP kept strict)
- Signed Desktop/Android artifacts, restore drill, staged AWS apply

## Remaining plan 401 gates

See `docs/evidence/dda/production-gate-matrix.md`. Do not mark G5 complete without owner evidence.

## Rollback

Revert commits on `codex/dda-400-production` after the 087 merge if a production scaffolding change regresses. Do not loosen authority behavior to force green.
