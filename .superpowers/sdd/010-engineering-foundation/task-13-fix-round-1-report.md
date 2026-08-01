# Task 13 Fix Round 1 Report

## Outcome

Addressed every important finding and each low-risk minor finding in the independent review. The
shell now enforces clickjacking protection in Vite development/preview response headers, localizes
outer recovery from the canonical route, exposes a visible 44px search submit, keeps governed
actions behaviorally honest, provisions CI Chromium explicitly, uses neutral metadata, guards the
no-persistence boundary more broadly, and records the `Retry-After` deferral.

## RED/GREEN evidence

1. Security response policy:
   - RED: `playwright test e2e/security-policy.spec.ts --project=chromium` failed 3/3: no CSP
     response header, meta CSP still advertised `frame-ancestors`, and the iframe loaded the English
     workspace.
   - GREEN: the same command passed 3/3 after `WEB_SECURITY_HEADERS` was shared by Vite development
     and preview and the CSP meta element was removed.
2. Production-composition recovery locale:
   - RED: the focused recovery test could not find `The workspace could not start` when an English
     router and crash child were supplied without a locale override.
   - GREEN: `vitest run test/error-privacy-query.test.tsx` passed 5/5 after the boundary subscribed
     to canonical router state and derived its locale.
3. Search focus geometry:
   - RED: the focused Playwright test measured the keyboard-focused submit at one pixel wide.
   - GREEN: the same test passed after the submit became a visible shared Button; focus, visibility,
     width, and height assertions all passed.
4. Governed interactions:
   - RED: `vitest run test/navigation-access.test.tsx` produced three intended failures: create
     remained enabled without automation, clicking did not navigate, and context values were still
     buttons.
   - GREEN: the same file passed 5/5 after both access hints were required, create navigated to
     `/:locale/jobs`, and context became a semantic definition list.
5. Clean CI provisioning:
   - RED: the valid provisioning regression found no `browser:install:ci` script.
   - GREEN: the focused file passed after adding `playwright install --with-deps chromium`, the root
     provisioning command, and the ordered `web:test:e2e:ci` command.

Neutral metadata and broader persistence coverage were verification-only minor hardening additions:
both locale routes pass metadata checks; representative search, notification, job, and locale
interactions produce no Storage/IndexedDB/Cache Storage/service-worker writes; and the Web manifest
assertion rejects known persistence integrations.

## Final verification

- `corepack pnpm --filter @databreeze/web test`: pass, 5 files and 18 tests.
- `corepack pnpm --filter @databreeze/web typecheck`: pass.
- `corepack pnpm exec eslint apps/web`: pass.
- `corepack pnpm --filter @databreeze/web build`: pass; initial JavaScript
  108,251/256,000 gzip bytes.
- `corepack pnpm --filter @databreeze/web test:e2e`: pass, 17 tests and 3 intentional
  cross-project skips across installed Chrome desktop and Pixel 7 projects.
- `corepack pnpm --filter @databreeze/web browser:install:ci --dry-run`: pass; resolved pinned
  Playwright Chromium 1234, its headless shell, FFmpeg, media support, and platform dependency step.
- `corepack pnpm repo:check`: pass; Web contributed 18/18 passing tests.
- `corepack pnpm repo:build`: pass, 8/8 tasks.
- `git diff --check`: pass (Git emitted only its Windows LF-to-CRLF advisory for `index.html`).

Browser/IAB controls were unavailable in this delegated task, so Playwright with installed Chrome
was the documented fallback. Windows Application Control still prevents executing Playwright's
downloaded Chromium locally; the committed CI provisioning command is intended for a clean Linux
runner and Task 21 owns workflow integration.

## Scope boundaries

- Task 19 must apply `WEB_SECURITY_HEADERS` equivalently in AWS/CloudFront. Vite preview evidence is
  not represented as production-hosting evidence.
- Task 21 must invoke `corepack pnpm web:test:e2e:ci` in the repository CI workflow.
- Header-aware retry delay remains deferred until the typed control-plane HTTP Problem and
  `Retry-After` adapter exists.
- Permission and entitlement checks remain client presentation hints; the server is authoritative.

## Commit

- Required subject: `fix(web): harden shell security and interactions`
- The commit SHA is resolved by the controller after this report is included in the atomic commit.
