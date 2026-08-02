# Task 13 Fix Round 2 Report

## Outcome

Resolved the single re-review finding without weakening the preview or future production policy.
`WEB_SECURITY_HEADERS` still contains strict `script-src 'self'` and remains attached to Vite
preview. Vite development now omits CSP because its local HMR/React Refresh preamble is inline; no
unsafe script directive was added.

## RED/GREEN evidence

The production change that the regression catches is reattaching the strict preview headers to
`server.headers` (or otherwise returning a development CSP that blocks Vite's inline preamble).

- RED command:
  `corepack pnpm --filter @databreeze/web exec playwright test --config playwright.dev.config.ts`
- RED result: one real Chrome test failed. `/en/workspace` had no `Open governed work` heading, and
  the Vite server reported `@vitejs/plugin-react can't detect preamble. Something is wrong.`
- Minimal change: removed `server.headers` from `vite.config.ts`; did not alter
  `WEB_SECURITY_HEADERS` or `preview.headers`.
- GREEN result: the same command passed 1/1. The workspace heading rendered, the development
  response omitted CSP, and the browser collected no matching CSP/React Refresh/preamble error.

## Verification

- `corepack pnpm --filter @databreeze/web test`: pass, 5 files and 18 tests.
- `corepack pnpm --filter @databreeze/web typecheck`: pass.
- `corepack pnpm exec eslint apps/web`: pass.
- `corepack pnpm --filter @databreeze/web build`: pass; initial JavaScript
  108,251/256,000 gzip bytes.
- `corepack pnpm --filter @databreeze/web test:e2e:preview`: pass, 17 tests and 3 intentional
  cross-project skips. The strict response-header and frame-blocking regressions remain green.
- `corepack pnpm web:test:e2e:dev`: pass, 1/1 against the Vite development server.
- `corepack pnpm web:test:e2e`: pass; dependency build, preview suite, and development suite all ran
  in the combined repository path.
- `corepack pnpm --filter @databreeze/web browser:install:ci --dry-run`: pass; resolved pinned
  Chromium 1234 and its platform support payload.
- `corepack pnpm repo:check`: pass; Web contributed 18/18 unit tests.
- `corepack pnpm repo:build`: pass, 8/8 tasks.
- `git diff --check`: run again immediately before the atomic commit.

## Browser path and scope

The in-app Browser plugin was attempted first as required by the frontend-debugging workflow, but
its runtime reported no available browser backends. The committed regression and rendered
verification therefore used the repository's installed-Chrome Playwright fallback.

A separate installed-Chrome QA probe at 1440x1000 confirmed URL `/en/workspace`, title
`DataBreeze`, visible `Open governed work`, no CSP response header, and an empty browser-error list.
Its screenshot showed the complete navigation, search, context, governed table, and create action
rather than the blank development shell reproduced during RED; the screenshot was emitted for
inspection and not written into the repository.

The development omission is limited to Vite's local HMR server. Task 19 must apply the unchanged
strict preview policy equivalently at AWS/CloudFront. Task 21 must invoke
`corepack pnpm web:test:e2e:ci`, which provisions Chromium and then runs both preview and development
browser lanes.

## Commit

- Required subject: `fix(web): preserve vite development under strict preview csp`
- The commit SHA is resolved after this report is included in the atomic commit.
