# DataBreeze API production container

This is the production API image for Task 19 / IAM-019 / DDA-036. The Dockerfile is intentionally built
from the repository root so the frozen workspace lockfile, generated contracts, domain package, telemetry
package, API build, and Prisma 7 client are produced together.

## Build and verify

Run these commands from the repository root. They do not push or deploy an image:

```powershell
node --test tools/repo-cli/test/container-build.test.mjs
node --test tools/repo-cli/test/container-packaging.test.mjs
corepack pnpm ci:containers
docker build --file infrastructure/containers/api/Dockerfile --tag databreeze-api:local .
```

The release workflow runs the same root-context Docker build on pull requests and pushes to `main`.
Release automation must promote the resulting image by its registry digest, for example:

```text
<registry>/<repository>@sha256:<image-manifest-digest>
```

The two base images are pinned to verified registry digests:

- Build image: `docker.io/library/node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532`.
- Runtime image: `gcr.io/distroless/nodejs24-debian12:nonroot@sha256:14d42e2511532589a7c7e01a753667a74fcc96266e137e8125006b87b0c32d0a`.

## Image contract

- The build uses Corepack with pnpm `11.18.0` and `--frozen-lockfile`.
- Only `@databreeze/api` and its workspace dependencies (`@databreeze/contracts`, `@databreeze/domain`, and
  `@databreeze/telemetry`) enter the build and production dependency graph.
- Prisma 7 generation runs before the TypeScript production build. The generated client is copied to
  `/app/build/prisma-client`, the first path resolved by `production-database.composition`.
- The runtime has `NODE_ENV=production`, runs as numeric UID/GID `10001:10001`, exposes port `3000`, and
  uses the existing `/health/ready` endpoint for a direct-Node healthcheck.
- The image contains no build-time secrets and has no shell entrypoint. `ENTRYPOINT` invokes Node directly so
  ECS can deliver `SIGTERM` to the application process.
- ECS must keep `readonlyRootFilesystem = true`, `user = "10001"`, and inject runtime secrets through the
  task definition/secret store. Do not pass credentials as Docker build arguments or copy environment files.

For a local read-only smoke run, provide the required runtime environment through the host secret mechanism and
use a temporary filesystem only if the chosen runtime configuration needs it:

```powershell
$serviceAccountSmokeKey = [Convert]::ToBase64String(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$env:DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY = $serviceAccountSmokeKey
try {
  docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --user 10001:10001 --env NODE_ENV=production --env DATABASE_URL --env DATABREEZE_CSRF_ALLOWED_ORIGINS --env DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY --publish 3000:3000 databreeze-api:local
} finally {
  Remove-Item Env:DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY -ErrorAction SilentlyContinue
}
```

The smoke-only envelope key above is a fresh 32-byte base64url value scoped to the current process. Production
must inject its managed key through the dedicated Secrets Manager reference documented by the compute module.

## Worker boundary

This task intentionally builds only the API image. The engine README states that the Python engine is not a cloud
worker service; the repository still has no authenticated job worker entrypoint for signed typed jobs. Do not use
this image for `worker_image`, and do not create a fake worker image. The missing authenticated job worker entrypoint
remains an honest production release blocker for the ECS worker task. The exact Plan 407 prerequisites are tracked
in `infrastructure/containers/worker/README.md`.
