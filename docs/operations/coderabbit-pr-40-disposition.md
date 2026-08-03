# CodeRabbit disposition for promotion PR 40

Promotion PR [#40](https://github.com/DatabreezeService/databreeze-platform/pull/40)
received exactly one automatic full CodeRabbit review. No manual rerun or second
review was requested.

- Review ID: `4845720374`
- Run ID: `2397e2ad-4258-4b05-9516-0a8b6fb4f39c`
- Submitted: `2026-08-03T15:20:07Z`
- Reviewed range: `8a4c0af52ed872715103710e3c89ca832f999bd4..f1573921446e9f86313e0f58b926777aed9e1402`

## Valid findings fixed

All six actionable inline findings, the outside-diff orchestration finding, and
the twelve review-body nitpicks were reproduced against the reviewed code and
fixed in focused commits on `fix/coderabbit-pr-40-reconciliation`:

| Finding | Disposition and evidence |
|---|---|
| FND-007 was omitted from B01 task traversal. | Accepted. `789a3db` records `FND-007` as an explicit handoff task and asserts its position in the orchestration checker. |
| Project-scoped bootstrap sessions lost `projectId`; `apiVersion` was too broad. | Accepted. `37f2289` preserves project scope and constrains the generated API schema. |
| Invitation and removed memberships could be activated through `transition`. | Accepted. `cc1118a` requires an existing `ACTIVE` membership for administrative transitions; invitation activation remains in `accept`. |
| Membership identity uniqueness did not cover nullable scope components. | Accepted. `e98c63e` adds the null-safe PostgreSQL uniqueness index, in-memory parity, conflict mapping, and migration inventory coverage. |
| Hierarchy reads and membership outcomes returned denial/not-found/conflict envelopes as HTTP 200. | Accepted. `0689d70` maps hierarchy `NOT_FOUND` to 404 and membership result codes to 400/403/404/409/410/503, with generated OpenAPI and regression tests. |
| Windows Android test command mixed PowerShell and cmd.exe syntax. | Accepted. `de3ff3d` documents valid commands for both shells. |
| Maintainability and boundary nitpicks (shared DTO constants, cross-field scope validation, identity state coverage, adapter equality/filtering, rollback assertions, and mapped bootstrap assertions). | Accepted. These are covered by `c459a10`, `06588ea`, `0689d70`, and the preceding `37f2289` test changes. |

## Rejected findings

None. Every posted actionable finding and review-body nitpick had a reproducible
correctness, contract, security, or test-coverage improvement in this slice.

## Verification and merge rule

The focused fixes must pass the affected API/domain tests, OpenAPI drift check,
`corepack pnpm repo:check`, `corepack pnpm repo:build`, and the hosted checks on
the follow-up `dev` PR. This document records the single-review disposition; it
does not authorize a second CodeRabbit run. PR #40 remains unmergeable until the
fix PR is merged to `dev`, its promotion checks are green, and all valid findings
are resolved.
