# Luna Handoff and Resume Runbook

Use this runbook to resume DataBreeze after a model, machine, branch, or hosted-check transition. It is intentionally conservative: historical chat is context, while fetched Git state, committed plans, traceability, tests, and release evidence are authority.

## Start-of-session algorithm

1. Locate the canonical `databreeze-platform` repository; do not implement in the legacy `Databreeze` directory.
2. Read repository `AGENTS.md` files, `docs/plans/README.md`, `002-complete-execution-orchestration.md`, `004-luna-max-execution-plan.md`, `execution-orchestration.json`, the selected child plan, and the requirement records it owns.
3. Fetch before trusting any recorded hash:

   ```powershell
   git fetch --all --prune
   git status --short --branch
   git branch --show-current
   git rev-parse HEAD
   git rev-parse origin/dev
   git rev-parse origin/main
   gh pr list --state open --limit 100 --json number,title,headRefName,baseRefName,isDraft,statusCheckRollup,url
   ```

4. Run `corepack pnpm orchestration:check`. Treat `execution-orchestration.json.checkpoint` as historical only; recompute the live PR/branch state.
5. Inspect the selected task's requirement records. A record marked `implemented`, `verified`, or `released` must have real code/test/evidence paths that exist and match the current commit. Downgrade an unsupported status in the same corrective commit; never preserve a false completion claim.
6. If a clean checkout is required, create an ignored worktree from the current integration base. Select the branch prefix from the task type (`feat` for capability work, `fix` for corrections, `docs` for documentation, `ci` for workflow-only work, or another conventional prefix recorded in the task). Never reuse a worktree with unrelated user changes:

   ```powershell
   git check-ignore -q .worktrees
   git worktree add .worktrees/<task-slug> -b <prefix>/<task-slug> origin/dev
   ```

7. Bootstrap exactly as repository documentation specifies. The known clean-checkout sequence is:

   ```powershell
   corepack pnpm install --frozen-lockfile
   Push-Location services/engine
   uv sync --locked --offline
   Pop-Location
   corepack pnpm repo:check
   ```

   If the offline Python cache is unavailable, use the documented online locked sync; do not alter the lock merely to make bootstrap pass.
8. Select `activeBatchId` and `nextTaskId` only if every dependency is verified and no open PR or dirty worktree already owns them. Verify that the active batch contains the next task and that its current commit/file budgets remain safe. Otherwise follow the table below and record the corrected batch and task.
9. State the selected batch/task, assumptions, entry gate, expected files, tests, commit/file budget, and stop conditions before mutation. If delegation is explicitly authorized, assign only disjoint paths with explicit integration ownership.
10. Run package-manager operations sequentially within a worktree. Never start concurrent `pnpm install`, check, test, or build commands that share the same `node_modules` tree.

## Resume-state decision table

| Observed state | Required action | Forbidden shortcut |
|---|---|---|
| Open `dev` → `main` promotion PR awaiting its first CodeRabbit review | Resume that PR, wait for the one full review, validate comments, and complete or block it before new promotion work | Opening a second promotion PR or invoking CodeRabbit twice |
| Promotion PR has one CodeRabbit review with unresolved comments | Reproduce each claim, fix valid findings on focused `fix/*` commits, document rejected claims, rerun checks, then merge when policy passes | Blindly accepting/rejecting comments or requesting another review |
| Promotion PR review was skipped, cancelled, or timed out | Keep the PR open and wait or request user direction; record that the one allowed invocation was consumed if it was sent | Reinvoking on the same PR or merging without the required review |
| Open feature PR to `dev` | Resume hosted checks and merge it after green checks; do not request CodeRabbit there | Bypassing checks or moving CodeRabbit to the feature PR |
| Feature branch has unpushed commits | Verify them, push the same branch, and update/open its PR | Recreating or squashing away atomic rollback points without approval |
| Branch diverged from `origin/dev` | Fetch, inspect both sides, merge/rebase only if repository policy and conflict ownership are clear; retest the combined tree | Resetting, overwriting, or force-pushing user work |
| Dirty tree contains only the active task's known edits | Review the diff, run targeted checks, and continue or commit the smallest complete unit | Assuming uncommitted work is valid because it looks related |
| Dirty tree has unknown or overlapping user edits | Preserve it, inspect worktrees/branches, and work elsewhere; ask only if safe isolation is impossible | Stashing, deleting, resetting, or editing over unknown work |
| Ledger `nextTaskId` conflicts with Git/evidence | Trust fetched Git and evidence, reconcile the ledger in a focused commit, and record why | Starting both tasks or silently rewriting history |
| Dependency is only `implemented`, not `verified` | Finish its tests/evidence/review gate before the dependent task | Treating merged code as a verified dependency |
| Baseline fails before task edits | Diagnose and document whether environment or repository caused it; repair in a `fix/*` unit or stop if unsafe | Attributing the failure to the new task or weakening the gate |
| Migration/schema or generated-contract drift exists | Reconcile canonical sources, regeneration, migrations, and compatibility before feature work | Editing generated clients or database state manually |
| Package installation/check reports `EBUSY` or `EEXIST` in `node_modules/.pnpm` | Another package-manager process used the same worktree or a previous one was interrupted | Stop concurrent package-manager processes, preserve tracked files, rerun one frozen install sequentially, then rerun the failed gate; never delete tracked files or alter the lock to bypass it |
| Required production/signing/business credential is unavailable | Complete all credential-independent code/tests/runbooks and stop at the explicit external gate | Using personal/untracked credentials or claiming release readiness |

