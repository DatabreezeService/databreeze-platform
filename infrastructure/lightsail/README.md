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
5. Copy `compose.pilot.yml`, `Caddyfile`, `backup.sh`, and `.env.example` to
   `/opt/databreeze`.
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

- The published Web image uses `VITE_DATABREEZE_DEMO_MODE=false`. Pilot data is
  read from the API and database rather than compiled browser fixtures.
- Mailpit is the default OTP provider and is suitable for owner testing. To
  send OTPs to real inboxes during this pilot, set the following values in the
  protected `/opt/databreeze/.env` on the server:

  ```dotenv
  DATABREEZE_LOCAL_EMAIL_PROVIDER=gmail
  DATABREEZE_IAM_SMTP_HOST=smtp.gmail.com
  DATABREEZE_IAM_SMTP_PORT=465
  DATABREEZE_IAM_SMTP_USERNAME=support.databreeze@gmail.com
  DATABREEZE_IAM_SMTP_APP_PASSWORD=<Google-App-Password>
  DATABREEZE_IAM_EMAIL_FROM_ADDRESS=support.databreeze@gmail.com
  ```

  Gmail requires 2-Step Verification and an App Password; never use a normal
  account password. The sender address must match the SMTP username. The same
  transport sends OTP verification and password-recovery messages. Password
  recovery also requires a separate `DATABREEZE_IAM_RECOVERY_DIGEST_KEY` in
  `/opt/databreeze/.env`; generate it on the server with the command below and
  never commit or paste the value:

  ```bash
  value="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
  if sudo grep -q '^DATABREEZE_IAM_RECOVERY_DIGEST_KEY=' /opt/databreeze/.env; then
    sudo sed -i "s|^DATABREEZE_IAM_RECOVERY_DIGEST_KEY=.*|DATABREEZE_IAM_RECOVERY_DIGEST_KEY=${value}|" /opt/databreeze/.env
  else
    echo "DATABREEZE_IAM_RECOVERY_DIGEST_KEY=${value}" | sudo tee -a /opt/databreeze/.env >/dev/null
  fi
  unset value
  ```

  Use SES separately for a wider production rollout.
- OpenAI is disabled by default. To activate the reviewed server adapters, put
  `OPENAI_API_KEY` only in `/opt/databreeze/.env`, pin each model variable, and
  enable only the needed `DATABREEZE_OPENAI_*_ENABLED` switches. Mapping sample
  rows remain blocked unless `DATABREEZE_OPENAI_MAPPING_ALLOW_SAMPLES=true` is
  explicitly accepted; those are bounded real rows, not mock data.
- PayOS requires `PAYOS_PROVIDER=payos`, all three PayOS credentials, and exact
  public, success, and failure URLs in `/opt/databreeze/.env`. Browser bundles
  never receive those credentials.
- The 68-user/21-subscription/12-feedback pilot fixture is opt-in. Set
  `DATABREEZE_PILOT_SEED_ENABLED=true` together with a server-only operator
  email, display name, and password for one approved activation. The seed uses
  bounded upserts, never deletes production rows, and never rotates an existing
  password credential during replay. Disable the switch after the successful
  activation.
- The worker and advanced result-transfer path remain fail-closed until their
  typed workload and transfer gates pass.
- `deploy.sh` runs `backup.sh` before every migration when a current release
  exists. It writes a PostgreSQL custom-format dump, both MinIO buckets, a
  manifest, and SHA-256 checksums under `/opt/databreeze/backups`. A failed
  backup blocks deployment.
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
- Before invoking the server deploy script, the workflow uploads the current
  Caddy, Compose, backup, healthcheck, rollback, and deploy scripts. It never
  replaces `/opt/databreeze/.env`.
- The server backs up the current release, runs the migration, optionally runs
  the approved pilot seed, starts API/Web, checks `/health/ready`, and keeps the
  previous release file for rollback.

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
review `/opt/databreeze/.env`. The workflow logs the server's root Docker
client into GHCR with the job-scoped `GITHUB_TOKEN` (granted `packages: read`)
immediately before pulling the immutable images, then removes those
credentials in an always-run cleanup step. No additional GHCR secret is
required. Keep SSH restricted to the owner/admin IP. The workflow never sends
the server `.env` or application secrets to GitHub.

All real providers remain controlled by server-only switches. Mailpit remains
the source-controlled default; Gmail, OpenAI, and PayOS are enabled only in the
protected host environment. Rotate any credential that was pasted into a chat
or ordinary terminal before production use.
