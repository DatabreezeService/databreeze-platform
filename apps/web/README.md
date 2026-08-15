# Web Application Shell

The Web deployable is the Vietnamese-first DataBreeze control-center shell. It establishes
governed route, provider, navigation, accessibility, privacy, and extension boundaries; it does
not implement foundation APIs, authentication, or customer workflows.

## Architecture

- React 19 and Vite own the SPA entry point. React Router owns canonical locale routes and safe
  route-level recovery.
- `ApplicationBoundary` composes the application error boundary, a privacy-conscious TanStack
  Query client, and the router. Both outer recovery and shell locale context are derived from the
  canonical route.
- `WEB_FEATURE_REGISTRY` and `WEB_NAVIGATION_REGISTRY` are immutable build-time registries.
  Permission and entitlement values are display hints only; every future server operation still
  requires authoritative IAM enforcement.
- The home surface is an open work table. Feature routes intentionally render calm unavailable
  states until their APIs exist.
- Tailwind is compiled through Vite. Product CSS consumes
  `@databreeze/design-tokens/css/v1` and accessible controls from `@databreeze/ui/v1`.
- The generated blue navigation wordmark and Web icons are imported from the checksum-protected
  design-token package. They are not redrawn, recolored, distorted, or paired with duplicate
  visible brand text.

## Commands

From the repository root after `corepack pnpm repo:bootstrap` and one dependency build:

```text
corepack pnpm repo:build
corepack pnpm --filter @databreeze/web dev
corepack pnpm --filter @databreeze/web test
corepack pnpm --filter @databreeze/web typecheck
corepack pnpm --filter @databreeze/web build
corepack pnpm web:test:e2e
corepack pnpm web:test:e2e:dev
corepack pnpm web:test:e2e:preview
corepack pnpm web:browser:install:ci
corepack pnpm web:test:e2e:ci
```

For the everyday edit-refresh loop, run the split local stack from the
repository root:

```text
corepack pnpm dev:infra   # Docker: PostgreSQL, Redis, MinIO, Mailpit, OTEL
corepack pnpm dev:api     # watched API on http://127.0.0.1:3000
corepack pnpm dev:web     # Vite + React Refresh on http://127.0.0.1:5173
```

Open `http://127.0.0.1:5173/vi-VN/workspace`. Vite proxies `/v1`, `/v3`, and
`/health` to the API, so editing `apps/web/src/*` updates the browser without
rebuilding a container. Do not use the pilot/production Caddy URL for this
loop; it serves a built bundle and has no HMR. `dev:stack` prints the same
three-terminal instructions without leaving background processes behind.

The root `web:test:e2e` command builds public workspace dependencies first, runs the production
preview desktop/mobile suite, and then starts the Vite development server for its browser
regression. `web:test:e2e:preview` and `web:test:e2e:dev` expose those lanes independently. Local
Windows Application Control may block Playwright's downloaded browser; local configurations use
installed Chrome while CI uses Playwright Chromium. The build fails when initial JavaScript exceeds
250 KiB gzip.

`web:browser:install:ci` runs `playwright install --with-deps chromium`, so a clean Linux runner
receives both Chromium and its system libraries. `web:test:e2e:ci` provisions that browser before
the preview and development browser suites. Task 21 must invoke this CI command when it adds the
repository workflow; Task 13 intentionally does not add or change workflow files.

## Localization routing

- `/vi-VN/...` is canonical and complete by default.
- `/en/...` is the complete English alternate.
- Missing locale segments are prefixed with `vi-VN`; invalid locale segments are replaced
  deterministically while preserving the logical route.
- The locale switch preserves path, query string, and fragment. Locale is never inferred from or
  persisted to browser preferences, localStorage, or sessionStorage.

## Security and privacy boundaries

- One canonical response-header policy in `security-headers.ts` supplies CSP (including
  `frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, and
  `X-Content-Type-Options: nosniff` to Vite preview responses. Vite development intentionally omits
  CSP because its local-only HMR/React Refresh preamble is inline; it does not weaken or fork the
  preview policy with unsafe script directives. The HTML does not attempt to set unsupported
  `frame-ancestors` through a CSP meta element. Task 19 must configure the AWS/CloudFront hosting
  response headers with this same strict preview policy before production deployment; Task 13 does
  not claim that production hosting is configured yet.
- Query cache lifetime and retry behavior are bounded. No query persistence plugin is installed.
- The current retry policy uses short bounded defaults only. Reading RFC 7807 responses and
  honoring `Retry-After` is deferred until the typed control-plane HTTP adapter is available.
- No bearer token, refresh credential, device secret, provider secret, tenant payload, preview,
  or source content is written to browser persistence. Future refresh credentials belong only in
  server-issued `HttpOnly`, `Secure`, `SameSite` cookies.
- Route and application failures expose localized recovery copy, never exception details or stack
  traces. Full RFC 7807 mapping and correlation IDs wait for the control-plane contract.
- Organization/workspace/project values are non-interactive, content-minimized placeholders. They
  are not server authority and contain no customer data.

## Extension points

Add a future feature through the build-time feature and navigation registries, then register its
route, message key, permission hints, entitlements, query namespace, schemas, and telemetry
allowlist together. Feature code must consume generated public contracts and foundation packages;
it must not import service implementations or execute arbitrary runtime third-party modules.

## Task 13 partial requirement coverage

No `WEB-*` requirement is marked complete by this shell.

- `WEB-001`: partial navigation placeholders for workspace, project, Inbox, jobs, reviews,
  approvals, reports, devices, administration, usage, and audit. Management workflows are
  deferred.
- `WEB-002`: partial client-side permission/entitlement presentation only. Authentication and
  server authorization are deferred.
- `WEB-004`: partial no-sensitive-browser-persistence boundary. Cookie/session infrastructure is
  deferred.
- `WEB-013`: partial complete shell copy and canonical routing for `vi-VN` and `en`. Feature
  workflows, validation, notifications, and domain formatting remain deferred.
- `WEB-014`: partial semantic landmarks, skip navigation, keyboard/mobile navigation, active-route
  semantics, visible focus, 44px controls, text-plus-icon status, and reduced motion. Workflow-level
  WCAG acceptance remains deferred.
- `WEB-020`: partial content-minimized, memory-only QueryClient defaults. Authenticated data and
  explicit encrypted export/offline behavior remain deferred.
- `WEB-021`: partial localized not-found and safe route/application recovery. Stable control-plane
  problem codes, correlation IDs, and retry remediation are deferred.
- `WEB-022`: partial immutable build-time route/navigation/message/permission registration.
  Feature schemas, query namespaces, and telemetry registrations are deferred to their modules.
