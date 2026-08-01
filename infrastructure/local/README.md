# Local Infrastructure

This directory contains the disposable services used by the DataBreeze control
plane during development. It is deliberately provider-neutral: application
code talks to PostgreSQL, Redis, S3-compatible object storage, SMTP, and OTLP
through adapters, so the same contracts work with managed services later.

## Quick start

1. Copy `.env.example` to `.env` and change the local-only values if needed.
2. Start Docker Desktop (or another Docker Engine with Compose v2).
3. Run `pnpm local:smoke -- --start` from the repository root.
4. Open Mailpit at <http://localhost:8025> and MinIO Console at
   <http://localhost:9001> when you need to inspect local data.

The stack is defined in [`compose.yml`](compose.yml). All state is held in
named volumes prefixed by the Compose project name; no repository directory is
mounted for database, object, or mail data. The volumes are disposable and are
not removed by the smoke script. Use `docker compose --env-file
infrastructure/local/.env -f infrastructure/local/compose.yml down` to stop
the containers. Remove the named volumes only when you explicitly want to
discard local state.

## Services

| Service | Purpose | Local endpoint |
| --- | --- | --- |
| PostgreSQL | Authoritative metadata and module-owned schemas | `localhost:5432` |
| Redis | Dispatch hints, locks, cache, and rate limits | `localhost:6379` |
| MinIO | S3-compatible artifact and result bytes | `localhost:9000` / console `9001` |
| Mailpit | Captures development SMTP and email previews | SMTP `localhost:1025`, UI `8025` |
| OpenTelemetry Collector | Receives OTLP traces, metrics, and logs | OTLP gRPC `4317`, HTTP `4318` |

The PostgreSQL init script creates the module schemas only. It contains no
credentials and runs only when the database volume is first initialized.
MinIO bucket setup runs as a short-lived Compose service and reads credentials
from the environment; it never stores them in the repository.

## Safety and troubleshooting

- These images and credentials are for local development. Never copy `.env`
  into a deployment or commit it.
- The Compose health checks are the readiness contract for local consumers.
  `pnpm local:smoke` validates the Compose file and reports the first unhealthy
  service. Add `--start` to bring the stack up before polling.
- If a previous run left a stopped container, rerun the smoke command; it is
  idempotent and does not delete volumes.
- If Docker is unavailable, the static infrastructure tests still validate the
  service definitions, image release lines, volume names, and credential-free
  initialization files.
