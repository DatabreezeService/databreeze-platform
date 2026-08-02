# FND-003 local infrastructure evidence

Observed at (UTC): 2026-08-02
Branch: `feat/fnd003-local-infra-batch`
Task: `FND-003 — Close local infrastructure gaps`

## Implemented boundaries

- PostgreSQL 17.5, Redis 7.4.5, MinIO, Mailpit, and the OpenTelemetry collector
  remain pinned in `infrastructure/local/compose.yml`.
- PostgreSQL initialization creates every module-owned schema and contains no
  credentials, roles, or secret literals.
- `tools/repo-cli/src/local-services.mjs` provides daemon-free `config` and
  `preflight` commands plus `check`, `start`, `stop`, `reset`,
  `restart-check`, `status`, bounded read-only `logs`, and legacy `smoke`
  commands.
- Lifecycle commands preserve named volumes. `reset` uses Compose
  `down --remove-orphans` without `--volumes`; data deletion is never implicit.
- Preflight reports missing Docker CLI/daemon, host port collisions, and
  insufficient free disk space before starting containers.
- `restart-check` restarts the running stack and waits for every service health
  check, providing the entry point for persistence evidence.
- `persistence-check` writes a five-minute Redis sentinel, restarts only Redis,
  verifies the sentinel, and deletes it; it never flushes a database or volume.
- The documented lifecycle command set includes `config`, `preflight`, `check`,
  `start`, `stop`, `reset`, `restart-check`, `persistence-check`, `status`,
  `logs`, and the legacy `smoke` entry point.

## Verification

Passed:

- `node --test tools/repo-cli/test/local-infrastructure.test.mjs`
- `node tools/repo-cli/src/local-services.mjs --help`
- `node tools/repo-cli/src/local-services-smoke.mjs --help`
- `node tools/repo-cli/src/local-services.mjs config`
- `node tools/repo-cli/src/local-services.mjs preflight --min-free-gib=0`
- `git diff --check`

Environment-gated:

- `node tools/repo-cli/src/local-services.mjs check` fails closed with
  `Docker daemon is unavailable` because no Docker daemon is running here.
- The daemon-free `preflight` command completes Compose, port, and disk checks
  without starting containers; the evidence run used a zero-GiB threshold so
  it remains independent of the workstation's available disk headroom.
- Live `compose up`, health polling, port-collision simulation, disk-pressure
  threshold validation, and restart-persistence checks (including
  `persistence-check`) must run on a machine with Docker Desktop/Compose v2
  before FND-003 can become `verified`.

## Rollback

Revert the lifecycle commit and retain the prior static Compose checks. No
containers, named volumes, host files, or credentials are modified by the
repository changes.
