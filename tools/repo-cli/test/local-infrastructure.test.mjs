import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyCompletionStatus, composeOperationTimeoutMs } from '../src/local-services.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('local lifecycle grants image pulls the bounded readiness window plus teardown margin', () => {
  assert.equal(composeOperationTimeoutMs(1), 31_000);
  assert.equal(composeOperationTimeoutMs(60), 90_000);
  assert.equal(composeOperationTimeoutMs(3600), 3_630_000);
});

test('local readiness requires successful completion jobs', () => {
  assert.deepEqual(classifyCompletionStatus('created', 0), {
    state: 'pending',
    detail: 'created',
  });
  assert.deepEqual(classifyCompletionStatus('running', 0), {
    state: 'pending',
    detail: 'running',
  });
  assert.deepEqual(classifyCompletionStatus('exited', 0), {
    state: 'complete',
    detail: 'exited/0',
  });
  assert.deepEqual(classifyCompletionStatus('exited', 2), {
    state: 'failed',
    detail: 'exited/2',
  });
  assert.deepEqual(classifyCompletionStatus('dead', 137), {
    state: 'failed',
    detail: 'dead/137',
  });
});

test('local compose defines pinned, healthy disposable dependencies', () => {
  const compose = read('infrastructure/local/compose.yml');
  const envExample = read('infrastructure/local/.env.example');
  assert.match(envExample, /^DATABREEZE_MIN_FREE_GIB=5$/m);
  for (const service of [
    'postgres:',
    'redis:',
    'minio:',
    'minio-init:',
    'mailpit:',
    'otel-collector:',
    'otel-collector-health:',
  ]) {
    assert.match(compose, new RegExp(`^  ${service}`, 'm'));
  }
  assert.match(compose, /postgres:17\.5-alpine/);
  assert.match(compose, /redis:7\.4\.5-alpine/);
  assert.match(compose, /MINIO_IMAGE:-quay\.io\/minio\/minio:RELEASE\.2025-06-13T11-33-47Z/u);
  assert.match(compose, /MINIO_MC_IMAGE:-quay\.io\/minio\/mc:RELEASE\.2025-08-13T08-35-41Z/u);
  assert.match(envExample, /^MINIO_IMAGE=quay\.io\/minio\/minio:RELEASE\.2025-06-13T11-33-47Z$/m);
  assert.match(envExample, /^MINIO_MC_IMAGE=quay\.io\/minio\/mc:RELEASE\.2025-08-13T08-35-41Z$/m);
  assert.match(compose, /mailpit:v1\.21\.8/);
  assert.match(compose, /collector-contrib:0\.128\.0/);
  assert.match(compose, /curlimages\/curl:8\.14\.1/);
  for (const volume of [
    'postgres-data',
    'redis-data',
    'minio-data',
    'mailpit-data',
    'web-caddy-data',
  ]) {
    assert.match(compose, new RegExp(`^  ${volume}:`, 'm'));
  }
  assert.equal((compose.match(/healthcheck:/g) ?? []).length, 6);
  assert.equal((compose.match(/^\s{4}init: true$/gmu) ?? []).length, 10);
  assert.match(compose, /minio-init:[\s\S]*depends_on:[\s\S]*condition: service_healthy/u);
  assert.match(compose, /minio-init:[\s\S]*restart: 'no'/u);
  assert.match(compose, /postgres-data:[\s\S]*name: \$\{COMPOSE_PROJECT_NAME/u);
  assert.equal((compose.match(/networks: \[local\]/g) ?? []).length, 10);
  assert.match(compose, /name: \$\{COMPOSE_PROJECT_NAME:-databreeze-local\}-network/u);
  assert.match(compose, /x-default-logging: &default-logging/u);
  assert.match(compose, /max-size: 10m/u);
  assert.match(compose, /max-file: '3'/u);
  assert.equal((compose.match(/logging: \*default-logging/g) ?? []).length, 10);
  assert.equal((compose.match(/127\.0\.0\.1:\$\{/g) ?? []).length, 10);
  assert.match(
    read('infrastructure/local/README.md'),
    /Every published port is bound to `127\.0\.0\.1`/u,
  );
});

test('[Task 18 / WEB-002 / WEB-004] app profile migrates before API and serves Web over loopback HTTPS', () => {
  const compose = read('infrastructure/local/compose.yml');
  const envExample = read('infrastructure/local/.env.example');
  const apiDockerfile = read('infrastructure/containers/api/Dockerfile');
  const webDockerfile = read('infrastructure/containers/web/Dockerfile');
  const webDockerignore = read('infrastructure/containers/web/Dockerfile.dockerignore');
  const caddy = read('infrastructure/local/web/Caddyfile');

  for (const service of ['api-migrate:', 'api:', 'web:']) {
    assert.match(compose, new RegExp(`^  ${service}`, 'm'));
  }
  assert.doesNotMatch(compose, /^ {2}web-health:/m);
  assert.equal((compose.match(/profiles: \[app\]/g) ?? []).length, 3);
  assert.match(compose, /api:[\s\S]*api-migrate:[\s\S]*condition: service_completed_successfully/u);
  assert.match(compose, /api-migrate:[\s\S]*target: migration[\s\S]*restart: 'no'/u);
  assert.match(compose, /web:[\s\S]*api:[\s\S]*condition: service_healthy/u);
  assert.match(compose, /api:[\s\S]*expose:[\s\S]*- '3000'/u);
  assert.doesNotMatch(compose, /127\.0\.0\.1:\$\{API_PORT/u);
  assert.match(compose, /127\.0\.0\.1:\$\{WEB_HTTPS_PORT:-8443\}:8443/u);
  assert.match(compose, /api:[\s\S]*read_only: true/u);
  assert.match(compose, /web:[\s\S]*read_only: true/u);
  assert.match(compose, /cap_drop:[\s\S]*- ALL/u);
  assert.match(compose, /no-new-privileges:true/u);
  assert.match(envExample, /^WEB_HTTPS_PORT=8443$/m);

  assert.match(apiDockerfile, /^FROM build AS migration$/mu);
  assert.match(apiDockerfile, /^ENV COREPACK_HOME=\/pnpm\/corepack$/mu);
  assert.match(apiDockerfile, /chmod -R a\+rX \$\{COREPACK_HOME\}/u);
  assert.match(apiDockerfile, /USER 1000:1000/u);
  assert.match(
    apiDockerfile,
    /ENTRYPOINT \["node", "\/workspace\/services\/api\/node_modules\/prisma\/build\/index\.js", "migrate", "deploy", "--config", "prisma\.config\.ts"\]/u,
  );

  assert.match(
    webDockerfile,
    /^FROM docker\.io\/library\/node:24\.17\.0-bookworm-slim@sha256:[0-9a-f]{64} AS build$/mu,
  );
  assert.match(
    webDockerfile,
    /^FROM docker\.io\/library\/caddy:2\.10\.0-alpine@sha256:[0-9a-f]{64} AS runtime$/mu,
  );
  assert.match(webDockerfile, /pnpm install --frozen-lockfile --filter @databreeze\/web\.\.\./u);
  assert.match(webDockerfile, /pnpm --filter @databreeze\/web\.\.\. build/u);
  assert.match(webDockerfile, /USER 1000:1000/u);
  assert.match(webDockerfile, /setcap -r \/usr\/bin\/caddy/u);
  assert.match(webDockerfile, /https:\/\/localhost:8443\/health\/ready/u);
  assert.doesNotMatch(webDockerfile, /https:\/\/127\.0\.0\.1:8443\/health\/ready/u);
  assert.doesNotMatch(webDockerfile, /ARG\s+.*(?:SECRET|TOKEN|PASSWORD|KEY)/iu);
  assert.doesNotMatch(webDockerfile, /ENV\s+.*(?:SECRET|TOKEN|PASSWORD|KEY)/iu);
  assert.match(webDockerfile, /ARG VITE_DATABREEZE_DEMO_MODE=false/u);
  assert.match(compose, /VITE_DATABREEZE_DEMO_MODE: \$\{VITE_DATABREEZE_DEMO_MODE:-true\}/u);
  assert.match(envExample, /^VITE_DATABREEZE_DEMO_MODE=true$/m);
  assert.match(webDockerignore, /^\*\*\/node_modules$/m);
  assert.match(webDockerignore, /^\*\*\/dist$/m);
  assert.match(webDockerignore, /^\*\*\/build$/m);

  assert.match(caddy, /https:\/\/localhost:8443/u);
  assert.match(caddy, /tls internal/u);
  assert.match(caddy, /skip_install_trust/u);
  assert.match(caddy, /handle @api \{[\s\S]*reverse_proxy api:3000[\s\S]*\}/u);
  assert.match(caddy, /handle \{[\s\S]*try_files \{path\} \/index\.html[\s\S]*file_server/u);
  assert.ok(caddy.indexOf('handle @api') < caddy.indexOf('\thandle {'));
  assert.doesNotMatch(caddy, /reverse_proxy @api/u);
  assert.match(caddy, /@api path \/v1\/\* \/v3\/\* \/health\/\*/u);
  assert.match(caddy, /try_files \{path\} \/index\.html/u);
  assert.match(caddy, /Content-Security-Policy/u);
  assert.match(caddy, /connect-src 'self'/u);
  assert.match(caddy, /frame-ancestors 'none'/u);
  assert.doesNotMatch(caddy, /Access-Control-Allow-Origin:\s*\*/iu);
});

test('local bootstrap is credential-free and creates every owned module schema', () => {
  const sql = read('infrastructure/local/postgres/init/001-create-module-schemas.sql');
  const expectedSchemas = [
    'iam',
    'aud',
    'bua',
    'iae',
    'dsm',
    'jra',
    'dso',
    'nco',
    'int',
    'fa',
    'sa',
    'qi',
    'oc',
    'ild',
    'crf',
    'pda',
    'mr',
    'dqg',
    'ei',
  ];
  for (const schema of expectedSchemas) assert.match(sql, new RegExp(`'${schema}'`));
  assert.doesNotMatch(sql, /password|secret|BEGIN\s+;|CREATE\s+ROLE/i);
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS/u);
  assert.doesNotMatch(sql, /DROP\s+SCHEMA|DROP\s+DATABASE|TRUNCATE/u);

  const bucketScript = read('infrastructure/local/minio/bootstrap-buckets.sh');
  assert.doesNotMatch(bucketScript, /\r/u);
  assert.match(read('.gitattributes'), /^\*\.sh text eol=lf$/m);
  assert.match(bucketScript, /MINIO_ROOT_PASSWORD/);
  assert.match(bucketScript, /mc mb --ignore-existing/u);
  assert.match(bucketScript, /mc anonymous set none/u);
  assert.doesNotMatch(bucketScript, /databreeze-local-change-me/);
});

test('local OpenTelemetry collector keeps every signal on the bounded local pipeline', () => {
  const collector = read('infrastructure/local/otel/collector.yaml');
  for (const [section, indentation] of [
    ['receivers:', ''],
    ['processors:', ''],
    ['exporters:', ''],
    ['extensions:', ''],
    ['service:', ''],
    ['pipelines:', '  '],
  ]) {
    assert.match(collector, new RegExp(`^${indentation}${section}`, 'm'));
  }
  for (const signal of ['traces:', 'metrics:', 'logs:']) {
    assert.match(collector, new RegExp(`^    ${signal}`, 'm'));
    assert.match(collector, new RegExp(`${signal}[\\s\\S]*receivers: \\[otlp\\]`, 'u'));
    assert.match(
      collector,
      new RegExp(`${signal}[\\s\\S]*processors: \\[memory_limiter, batch\\]`, 'u'),
    );
    assert.match(collector, new RegExp(`${signal}[\\s\\S]*exporters: \\[debug\\]`, 'u'));
  }
  assert.match(collector, /health_check:[\s\S]*endpoint: 0\.0\.0\.0:13133/u);
  assert.doesNotMatch(collector, /filelog|otlphttp|s3|https?:\/\//iu);
});

test('local infrastructure documents bounded diagnostic storage', () => {
  const readme = read('infrastructure/local/README.md');
  assert.match(readme, /Container JSON logs are capped at 10 MiB per file/u);
  assert.match(readme, /three retained files/u);
});

test('readiness smoke script exposes a non-destructive help command', () => {
  const script = path.join(repositoryRoot, 'tools', 'repo-cli', 'src', 'local-services-smoke.mjs');
  const result = spawnSync(process.execPath, [script, '--help'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--start/);
  assert.match(result.stdout, /never removes containers or named volumes/i);
});

test('local lifecycle commands fail safely around Docker, ports, disk, and volumes', () => {
  const script = read('tools/repo-cli/src/local-services.mjs');
  const helpScript = path.join(repositoryRoot, 'tools', 'repo-cli', 'src', 'local-services.mjs');
  const result = spawnSync(process.execPath, [helpScript, '--help'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  for (const command of [
    'config',
    'preflight',
    'check',
    'start',
    'stop',
    'reset',
    'restart-check',
    'persistence-check',
    'status',
    'logs',
    'smoke',
    'app-start',
    'app-stop',
    'app-status',
    'app-logs',
  ]) {
    assert.match(result.stdout, new RegExp(`^  ${command}\\s`, 'm'));
  }
  assert.match(script, /statfsSync/u);
  assert.match(script, /portAvailable/u);
  assert.match(script, /configured = new Map/u);
  assert.match(script, /Docker CLI is not installed/u);
  assert.match(script, /Docker daemon is unavailable/u);
  assert.match(script, /down', '--remove-orphans/u);
  assert.doesNotMatch(script, /down'[^\n]*--volumes/u);
  assert.doesNotMatch(script, /down\s+--volumes/u);
  assert.doesNotMatch(script, /docker\s+(?:rm|volume\s+rm|system\s+prune)/iu);

  const invalidTimeout = spawnSync(process.execPath, [helpScript, 'check', '--wait-seconds=0'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(invalidTimeout.status, 0);
  assert.match(
    `${invalidTimeout.stdout}\n${invalidTimeout.stderr}`,
    /--wait-seconds must be an integer/u,
  );

  const invalidDisk = spawnSync(process.execPath, [helpScript, 'check', '--min-free-gib=-1'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(invalidDisk.status, 0);
  assert.match(
    `${invalidDisk.stdout}\n${invalidDisk.stderr}`,
    /--min-free-gib must be a non-negative number/u,
  );

  const invalidTail = spawnSync(process.execPath, [helpScript, 'logs', '--tail=0'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(invalidTail.status, 0);
  assert.match(`${invalidTail.stdout}\n${invalidTail.stderr}`, /--tail must be an integer/u);

  const invalidService = spawnSync(process.execPath, [helpScript, 'logs', '--service=unknown'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(invalidService.status, 0);
  assert.match(`${invalidService.stdout}\n${invalidService.stderr}`, /--service must name one of/u);

  const invalidProject = spawnSync(process.execPath, [helpScript, 'config'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, COMPOSE_PROJECT_NAME: '../unsafe-project' },
  });
  assert.notEqual(invalidProject.status, 0);
  assert.match(
    `${invalidProject.stdout}\n${invalidProject.stderr}`,
    /COMPOSE_PROJECT_NAME must start/u,
  );

  const invalidEnvironmentDisk = spawnSync(process.execPath, [helpScript, 'preflight'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABREEZE_MIN_FREE_GIB: 'not-a-number' },
  });
  assert.notEqual(invalidEnvironmentDisk.status, 0);
  assert.match(
    `${invalidEnvironmentDisk.stdout}\n${invalidEnvironmentDisk.stderr}`,
    /--min-free-gib must be a non-negative number/u,
  );

  const composeConfig = spawnSync(process.execPath, [helpScript, 'config'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (composeConfig.status === 0) {
    assert.match(composeConfig.stdout, /Compose configuration is valid/u);
  } else {
    assert.match(
      `${composeConfig.stdout}\n${composeConfig.stderr}`,
      /Docker CLI is not installed or not on PATH/u,
    );
  }
  const preflight = spawnSync(process.execPath, [helpScript, 'preflight', '--min-free-gib=0'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (preflight.status === 0) {
    assert.match(preflight.stdout, /preflight passed without starting services/u);
  } else {
    assert.match(
      `${preflight.stdout}\n${preflight.stderr}`,
      /Docker CLI is not installed or not on PATH/u,
    );
  }
  assert.doesNotMatch(script, /redis-cli\s+FLUSH(?:ALL|DB)/iu);
});
