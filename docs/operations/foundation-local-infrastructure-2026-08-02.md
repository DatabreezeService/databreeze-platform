# FND-003 local infrastructure evidence

Observed at (UTC): 2026-08-02
Branch: `feat/fnd003-local-infra-batch`
Task: `FND-003 — Close local infrastructure gaps`

## Implemented boundaries

- PostgreSQL 17.5, Redis 7.4.5, MinIO, Mailpit, and the OpenTelemetry collector
  remain pinned in `infrastructure/local/compose.yml`.
- PostgreSQL initialization creates every module-owned schema and contains no
  credentials, roles, or secret literals.
- `tools/repo-cli/src/local-services.mjs` provides `check`, `start`, `stop`,
  `reset`, `restart-check`, `status`, and legacy `smoke` commands.
- Lifecycle commands preserve named volumes. `reset` uses Compose
  `down --remove-orphans` without `--volumes`; data deletion is never implicit.
- Preflight reports missing Docker CLI/daemon, host port collisions, and
  insufficient free disk space before starting containers.
- `restart-check` restarts the running stack and waits for every service health
  check, providing the entry point for persistence evidence.

## Verification

Passed:

- `node --test tools/repo-cli/test/local-infrastructure.test.mjs`
- `node tools/repo-cli/src/local-services.mjs --help`
- `node tools/repo-cli/src/local-services-smoke.mjs --help`
- `node tools/repo-cli/src/local-services.mjs config`
- `git diff --check`

Environment-gated:

- `node tools/repo-cli/src/local-services.mjs check` fails closed with
  `Docker daemon is unavailable` because no Docker daemon is running here.
- Live `compose up`, health polling, port-collision simulation, disk-pressure
  threshold validation, and restart-persistence checks must run on a machine
  with Docker Desktop/Compose v2 before FND-003 can become `verified`.

## Rollback

Revert the lifecycle commit and retain the prior static Compose checks. No
containers, named volumes, host files, or credentials are modified by the
repository changes.