## Atomic task execution loop

For each `#### TASK-ID —` item in `002-complete-execution-orchestration.md`:

1. Confirm plan dependencies, requirement ownership, feature flag, data mode, tenant scope, migration order, rollback, and platform surfaces.
2. Change canonical OpenAPI/JSON Schema first and add a failing contract/generation test when the task changes an interface.
3. Add failing domain/state-machine/policy/property tests for happy, invalid, replay, concurrency, stale-revision, authorization, and data-mode cases.
4. Add an ordered migration plus real PostgreSQL tenant/transaction/outbox tests when durable state changes. Use expand/migrate/verify/contract; immutable history is corrected with versions or compensating records.
5. Implement domain and application behavior through published ports. Repositories require tenant/workspace scope. Foundations never import another foundation's persistence.
6. Add only the required adapters and client vertical slice. Desktop renderer receives no raw Node/filesystem power; worker has no database credentials; Android background work carries IDs/revisions rather than secrets/content.
7. Add content-safe telemetry, stable problems/reason codes, kill/failure behavior, recovery, and rollback notes.
8. Update every affected traceability record with exact existing paths. Status meanings are strict:

   - `planned`: no implementation evidence.
   - `partial`: some behavior exists, but its gate is incomplete.
   - `implemented`: code exists and scoped tests pass.
   - `verified`: all required cross-platform/security/recovery evidence exists and passes at the recorded commit.
   - `released`: verified artifacts passed the coordinated rollout gate.

9. Run targeted tests first, then:

   ```powershell
   corepack pnpm repo:check
   corepack pnpm repo:build
   git diff --check
   git status --short
   ```

10. Inspect generated/runtime debris before commit. Do not commit `.venv`, `node_modules`, Gradle state, build output, logs, caches, secrets, local databases, Terraform state, or test reports unless the repository explicitly tracks a sanitized fixture.
11. Commit one independently reversible outcome with a semantic message. Do not combine contracts, an unrelated fix, and a different feature just to increase commit count.
12. Recount the active batch against its base. Do not open a normal PR below 30 commits; target about 70, stop accepting new tasks at 90, and never exceed 99. Split before the promotion diff reaches 280 changed files; the packet target is 260.
13. Push after each stable task boundary. Update the ledger/checkpoint only with verified facts and leave a handoff record if stopping.

## Pull-request and CodeRabbit protocol

