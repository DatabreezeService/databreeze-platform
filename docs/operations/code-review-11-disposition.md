# CodeRabbit Review 11 Disposition

**Promotion PR:** [#11](https://github.com/DatabreezeService/databreeze-platform/pull/11)

**Review run:** `8cc266ad-874b-4781-a97d-ebe86b0eb521`

**Completed at (UTC):** 2026-08-02T09:28:06Z

**Invocation policy:** This was the one permitted full CodeRabbit review for PR #11. No second review will be requested.

## Valid issues fixed

The following ten valid issues (nine inline comments plus one task-conditional nitpick) were reproduced against the reviewed `dev` commit and are being fixed in focused commits before promotion:

1. The Luna bootstrap prompt now makes PostgreSQL migration/tenant tests conditional on durable-state changes and client coverage conditional on client behavior.
2. The evidence record stores the full source commit SHA while retaining the short display prefix.
3. The rollback note explains that reverting the reconciliation test removes `repo:check` enforcement and requires a fresh check.
4. Parallel-lane guidance now keeps CRF/PDA and MR/DQG serial by default and requires explicit interface-level control records before any overlap.
5. Android and Python normalized-key transformations are defined deterministically with examples.
6. The orchestration state section separates requirement states from plan/task states and includes all ledger vocabulary transitions.
7. The handoff record captures the CodeRabbit invocation timestamp in UTC.
8. Redis-loss recovery now fences stale workers and reconciles durable leases/effect receipts before redispatch.
9. Worktree instructions now select `feat/`, `fix/`, `docs/`, `ci/`, or another conventional prefix based on task type.
10. The orchestration path validator rejects backslashes, dot segments, parent segments, and resolved paths outside the repository root.

The review grouped the first item as a nitpick and the remaining items as inline comments; all are recorded here because they affect the safety contract.

## Rejected issues with evidence

### Duplicate plan catalog

CodeRabbit suggested moving the plan catalog out of `tools/repo-cli/src/check-execution-orchestration.mjs` and importing it from the test. The test intentionally keeps an independent expected catalog: it is the oracle that detects a checker or ledger silently dropping, reordering, or recounting a plan. Sharing the same map would allow the checker and test to drift together and would remove that protection. The current duplication is therefore deliberate and documented; no code change is made.

### Docstring coverage warning

The walkthrough reported a 0% docstring-coverage warning. Docstring coverage is not a repository check, release gate, or requirement in this project. The affected files are executable CLI/checker code and Markdown evidence, and adding decorative docstrings would not improve the validated behavior. The repository’s actual gates—format, lint, typecheck, contract parity, tests, builds, scans, Android checks, and infrastructure static checks—remain the acceptance evidence.

## Verification

Valid fixes must pass targeted tests, `corepack pnpm repo:check`, `corepack pnpm repo:build`, and the hosted checks on the follow-up `dev` PR. This document is evidence of the rejected comments and must remain in the promotion diff; it does not claim that a second CodeRabbit review occurred.
