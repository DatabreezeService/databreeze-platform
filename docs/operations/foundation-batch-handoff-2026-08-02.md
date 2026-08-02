# Foundation batch handoff

Observed at (UTC): 2026-08-02
Canonical repository: `databreeze-platform`
Branch: `feat/fnd003-local-infra-batch`
Base: `origin/dev` at `92b3e9a4d581f3a6947b7a2bf58c8334f4ae0c18`
Promotion base: `origin/main` at `a2fcba34037c1ffd77816be16be75453abfb16fa`

## Active delivery boundary

- FND-003 local infrastructure is `in-progress`. Static Compose, bootstrap,
  lifecycle, port, Docker-diagnostic, disk-preflight, and daemon-free config
  checks are committed.
- Live Docker health, port-collision simulation, disk-pressure threshold, and
  restart-persistence evidence remain environment-gated because the Docker
  daemon is unavailable on the current machine.
- The batch also hardens AWS static checks, content-safe telemetry handling,
  infrastructure path-aware CI, and the updated 30–70 commit policy. These
  changes are not marked as verified foundation tasks until their own gates are
  recorded.

## Verification already run

- Local infrastructure, AWS infrastructure, CI policy, change-scope, telemetry,
  orchestration, and diff checks pass in their scoped commands.
- `node tools/repo-cli/src/local-services.mjs config` passes without a Docker
  daemon; `check` fails closed with a clear daemon-unavailable reason.
- Android lifecycle review fixes were promoted through PRs #17 and #18; the
  existing PR #14 promotion was merged to `main` after hosted checks and its
  single CodeRabbit review/incremental dispositions.

## Git batching rule

This is a normal feature batch. Keep atomic commits and do not open the feature
PR until the branch reaches at least 30 commits, targeting approximately 70 and
never reaching 100. The only small-PR exceptions are focused promotion-review
fixes required to close an already-open `dev`→`main` gate.

At this checkpoint the branch is 70 commits ahead of `origin/dev`. The current
boundary is still coherent: FND-003 local lifecycle hardening is accompanied by
portable AWS safety, telemetry, CI/supply-chain, and evidence updates. Continue
with scoped foundation work until the final handoff boundary; do not manufacture
empty commits or open a small feature PR merely to reset the count.

## Safest next command

```powershell
git status --short --branch
git fetch origin dev main
node tools/repo-cli/src/check-execution-orchestration.mjs
node --test tools/repo-cli/test/**/*.test.mjs
```

After the normal batch reaches its commit boundary, push this branch, open one
PR to `dev` without CodeRabbit, merge after hosted checks, then create the
separate `dev`→`main` promotion PR and invoke CodeRabbit exactly once there.
