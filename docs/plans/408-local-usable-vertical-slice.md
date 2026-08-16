# Plan 408: Local Usable Vertical Slice

**Status:** Approved by the product owner on 2026-08-14  
**Primary requirements:** FND-003, IAM-001, IAM-009, IAM-022, IAM-023, WEB-002, WEB-004, WEB-022

## Outcome

Provide one reproducible local command that uses Docker-backed PostgreSQL, Redis, MinIO, and Mailpit to start a same-origin HTTPS API and Web application. A user can register with email/password, read the OTP in Mailpit, verify the account, enter the server-derived personal workspace, reload through refresh-token rotation, sign out, and be denied access to protected routes afterward.

The slice must preserve production security. It must not weaken production startup validation, cookie attributes, tenant authorization, generated-contract validation, or fail-closed feature behavior. Unsupported cloud execution stays visibly unavailable rather than returning demo or fabricated results.

## Tasks

1. Add failing tests for a local-only runtime composition using durable Prisma IAM/session/bootstrap state, Redis admission control, Mailpit delivery, safe local keys, and the existing MinIO endpoints. Compose IAM-022 activation with a narrow DSO-008 initial-workspace-policy transaction participant that creates the server-owned HYBRID revision-1 policy/current pointer and supplies only its content-safe binding to IAM. Exact replay must reuse the binding; mismatched or partial state fails closed. Production composition must remain unchanged and fail closed.
2. Add a closed unpublished v4 `/v1/me/bootstrap` contract, fixtures, generated TS/Python/Kotlin models, and API response conformance. Web derives navigation and workspace scope from this server response.
3. Add a same-origin HTTPS local gateway and reproducible lifecycle command that starts dependencies, applies all migrations, builds/starts API and Web, and reports bounded readiness failures. Also provide a database-backed host watcher profile: `dev:infra` owns Docker dependencies, `dev:api` runs the watched API against those durable services, and `dev:web` keeps Vite HMR while proxying to that API. The HMR profile is explicitly loopback-only and may use HTTP-only development cookies; the built local gateway remains HTTPS with Secure cookies.
4. Wire registration, OTP verification, sign-in, refresh-on-reload, logout, and protected-route redirects through the generated contracts. Browser credentials remain HttpOnly, Secure, SameSite=Lax and never enter persistent JavaScript storage.
5. Connect the first meaningful data path through local MinIO: create an authorized upload/intake, preserve server-owned tenant scope, show the durable Inbox/Data result, and expose a real starter-dashboard creation/load path after a governed dataset version exists. Remove false-success/demo behavior from the authenticated path. Features without an authoritative backend dependency expose localized unavailable or empty states.
6. Verify unit/contract/typecheck gates plus a real browser journey against the running local stack. Record the exact command, Mailpit URL, and production-only remaining gates.

## Acceptance

- A fresh local database migrates without manually reconstructing `DATABASE_URL`.
- Registration sends exactly one bounded OTP message to Mailpit and verification atomically creates one user, personal organization, workspace, server-owned HYBRID DSO policy/current pointer, Owner membership, and rotating Web session. Exact verification replay creates no second policy or Workspace binding.
- Refresh survives a page reload; logout clears/revokes the current session; the old refresh credential cannot restore access.
- `/v1/me/bootstrap` supplies the displayed identity and scope; the Web does not use `DEFAULT_ACCESS_CONTEXT` for a signed-in production-shaped route.
- A signed-in Owner can upload one supported local file through MinIO-backed multipart storage and observe its durable intake state. If preparation cannot yet create a governed DatasetVersion, the UI states that exact blocker and does not fabricate a starter dashboard.
- Docker/runtime commands are idempotent and leave production/provider gates unchanged.
- Cloud worker-dependent features remain fail closed until their typed input-delivery dependency exists.
