# Web Application Shell

The Web deployable is the Vietnamese-first DataBreeze control-center shell. It establishes
governed route, provider, navigation, accessibility, privacy, and extension boundaries; it does
not implement foundation APIs, authentication, or customer workflows.

## Architecture

- React 19 and Vite own the SPA entry point. React Router owns canonical locale routes and safe
  route-level recovery.
- `ApplicationBoundary` composes the application error boundary, a privacy-conscious TanStack
  Query client, and the router. Locale context is established from the canonical route inside the
  shell.
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
```

The root `web:test:e2e` command builds public workspace dependencies first, starts the production
preview, and runs desktop plus mobile Chromium smoke coverage. Local Windows Application Control
may block Playwright's downloaded browser; the local configuration uses installed Chrome while CI
uses Playwright Chromium. The build fails when initial JavaScript exceeds 250 KiB gzip.

## Localization routing

- `/vi-VN/...` is canonical and complete by default.
- `/en/...` is the complete English alternate.
- Missing locale segments are prefixed with `vi-VN`; invalid locale segments are replaced
  deterministically while preserving the logical route.
- The locale switch preserves path, query string, and fragment. Locale is never inferred from or
  persisted to browser preferences, localStorage, or sessionStorage.

## Security and privacy boundaries

- The static shell sets a restrictive baseline CSP, `no-referrer`, and approved favicon metadata.
- Query cache lifetime and retry behavior are bounded. No query persistence plugin is installed.
- No bearer token, refresh credential, device secret, provider secret, tenant payload, preview,
  or source content is written to browser persistence. Future refresh credentials belong only in
  server-issued `HttpOnly`, `Secure`, `SameSite` cookies.
- Route and application failures expose localized recovery copy, never exception details or stack
  traces. Full RFC 7807 mapping and correlation IDs wait for the control-plane contract.
- Organization/workspace/project values are typed, content-minimized placeholders. They are not
  server authority and contain no customer data.

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
