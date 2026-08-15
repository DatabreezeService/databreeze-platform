# DataBreeze Lightsail pilot

The complete local-to-pilot topology is documented in [Local development and Lightsail pilot](../../docs/architecture/local-and-pilot-development.md).

This is the low-cost single-server pilot profile. It is intended for a small
two-month validation period, not high-availability customer production. One
Lightsail Linux instance runs Caddy, Web, API, PostgreSQL, Redis, and MinIO.

## Owner setup

1. Create a Lightsail Linux instance with at least 4 GB RAM and a static IPv4.
2. Allow inbound TCP 80 and 443. Allow SSH (22) only from the owner’s IP.
3. Point the chosen DNS name to the static IPv4 before starting Caddy.
4. Install Docker Engine and Compose v2 on the instance.
5. Copy `compose.pilot.yml`, `Caddyfile`, and `.env.example` to `/opt/databreeze`.
6. Copy `.env.example` to `/opt/databreeze/.env`, replace every `CHANGE_ME`, and run:

```bash
docker compose --env-file /opt/databreeze/.env \
  -f /opt/databreeze/compose.pilot.yml config --quiet
docker compose --env-file /opt/databreeze/.env \
  -f /opt/databreeze/compose.pilot.yml up -d
```

The API migration is a one-shot dependency. The API does not start until the
migration exits successfully and PostgreSQL, Redis, Mailpit, and MinIO are
healthy.

## Private diagnostics

Mailpit is bound to loopback on the host. Inspect it through an SSH tunnel:

```bash
ssh -N -L 8025:127.0.0.1:8025 deploy@<pilot-host>
```

Then open `http://localhost:8025` on the owner workstation. PostgreSQL,
Redis, and MinIO API ports are never published publicly.

## Pilot limits

- `VITE_DATABREEZE_DEMO_MODE=true` is allowed only for this pilot and is visibly
  labeled in the Web UI; its numbers are synthetic.
- Mailpit is suitable for owner testing. Use SES separately when external
  users must receive email.
- OpenAI is disabled by default. Never copy an API key into this file through
  source control or a CI log; place it only in the server’s protected secret
  mechanism after rotating the exposed key.
- The worker and advanced result-transfer path remain fail-closed until their
  typed workload and transfer gates pass.
- Back up the named PostgreSQL and MinIO volumes before changing the host.
- Stop or delete the instance when the pilot is not being used to control cost.

## Health check

```bash
curl --fail --silent --show-error https://<pilot-domain>/health/ready
```

The expected response is HTTP 200 with a JSON readiness body. A failed
migration or readiness check must block promotion.

## CI/CD for the pilot

The repository workflow `.github/workflows/lightsail-pilot.yml` is the deploy
path for this profile:

- Pull requests validate contracts, API/Web builds, Compose, and deployment
  scripts. They do not publish images or connect to the server.
- A push to `main` builds three immutable images (API runtime, API migration,
  and Web), pushes them to GHCR, then deploys their `sha256` digests to the
  protected GitHub `pilot` environment.
- The server runs the migration before API/Web, checks `/health/ready`, and
  keeps the previous release file for rollback.

Create a GitHub environment named `pilot` and add these protected secrets. For
the first pilot, use the Ubuntu instance user (`ubuntu`) as the deployment
user and restrict its SSH access with the Lightsail firewall. A separate
least-privilege deployment account can be added before a wider rollout.

| Secret | Value |
| --- | --- |
| `LIGHTSAIL_HOST` | Static IPv4 address or DNS name of the instance |
| `LIGHTSAIL_DEPLOY_USER` | `ubuntu` (or an owner-created pilot user with passwordless sudo) |
| `LIGHTSAIL_SSH_PRIVATE_KEY` | Dedicated deploy key, never a personal key |
| `LIGHTSAIL_KNOWN_HOSTS` | Pinned `known_hosts` line for the instance |

On the server, install the pilot files with `bootstrap.sh` and create and
review `/opt/databreeze/.env`. The workflow invokes the pilot scripts through
`sudo`; keep SSH restricted to the owner/admin IP. If the GHCR packages are private,
log in to GHCR on the server once with a read-only package token; the workflow
never sends the server `.env` or application secrets to GitHub.

The workflow intentionally leaves OpenAI, worker execution, and external
email disabled for this budget pilot. Turn those on only in a separate,
reviewed production deployment after rotating any key that was pasted into a
chat or terminal.