1. Branch from current `origin/dev` using `feat/<scope>` or `fix/<scope>`. Keep atomic commits; preferred PR size is 30–70 commits and hard maximum is 99. Cut earlier only for a coherent boundary, a mandatory promotion-gate fix, or a safety constraint.
2. Before a feature PR, ensure it targets `dev`, has no unrelated commits, and passes local gates. Open it with requirement/task/evidence/rollback notes. CodeRabbit must not be invoked on this PR.
3. Wait for hosted checks. Diagnose failures; do not merge red or missing required checks. Merge with history that preserves the atomic rollback units, normally `--no-ff`/merge commit rather than squash.
4. Immediately compare `dev` and `main`. If `dev` contains the reviewed batch and no incompatible promotion is open, create `dev` → `main`. If the diff exceeds 280 changed files, do not invoke CodeRabbit: split/revert the feature batch or request user direction first.
5. When the promotion PR is otherwise ready, invoke CodeRabbit exactly once with a full review request. Record the invocation URL/time. Do not invoke it on the feature PR and do not ask twice on the promotion PR.
6. Wait for the review. For each comment, reproduce the claimed behavior against the exact PR commit, classify it as valid/invalid/uncertain, and save the evidence. Use `superpowers:receiving-code-review` or the repository's CodeRabbit review skill when available.
7. Fix valid findings in focused `fix/*` commits or a focused promotion branch that is safely merged back through `dev`; ensure the promotion diff remains exactly `dev` → `main`. Document rejected comments with concise technical evidence. Do not request a second CodeRabbit pass.
8. Rerun targeted checks, `repo:check`, `repo:build`, and hosted checks after fixes. Human verification owns the final response to the one review.
9. Merge the promotion only when the single full review completed, valid findings are resolved, rejected findings are documented, required checks are green, branch protection permits it, and rollback remains known.
10. Update/fetch local `dev` and `main`, record merge hashes/PRs/release evidence, then create the next integration branch from the new `origin/dev`.

## Edge-case response matrix

| Edge case | Detection | Safe response |
|---|---|---|
| Original local file might be modified | Effect plan targets the source placement or source digest changed | Fail closed; operate on an isolated copy, create a derivative, and preserve the original hash |
| Local-mode content/path appears in cloud payload or telemetry | Contract/redaction snapshot or negative egress test fails | Kill dispatch/sync, quarantine the payload, rotate exposed secret if any, open a security finding, and do not retry broadly |
| Tenant scope is absent or ancestry is ambiguous | Repository/API test or runtime guard cannot prove scope | Deny the action; never infer scope from cached UI, IDs, hashes, or object keys |
| Device/user/grant is revoked while offline | Epoch/lease/grant check is expired or mismatched | Stop new work, quarantine provisional output, require online reauthorization, and preserve local audit evidence |
| Duplicate command/job/webhook/client mutation | Existing idempotency/effect receipt matches | Return the prior outcome; never repeat a consequential effect |
| Same idempotency key has different payload | Stored request hash differs | Return a stable conflict/security problem and audit it; do not choose either silently |
| Lease expires while a worker finishes | Attempt/lease revision is stale | Reject/quarantine the result, clean grants/temp state, and let authoritative scheduling decide retry |
| Redis is lost | Dispatch/cache/lock disappears | First reconcile durable attempts and leases, fence stale workers, and verify idempotency/effect receipts; then rebuild dispatch hints from PostgreSQL outbox/jobs and redispatch only eligible work. Redis is never authority. |
| Object store is partially available | Multipart/grant/hash operation fails | Keep state resumable, avoid finalization until verification, expire grants, and reconcile abandoned parts |
| Database migration fails halfway | Migration journal/verify stage fails | Stop deploy, use the rehearsed compatible rollback/compensation path, preserve immutable records, and restore only from verified recovery points |
| Contract generation differs by runtime | Drift/parity check fails | Fix canonical schema/generator/version, regenerate all runtimes, and block merge |
| Source changes after review/approval | Digest/version/effect hash differs | Invalidate the plan and approval; create a new proposal/review rather than substituting evidence |
| Offline conflict touches protected state | Base revision or policy changed | Create an explicit conflict record; never last-write-wins memberships, approvals, policies, definitions, or effects |
| Parser encounters macro/archive/XML bomb | Admission/resource limit or sandbox detects it | Quarantine, return a safe diagnostic, release resources, and never execute embedded content |
| Provider times out after a possible write | Outcome is ambiguous | Reconcile with provider checkpoint/idempotency before retry; surface degraded/unknown state |
| Email/push/OCR/AI provider fails | Adapter health/backlog rises | Preserve canonical intent/job, use documented polling/local fallback, and avoid making the provider authoritative |
| Webhook target resolves to private/reserved address | DNS/IP/redirect validation changes | Reject delivery, audit safe metadata, and never follow the redirect |
| Disk full/antivirus lock/crash during Desktop effect | Sidecar write/journal fails | Leave source untouched, preserve staging/journal, surface recovery, and retry only after exact revalidation |
| Android process dies mid-capture/sync | WorkManager/Room state is incomplete | Resume from durable IDs/revisions/parts; never duplicate submission or leave secrets in worker input |
| Windows/Android signing key missing or compromised | Release signing/verification gate fails | Halt release, rotate/revoke via runbook, rebuild from provenance, and never ship an unsigned stable artifact |
| CodeRabbit comment conflicts with specs/tests | Reproduction disproves claim | Document rejection with paths/tests; do not change code merely to satisfy the comment |
| CodeRabbit uncovers a systemic issue late in promotion | Reproduction shows issue spans prior commits | Block promotion, create focused fix tasks, preserve the one review record, and obtain user direction if a fresh PR/review is necessary |
| Commit or changed-file budget would be exceeded | Preflight count reaches threshold | Cut a coherent PR before the hard limit; if over 280 files before promotion review, split/revert the batch before invoking CodeRabbit |
| User sends stop/override instruction | New message replaces or pauses active scope | Reach a safe boundary, preserve work, record exact state, and stop; do not continue autonomously |

