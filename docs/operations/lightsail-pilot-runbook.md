# DataBreeze Lightsail pilot runbook

This runbook deploys the low-cost, single-server pilot described in
`docs/plans/409-lightsail-pilot-ci-cd.md`. It is suitable for a small,
time-bounded validation period. It is not the high-availability production
architecture.

## 1. Create the host

1. In AWS Lightsail, create a Linux instance with at least 4 GB RAM in the
   closest supported region (Singapore is preferred for this pilot).
2. Allocate and attach a static IPv4 address.
3. Allow inbound TCP 80 and 443. Allow TCP 22 only from the owner/admin IP.
   Do not expose PostgreSQL, Redis, MinIO, or Mailpit.
4. Create a DNS `A` record for the pilot hostname pointing to the static IP.
5. Install Docker Engine and Docker Compose v2 on the host.

Keep the instance stopped when it is not being tested. Delete it and its
static IP after the pilot if the project will not continue; this is the main
cost control for a two-month budget.

## 2. Install the pilot files

Copy `infrastructure/lightsail/` to the host and run as root:

```bash
sudo bash /path/to/infrastructure/lightsail/bootstrap.sh
```

The bootstrap creates `/opt/databreeze`, `/opt/databreeze/releases`, and
`/opt/databreeze/backups`. Copy the Compose file and Caddyfile into that
directory if they are not already installed.

## 3. Create server-only runtime values

Copy the example and edit it only on the host:

```bash
sudo cp /opt/databreeze/.env.example /opt/databreeze/.env
sudo chmod 600 /opt/databreeze/.env
sudoedit /opt/databreeze/.env
```

Set the real domain, ACME email, database/object-store passwords, and four
different 32-byte base64url keys. Generate keys without printing them into
Git or chat, for example:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Use `DATABREEZE_RUNTIME_PROFILE=pilot`,
`DATABREEZE_PILOT_HTTPS_ORIGIN=https://<your-domain>`, and keep
`VITE_DATABREEZE_DEMO_MODE=true` for this owner-only pilot. Leave all OpenAI
variables disabled. The server `.env` is never uploaded to GitHub Actions.

Validate without starting services:

```bash
sudo docker compose --env-file /opt/databreeze/.env \
  -f /opt/databreeze/compose.pilot.yml config --quiet
```

## 4. Configure CI/CD

Create a protected GitHub environment named `pilot`. For the first low-cost
pilot, use the Ubuntu instance user (`ubuntu`) as the deployment user and keep
its SSH firewall rule restricted to the owner/admin IP. Add:

- `LIGHTSAIL_HOST`: the static IP or hostname;
- `LIGHTSAIL_DEPLOY_USER`: `ubuntu` (or an owner-created pilot user with
  passwordless sudo);
- `LIGHTSAIL_SSH_PRIVATE_KEY`: a dedicated SSH key;
- `LIGHTSAIL_KNOWN_HOSTS`: the pinned host-key line from `ssh-keyscan` after
  independently verifying the fingerprint.

The pilot workflow invokes the deployment scripts through `sudo`. Before a
wider rollout, replace `ubuntu` with a dedicated least-privilege deploy user
and narrow `sudoers`. If GHCR packages are private, log in to GHCR on the host
with a read-only package token. Never put the host `.env`, database passwords,
signing keys, or OpenAI keys in GitHub secrets or workflow arguments.

Pull requests run validation only. A push to `main` builds and publishes the
API runtime, API migration, and Web images, then deploys their immutable
digests through the protected environment. The workflow runs the migration
before the API and checks `/health/ready`; a failed health check selects the
previous release.

## 5. First deployment and acceptance

After DNS has propagated, trigger the workflow or deploy a reviewed release
file manually:

```bash
sudo /opt/databreeze/deploy.sh /opt/databreeze/releases/<release-id>.env
sudo /opt/databreeze/healthcheck.sh
```

Open `https://<your-domain>/vi-VN/sign-in`. Verify the owner journey:

1. Register with an owner test address.
2. Read the one-time code in Mailpit through an SSH tunnel:

   ```bash
   ssh -N -L 8025:127.0.0.1:8025 <user>@<host>
   ```

   Then open `http://localhost:8025`.

3. Verify the code, sign in, refresh the page, and sign out.
4. Open Data, select Reviews, choose a CSV/XLSX, and upload it. The pilot
   keeps advanced worker execution and live metric computation fail-closed;
   do not treat synthetic demo dashboard values as customer analytics.
5. Restart the stack and confirm the account/data rows remain present.

Record the exact release digest and acceptance result in the change record.

## 6. Rollback

List the release files and select a previously accepted immutable release:

```bash
sudo ls -1 /opt/databreeze/releases
sudo /opt/databreeze/rollback.sh /opt/databreeze/releases/<known-good-id>.env
sudo /opt/databreeze/healthcheck.sh
```

Rollback does not delete named volumes. If a migration is not backward
compatible, stop and restore the database volume backup before selecting an
older application image.

## 7. Backups and shutdown

Before changing images or schema, create an owner-controlled backup of the
PostgreSQL and MinIO named volumes. Store backups outside the host and test a
restore before relying on them. Do not paste database URLs or backup contents
into tickets or chat.

To stop without deleting data:

```bash
sudo docker compose --env-file /opt/databreeze/.env \
  -f /opt/databreeze/compose.pilot.yml stop
```

To remove the pilot after the two-month test, export and verify backups first,
then delete the Lightsail instance, static IP, DNS record, and GHCR images if
they are no longer needed.

## 8. Explicit pilot limits

The pilot intentionally does not claim complete production capability for
live dashboard metrics, OpenAI analysis/OCR, the JRA worker, full IAE result
transfer, external email delivery, Google OIDC, Android/Desktop device
workflows, or HA AWS operations. Those require their own approved gates and a
larger deployment budget. Keep OpenAI disabled until the previously exposed
key has been rotated and a separate provider evaluation is approved.
