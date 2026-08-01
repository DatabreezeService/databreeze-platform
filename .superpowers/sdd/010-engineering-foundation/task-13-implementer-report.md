# Task 13 Implementer Report

## Summary

Implemented the governed React 19/Vite Web shell on `feat/web-shell` with React Router,
TanStack Query, Tailwind, shared DataBreeze design tokens/UI primitives, complete shell copy for
`vi-VN` and `en`, canonical locale routes, responsive authenticated-navigation placeholders,
safe route/application recovery, canonical development/preview security response headers,
Vitest/Testing Library coverage,
Playwright desktop/mobile smoke coverage, and an automated 250 KiB gzip JavaScript budget.

The shell uses only generated checksum-protected brand derivatives. No brand asset was generated,
redrawn, recolored, distorted, or paired with duplicate visible DataBreeze text.

## RED evidence

No application implementation existed when the first test was written.

1. Initial import diagnostic:
   - Command: `corepack pnpm --filter @databreeze/web test -- test/shell.contract.test.tsx`
   - Result: exit 1 because Vite could not resolve the intentionally absent
     `src/app/app.tsx`. The test was adjusted to turn absence into an observable assertion rather
     than a transform error.
2. Valid first RED:
   - Command:
     `corepack pnpm --filter @databreeze/web exec vitest run test/shell.contract.test.tsx`
   - Result: exit 1, one test failed with `expected undefined to be defined`; the application
     boundary did not exist.
3. Minimal GREEN:
   - Same command after adding the minimal boundary.
   - Result: exit 0, one test passed.
4. Expanded contract RED:
   - Same command after requiring application error, query, and navigation boundaries.
   - Result: exit 1 because `ApplicationBoundary` was absent.
5. Acceptance behavior RED:
   - Command:
     `corepack pnpm --filter @databreeze/web exec vitest run test/shell.routing-accessibility.test.tsx test/navigation-access.test.tsx test/error-privacy-query.test.tsx`
   - Result: exit 1 with 12/12 tests failing for the intended absent behaviors: canonical locale
     routing, route-preserving locale switch, semantic landmarks, keyboard/mobile navigation,
     permission/entitlement filtering, safe recovery, bounded QueryClient defaults, and no browser
     persistence.

## Changed files

- Root: `.gitignore`, `package.json`, `pnpm-lock.yaml`.
- Web configuration: `apps/web/package.json`, `index.html`, TypeScript/Vite/Vitest/Playwright
  configs, and `scripts/check-bundle-budget.mjs`.
- Web application: `src/main.tsx`, `src/styles.css`, `src/assets.d.ts`, provider/router/locale/error,
  feature and navigation registries, shell layout/icons, governed table home, and localized shell
  state pages.
- Tests: four Vitest/Testing Library files and `e2e/shell.smoke.spec.ts`.
- Documentation: `apps/web/README.md` and this report.

## Verification evidence

- `corepack pnpm install --frozen-lockfile=false` — pass; exact dependencies installed and the
  supply-chain policy accepted the resulting lockfile.
- `corepack pnpm --filter @databreeze/web test` — final pass, 4 files and 13 tests.
- `corepack pnpm --filter @databreeze/web typecheck` — pass.
- `corepack pnpm exec eslint apps/web` — pass.
- `corepack pnpm --filter @databreeze/web build` — pass; production Vite build and automated
  budget. Final initial JavaScript: 108,656 of 256,000 gzip bytes.
- `corepack pnpm --filter @databreeze/web test:e2e` — first run failed because Playwright Chromium
  was absent. `corepack pnpm --filter @databreeze/web exec playwright install chromium` succeeded,
  but Windows Application Control blocked that downloaded executable (`spawn UNKNOWN`; direct
  probe reported `An Application Control policy has blocked this file`). The local Playwright
  config therefore selects installed Chrome outside CI; CI retains pinned Playwright Chromium.
  Final package run: 3 passed, 3 intentionally skipped cross-project combinations.
- `corepack pnpm repo:check` — pass; format, lint, dependency boundaries, strict typecheck,
  requirements, contracts, parity, and all repository tests. Web result within the run: 13/13.
- `corepack pnpm repo:build` — pass; 8/8 build tasks, including the 108,656-byte Web gzip budget.
- `corepack pnpm web:test:e2e` — pass; dependency-aware root build plus 3 Playwright smoke paths
  passed and 3 irrelevant project/test combinations skipped.
- `git diff --check` — pass in the final pre-commit verification.

## Visible product verification

Browser/IAB controls were unavailable in this delegated task, so Playwright with installed Chrome
was the fallback. Production-preview screenshots were captured at 1440x1000 for Vietnamese and a
Pixel 7 viewport for English, inspected directly with `view_image`, and removed before handoff.
There was no accepted concept image because Task 13 is explicitly an engineering shell inside the
existing design system; `docs/product/brand-and-experience.md`, generated token CSS, shared UI
primitives, and approved raster derivatives were the authoritative visual references.

