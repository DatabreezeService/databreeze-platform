# Local Infrastructure

This directory contains the disposable services used by the DataBreeze control
plane during development. It is deliberately provider-neutral: application
code talks to PostgreSQL, Redis, S3-compatible object storage, SMTP, and OTLP
through adapters, so the same contracts work with managed services later.

## Quick start

1. Copy `.env.example` to `.env` and change the local-only values if needed.
2. Start Docker Desktop (or another Docker Engine with Compose v2).
3. Run `pnpm local:services start` from the repository root.
4. Open Mailpit at <http://localhost:8025> and MinIO Console at
   <http://localhost:9001> when you need to inspect local data.

The stack is defined in [`compose.yml`](compose.yml). All state is held in
named volumes prefixed by the Compose project name; no repository directory is
mounted for database, object, or mail data. The volumes are disposable and are
not removed by the lifecycle commands. Remove the named volumes only when you
explicitly want to discard local state.

## Lifecycle commands

Run these from the repository root:

| Command | Effect |
| --- | --- |
| `pnpm local:services config` | Validate Compose syntax without requiring a running Docker daemon. |
| `pnpm local:services preflight` | Validate Compose, host ports, and disk headroom without starting containers. |
| `pnpm local:services check` | Validate Compose, Docker, host ports, and free disk without starting anything. |
| `pnpm local:services start` | Run preflight, start the stack, and wait for every health check. |
| `pnpm local:services stop` | Stop containers while preserving containers and named volumes. |
| `pnpm local:services reset` | Recreate containers/networks while preserving named volumes; it never passes `--volumes`. |
| `pnpm local:services restart-check` | Restart the running stack and verify health after restart. |
| `pnpm local:services status` | Print container/health state without changing it. |
| `pnpm local:services logs --tail=100` | Print bounded, read-only logs for known local services. |

The older `pnpm local:smoke -- --start` form remains supported. Port collisions
can be resolved by copying `.env.example` to `.env` and changing the host port
variables. `check` fails closed when Docker is missing, the daemon is stopped,
or free space is below the configured threshold (`--min-free-gib=N`).

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
The collector is a minimal image, so an adjacent curl-only health companion
probes its health endpoint; this keeps the collector image free of a shell or
package manager while still making readiness observable.

## Safety and troubleshooting

- These images and credentials are for local development. Never copy `.env`
  into a deployment or commit it.
- The Compose health checks are the readiness contract for local consumers.
  `pnpm local:services status` reports the current health and
  `pnpm local:services restart-check` verifies restart persistence.
- `pnpm local:services logs --service=postgres --tail=100` is read-only and
  accepts only known service names. Logs are local diagnostics; review them
  before sharing because provider messages can still contain development data.
- If a previous run left a stopped container, rerun `pnpm local:services start`;
  it is idempotent and does not delete volumes.
- If Docker is unavailable, the static infrastructure tests still validate the
  service definitions, image release lines, volume names, and credential-free
  initialization files.