## End-of-session handoff record

Add a concise record to the task/PR description or a dated, tracked release-evidence file when material work is committed. Never store secrets or source content.

```text
Observed at (UTC):
Canonical repository/worktree:
Branch / HEAD / upstream:
Remote dev / main:
Open feature PR / promotion PR:
CodeRabbit invocation count, invocation timestamp (UTC), and review URL:
Active plan / task ID:
Active delivery batch / commit count / changed-file count:
Requirement IDs and statuses changed:
Completed commits (hash — outcome):
Checks run and exact results:
Migration / contract / feature-flag state:
Valid review findings fixed:
Review findings rejected with evidence:
Known failures or blockers:
Uncommitted files and ownership:
Safest next command:
Next task ID and entry gate:
Rollback points:
```

The record supplements Git; it cannot claim `verified` without traceable test/release evidence. If nothing was committed, state that explicitly and identify whether uncommitted files are safe to discard, preserve, or continue—never discard them automatically.

## Luna bootstrap prompt

Copy this into the first Luna session and replace only the bracketed values discovered from live Git:

```text
You are resuming DataBreeze in the canonical databreeze-platform repository. Do not trust chat checkpoints until you fetch and verify Git/PR state. Read every applicable AGENTS.md plus docs/plans/README.md, docs/plans/002-complete-execution-orchestration.md, docs/plans/003-luna-handoff-runbook.md, docs/plans/004-luna-max-execution-plan.md, docs/plans/execution-orchestration.json, the selected child plan, and its requirement-traceability records.

Live verified checkpoint: branch [BRANCH], HEAD [HEAD], origin/dev [DEV], origin/main [MAIN], open feature PR [FEATURE_PR_OR_NONE], open dev→main promotion PR [PROMOTION_PR_OR_NONE]. Run the orchestration checker and the documented clean baseline before edits. Preserve all user changes and use an ignored worktree if isolation is needed.

Resume batch [BATCH_ID] and task [TASK_ID] only after proving their dependency/entry gates, branch ownership, and commit/file budgets. Follow test-first atomic delivery: canonical contracts when the interface changes, failing domain/state tests, PostgreSQL migration/tenant/transaction/outbox tests when durable state changes, implementation through ports, vertical client/adapter coverage when the task involves client behavior, safe telemetry/recovery, traceability evidence, scoped checks, repo:check, repo:build, diff review, and one reversible commit. For documentation-only or other non-durable/non-client tasks, record why those conditional tests do not apply. Do not mark merged code verified without all evidence. Run pnpm installation/check/test/build commands sequentially within one worktree.

Git flow is fixed: feat/* or fix/* → PR to dev with hosted checks and no CodeRabbit; merge preserving atomic commits; immediately open dev→main; request exactly one CodeRabbit full review there; reproduce every comment, fix only valid findings, document rejected ones, never request a second review on that PR. Prefer 30–70 commits, hard cap 99, and do not invoke the promotion review over 280 changed files.

Keep PostgreSQL authoritative, Redis ephemeral, tenant scope explicit, originals/versions immutable, Hybrid default, Local content/path out of cloud, workers without database credentials, Desktop/sidecar allowlisted, Android background payloads content-free, Vietnamese and English complete, and external providers replaceable. Stop and record state for destructive migration risk, unknown overlapping changes, privacy/security fail-open behavior, missing production/signing authority, or a spec conflict. End with the exact handoff record from the runbook.
```