Fidelity ledger:

1. Approved blue navigation wordmark retained its aspect, clear space, and original colors.
2. True white work surface, neutral rails, cobalt active/action treatment, and semantic status
   colors matched the generated tokens.
3. The primary surface remained an open work table rather than a generic card dashboard.
4. Body, heading, label, control, and numeric typography used the shared token system.
5. Desktop rail density and mobile touch controls/context/table scrolling were visible and usable.
6. Status meaning used text plus icons; active navigation, focus geometry, skip navigation, and
   reduced-motion behavior remained explicit.

The above-the-fold copy contains only required shell/context/search/navigation/work-table content;
there is no marketing hero, invented eyebrow, decorative badge, duplicate brand name, or unsupported
product claim. Core interactions verified: locale switch, desktop jobs navigation, mobile menu/jobs
navigation, notification disclosure, and safe search-unavailable feedback.

## Requirement coverage and deferrals

This is partial foundation coverage only; no `WEB-*` requirement is complete.

- `WEB-001`: navigation/context placeholders only; management workflows deferred.
- `WEB-002`: client permission/entitlement hints only; IAM/server authorization deferred.
- `WEB-004`: no sensitive browser persistence; cookie/session implementation deferred.
- `WEB-013`: complete shell routing/copy in Vietnamese and English; feature workflows deferred.
- `WEB-014`: shell landmarks, keyboard/mobile navigation, focus, 44px controls, non-color status,
  and reduced motion; workflow-level WCAG acceptance deferred.
- `WEB-020`: memory-only bounded query defaults; authenticated data/offline behavior deferred.
- `WEB-021`: safe localized shell recovery; API problem codes/correlation/remediation deferred.
- `WEB-022`: immutable route/navigation/message/permission registry; feature query/schema/telemetry
  registrations deferred.

## Commit

- Subject: `feat(web): create the governed workspace shell`
- SHA: the final commit contains this report, so its self-referential SHA is supplied by the
  controller handoff and can be resolved with `git rev-parse HEAD`.

## Concerns

- Foundation APIs and authentication do not yet exist. All organization/workspace/project,
  notifications, rows, permissions, and entitlements are typed content-minimized placeholders.
- The canonical Vite preview response-header CSP permits inline styles for Tailwind compatibility;
  script, object, frame, base, form, image, font, and connect sources remain restricted. Vite
  development intentionally omits CSP because its HMR/React Refresh preamble is inline. Task 19
  must apply the strict preview response-header policy at AWS/CloudFront before production
  deployment; this task does not claim that production hosting is configured.
- Windows Application Control blocks downloaded Playwright Chromium in this environment. Installed
  Chrome passed the same suite locally. The repository now provides explicit clean-runner Chromium
  provisioning; Task 21 must wire the documented CI command into the repository workflow.

## Fix round 1 addendum

Independent review identified five important and three minor gaps. Fix round 1 corrected all of
them test-first where production behavior changed:

1. Replaced meta-delivered CSP with one committed response-header policy used by Vite preview,
   verified the header, removed unsupported meta `frame-ancestors`, and proved an
   embedding attempt is blocked. AWS/CloudFront enforcement remains explicitly assigned to Task 19.
2. Made `ApplicationBoundary` derive its recovery locale from canonical router state; the English
   crash regression no longer injects a locale manually.
3. Replaced the hidden 1x1 search submit with a visible keyboard-focusable control whose browser
   geometry is at least 44x44 pixels.
4. Required job-create permission and the automation entitlement, routed the enabled action to the
   intentional Jobs unavailable state, and changed inert context buttons to semantic content.
5. Added exact clean-CI Chromium provisioning commands and documented Task 21 workflow ownership.
6. Made description metadata locale-neutral, expanded browser-persistence probes across Storage,
   IndexedDB, Cache Storage, and service-worker registration, prohibited persistence integrations
   by dependency assertion, and documented the `Retry-After` deferral.

Final fix-round evidence is recorded in `task-13-fix-round-1-report.md`. The final Web unit result
is 5 files and 18 tests; the browser matrix is 17 passed and 3 intentional cross-project skips; the
initial JavaScript remains within budget at 108,251/256,000 gzip bytes.

## Fix round 2 addendum

Re-review found that applying the strict preview CSP unchanged to Vite development blocked the
inline React Refresh preamble and produced a blank shell. Fix round 2 removed only the development
server header application; `WEB_SECURITY_HEADERS` and preview enforcement remain unchanged.

A dedicated Playwright development-server configuration now starts Vite on strict port 5173 and
asserts that the English workspace renders, the response has no development CSP header, and the
browser reports no CSP/React Refresh preamble error. Separate root commands expose preview and
development lanes; the combined `web:test:e2e` and provisioned `web:test:e2e:ci` paths run both.
Final evidence is recorded in `task-13-fix-round-2-report.md`.
