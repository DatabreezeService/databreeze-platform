import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const dockerfilePath = path.join(
  repositoryRoot,
  'infrastructure',
  'containers',
  'api',
  'Dockerfile',
);
const dockerignorePath = path.join(repositoryRoot, '.dockerignore');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'api-container.yml');
const runbookPath = path.join(repositoryRoot, 'infrastructure', 'containers', 'api', 'README.md');
const workerDockerfilePath = path.join(
  repositoryRoot,
  'infrastructure',
  'containers',
  'worker',
  'Dockerfile',
);
const workerRunbookPath = path.join(
  repositoryRoot,
  'infrastructure',
  'containers',
  'worker',
  'README.md',
);
const workerEntrypointPath = path.join(
  repositoryRoot,
  'services',
  'engine',
  'src',
  'databreeze_engine',
  'worker_main.py',
);

function read(pathname) {
  return readFileSync(pathname, 'utf8').replaceAll('\r\n', '\n');
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

test('[Task 19 / IAM-019 / DDA-036] API image is reproducible, minimal, and directly runnable', () => {
  const dockerfile = read(dockerfilePath);

  assert.match(
    dockerfile,
    /^FROM docker\.io\/library\/node:24\.17\.0-bookworm-slim@sha256:[0-9a-f]{64} AS base$/mu,
  );
  assert.match(
    dockerfile,
    /^FROM gcr\.io\/distroless\/nodejs24-debian12:nonroot@sha256:[0-9a-f]{64} AS runtime$/mu,
  );
  assert.match(dockerfile, /corepack enable/u);
  assert.match(dockerfile, /corepack prepare pnpm@11\.18\.0 --activate/u);
  assert.match(dockerfile, /pnpm install --frozen-lockfile --filter @databreeze\/api\.\.\./u);
  assert.match(dockerfile, /pnpm --filter @databreeze\/api prisma:generate/u);
  assert.match(dockerfile, /pnpm --filter @databreeze\/api\.\.\. build/u);
  assert.match(dockerfile, /services\/api\/build\/prisma-client\/client\.ts/u);
  assert.doesNotMatch(dockerfile, /services\/api\/build\/prisma-client\/client\.js/u);
  assert.match(dockerfile, /services\/api\/build\/prisma-client\/internal\/class\.ts/u);
  assert.doesNotMatch(dockerfile, /services\/api\/build\/prisma-client\/internal\/class\.js/u);
  assert.match(
    dockerfile,
    /pnpm --filter @databreeze\/api --prod deploy --legacy \/workspace\/api-runtime/u,
  );

  for (const sourcePath of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.node-version',
    'tsconfig.base.json',
    'services/api/package.json',
    'packages/contracts/package.json',
    'packages/domain/package.json',
    'packages/telemetry/package.json',
    'services/api',
    'packages/contracts',
    'packages/domain',
    'packages/telemetry',
  ]) {
    assert.match(
      dockerfile,
      new RegExp(`^COPY .*${sourcePath.replaceAll('/', '\\/')}(?:\\s|$)`, 'mu'),
      `Docker build must copy ${sourcePath}`,
    );
  }

  assert.match(dockerfile, /COPY --from=build .*services\/api\/dist/u);
  assert.match(dockerfile, /COPY --from=build .*services\/api\/build\/prisma-client/u);
  assert.match(dockerfile, /ENV NODE_ENV=production/u);
  assert.match(dockerfile, /USER 10001:10001/u);
  assert.match(dockerfile, /EXPOSE 3000/u);
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*CMD \["(?:\/nodejs\/bin\/)?node",/u);
  assert.match(dockerfile, /process\.env\.PORT/u);
  assert.match(dockerfile, /\?\? ['"]3000['"]/u);
  assert.match(dockerfile, /\/health\/ready/u);
  assert.match(dockerfile, /ENTRYPOINT \["(?:\/nodejs\/bin\/)?node", "dist\/main\.js"\]/u);
  assert.doesNotMatch(dockerfile, /\b(?:curl|wget|bash|sh -c|npm start|pnpm start)\b/u);
  assert.doesNotMatch(dockerfile, /^\s*(?:ARG|ENV)\s+(?:DATABASE_URL|OPENAI_API_KEY|.*SECRET)/imu);
  assert.doesNotMatch(dockerfile, /COPY[^\n]*\.env/u);
  assert.doesNotMatch(dockerfile, /services\/engine|apps\/|tools\//u);
});

test('[Task 19 / IAM-019 / DDA-036] build context and release command exclude sensitive or unrelated material', () => {
  const dockerignore = read(dockerignorePath);
  for (const pattern of [
    '.git',
    '.worktrees',
    'node_modules',
    '.env',
    '.env.*',
    'secrets',
    'marketing',
    'reports',
    'runtime',
    'data',
    'uploads',
    'artifacts',
    '**/dist',
  ]) {
    assert.match(dockerignore, new RegExp(`^${escapeRegExp(pattern)}$`, 'mu'));
  }

  const workflow = read(workflowPath);
  assert.match(workflow, /infrastructure\/containers\/worker\/\*\*/u);
  assert.match(workflow, /IMAGE:\s+databreeze-api:\$\{\{\s*github\.sha\s*\}\}/u);
  assert.match(
    workflow,
    /docker\s+build\s+--file\s+infrastructure\/containers\/api\/Dockerfile\s+--tag\s+"\$IMAGE"\s+\./u,
  );
  assert.match(workflow, /docker image inspect [^\n]+--format/u);
  assert.match(workflow, /Config\.User/u);
  assert.match(workflow, /Config\.Entrypoint/u);
  assert.match(workflow, /Config\.Healthcheck/u);
  assert.match(workflow, /timeout(?: --foreground)? [0-9]+s docker run --rm/u);
  assert.match(workflow, /docker run --rm --read-only --tmpfs \/tmp:rw,noexec,nosuid,size=64m/u);
  assert.match(workflow, /NODE_ENV=production/u);
  assert.match(workflow, /PRODUCTION_DATABASE_URL_INVALID/u);
  assert.match(workflow, /image:\s+(?:docker\.io\/library\/)?postgres:17\.5-alpine/u);
  assert.match(workflow, /pnpm --filter @databreeze\/api exec prisma migrate deploy/u);
  assert.match(workflow, /docker run --detach --read-only/u);
  assert.match(workflow, /--add-host host\.docker\.internal:host-gateway/u);
  assert.match(workflow, /--env PORT=3100/u);
  assert.match(workflow, /randomBytes\(32\)\.toString\(['"]base64url['"]\)/u);
  assert.match(
    workflow,
    /--env DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY="\$service_account_key"/u,
  );
  assert.match(workflow, /\.State\.Health\.Status/u);
  assert.match(
    workflow,
    /curl --fail --silent --show-error http:\/\/127\.0\.0\.1:3100\/health\/ready/u,
  );
  assert.match(workflow, /docker stop --time 30/u);
  assert.match(workflow, /\.State\.ExitCode/u);
  assert.doesNotMatch(workflow, /\bdocker\s+push\b|\btofu\s+apply\b|\bkubectl\s+apply\b/u);

  const runbook = read(runbookPath);
  assert.match(runbook, /--read-only/u);
  assert.match(runbook, /--user 10001:10001/u);
  assert.match(runbook, /DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY/u);
  assert.match(runbook, /32-byte base64url/u);
  assert.match(runbook, /authenticated job worker entrypoint/u);
});

test('[Plan 407 Task 7 / IAE-024 / JRA-023 / JRA-031] worker image is pinned and exposes only the authenticated fail-closed runtime', () => {
  const runbook = read(workerRunbookPath);
  assert.match(runbook, /production worker Dockerfile/u);
  assert.match(runbook, /IAE exact-object transfer\/finalization/u);
  assert.match(runbook, /DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY/u);
  assert.match(runbook, /must never receive this signing key/u);
  assert.match(runbook, /no database\/storage credentials/u);
  assert.match(runbook, /no arbitrary command surface/u);

  assert.equal(existsSync(workerDockerfilePath), true);
  assert.ok(
    existsSync(workerEntrypointPath),
    'A worker Dockerfile requires the reviewed authenticated assignment-loop entrypoint.',
  );
  const dockerfile = read(workerDockerfilePath);
  assert.match(
    dockerfile,
    /^FROM docker\.io\/library\/python:3\.13\.7-slim-bookworm@sha256:[0-9a-f]{64} AS (?:build|runtime)$/mu,
  );
  assert.match(dockerfile, /^USER 10001:10001$/mu);
  assert.match(dockerfile, /^ENTRYPOINT \["\/usr\/local\/bin\/databreeze-engine-worker"\]$/mu);
  assert.match(dockerfile, /^STOPSIGNAL SIGTERM$/mu);
  assert.match(
    dockerfile,
    /pip wheel --wheel-dir \/wheels "hatchling==1\.31\.0"[\s\S]*pip wheel --no-index --find-links \/wheels --wheel-dir \/wheels \.\/engine/u,
  );
  assert.match(
    dockerfile,
    /pip install --no-cache-dir --no-index --find-links \/wheels "databreeze-engine==0\.1\.0"/u,
  );
  assert.doesNotMatch(dockerfile, /\b(?:DATABASE_URL|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\b/u);
  assert.doesNotMatch(dockerfile, /DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY/u);
  assert.doesNotMatch(dockerfile, /COPY[^\n]*(?:\.env|secrets|credentials)/iu);
  assert.doesNotMatch(dockerfile, /(?:bash|sh -c|cmd\.exe|powershell)/iu);
});
