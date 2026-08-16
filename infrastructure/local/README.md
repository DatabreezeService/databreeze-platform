# Local Infrastructure

For the relationship between the HMR watcher profile, built local gateway,
and Lightsail deployment, see [Local development and Lightsail pilot](../../docs/architecture/local-and-pilot-development.md).

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

To run the usable local application instead of dependencies alone, run:

```powershell
pnpm local:services app-start
```

This command starts the dependencies, builds the local images, applies the
complete Prisma migration inventory in a one-shot container, and waits for the
API and Web gateway to become healthy. Open <https://localhost:8443>; API calls
remain on that same HTTPS origin and the API container has no published host
port. Verification mail is captured at <http://localhost:8025>.

After the application is healthy, seed the comprehensive synthetic fixture:

```powershell
pnpm local:seed
```

The seed is idempotent, creates tenant-scoped records, and uploads fixture bytes
to local MinIO. It prints four local sign-in accounts, including an `admin`
account with organization/workspace/project administration memberships, and a generated password;
set `DATABREEZE_LOCAL_SEED_PASSWORD` in the ignored
`infrastructure/local/.env` first if you need a stable password.

The full seed expects MinIO to be healthy. If you intentionally want metadata
only, generate the client once and run
`corepack pnpm --filter @databreeze/api seed:local -- --skip-objects`; those
placements are marked unavailable so the UI does not claim that source bytes
exist.

Caddy creates a local-only certificate authority in the named
`web-caddy-data` volume. A browser may require one explicit trust/continue step
the first time it opens the site. Do not disable HTTPS: the production-shaped
browser session deliberately retains `HttpOnly`, `Secure`, and `SameSite=Lax`
cookies. The local CA and synthetic keys are development material only and
must never be copied into a deployment.

For normal product development, keep this Docker stack running and use host
watchers for the application processes:

```text
corepack pnpm dev:infra
corepack pnpm dev:api
corepack pnpm dev:web
```

The Web URL is <http://127.0.0.1:5173/vi-VN>; it uses Vite HMR and
proxies API paths to the watched host API at <http://127.0.0.1:3000>. The
`dev:api` watcher uses the database-backed local composition, runs Prisma
generation/migrations, and talks to the Docker PostgreSQL, Redis, and Mailpit
services. Registration, OTP, password reset, sign-in, refresh, logout, and durable data
changes therefore exercise the real local backend while Web source changes
update without a rebuild. The pilot/production Caddy URL is for built-image
validation, not HMR.

For this HMR profile, use the loopback HTTP URL above. The built gateway is a
separate HTTPS endpoint at <https://localhost:8443>; opening it as
`http://localhost:8443` produces “Client sent an HTTP request to an HTTPS
server”. It serves the built Web image and intentionally keeps Secure cookies;
it is not the hot-reload endpoint.

The stack is defined in [`compose.yml`](compose.yml). All state is held in
named volumes prefixed by the Compose project name; no repository directory is
mounted for database, object, or mail data. The volumes are disposable and are
not removed by the lifecycle commands. Remove the named volumes only when you
explicitly want to discard local state.
Every published port is bound to `127.0.0.1`, so the development credentials and
data endpoints are not reachable from other hosts on the local network.
Container JSON logs are capped at 10 MiB per file with three retained files so
diagnostics cannot silently consume the host disk.

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
| `pnpm local:services persistence-check` | Restart Redis and verify a disposable sentinel survives. |
| `pnpm local:services status` | Print container/health state without changing it. |
| `pnpm local:services logs --tail=100` | Print bounded, read-only logs for known local services. |
| `pnpm local:services app-start` | Build, migrate, start, and wait for the same-origin HTTPS API and Web profile. |
| `pnpm local:seed` | Generate the Prisma client and idempotently seed the comprehensive synthetic local fixture. |
| `pnpm local:services app-status` | Print dependency, migration, API, and Web health without changing state. |
| `pnpm local:services app-logs --tail=100` | Print bounded migration, API, and Web logs. |
| `pnpm local:services app-stop` | Stop API and Web while preserving dependencies, containers, and named volumes. |

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
| API | Durable local control plane; reachable only through the HTTPS gateway | internal `api:3000` |
| Web gateway | Static Web SPA and same-origin API reverse proxy | `https://localhost:8443` |

The PostgreSQL init script creates the module schemas only. It contains no
credentials and runs only when the database volume is first initialized.
MinIO bucket setup runs as a short-lived Compose service and reads credentials
from the environment; it never stores them in the repository.
The collector is a minimal image, so an adjacent curl-only health companion
probes its health endpoint; this keeps the collector image free of a shell or
package manager while still making readiness observable.

The app profile uses the explicit `DATABREEZE_RUNTIME_PROFILE=local` API
composition while retaining `NODE_ENV=production`. PostgreSQL and Redis remain
durable authorities, Mailpit is the local email provider, and all application
ports stay on the isolated Compose network except the loopback HTTPS gateway.

Mailpit is the default OTP and password-recovery provider and captures messages at
<http://localhost:8025>. To deliver OTP and password-recovery messages to a real Gmail inbox during local
testing, set `DATABREEZE_LOCAL_EMAIL_PROVIDER=gmail` in the ignored
`infrastructure/local/.env`, set the SMTP host to `smtp.gmail.com`, port `465`,
the Gmail account as both SMTP username and sender, and provide a Google App
Password through `DATABREEZE_IAM_SMTP_APP_PASSWORD`. Google 2-Step Verification
must be enabled before an App Password can be created. The API uses
certificate-validated TLS and never accepts a normal Gmail password or
plaintext external SMTP. Never commit `.env` or place the App Password in the
Web bundle.

The local Web image also defaults `VITE_DATABREEZE_DEMO_MODE=true` so the
dashboard, data, and analysis routes have an immediately inspectable synthetic
presentation dataset. The top bar labels this mode as `Bản demo cục bộ`; it is
never enabled by the production Web Dockerfile default and must not be used as
evidence of live customer metrics.
Production startup validation is not relaxed or inferred from `DATABASE_URL`.
MinIO still starts as a foundation dependency. Governed Web CSV/XLSX intake is
available locally through the local MinIO adapter and can be exercised from
`/vi-VN/reviews`; the cloud worker and general IAE object-transfer paths remain
fail-closed until their production-grade local endpoint seam is approved. The
UI must not represent those advanced paths as usable.

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
