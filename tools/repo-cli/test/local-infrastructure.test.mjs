import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

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
  assert.match(compose, /RELEASE\.2025-06-13T11-33-47Z/);
  assert.match(compose, /mailpit:v1\.21\.8/);
  assert.match(compose, /collector-contrib:0\.128\.0/);
  assert.match(compose, /curlimages\/curl:8\.14\.1/);
  for (const volume of ['postgres-data', 'redis-data', 'minio-data', 'mailpit-data']) {
    assert.match(compose, new RegExp(`^  ${volume}:`, 'm'));
  }
  assert.equal((compose.match(/healthcheck:/g) ?? []).length, 6);
  assert.equal((compose.match(/^    init: true$/gmu) ?? []).length, 7);
  assert.match(compose, /minio-init:[\s\S]*depends_on:[\s\S]*condition: service_healthy/u);
  assert.match(compose, /minio-init:[\s\S]*restart: 'no'/u);
  assert.match(compose, /postgres-data:[\s\S]*name: \$\{COMPOSE_PROJECT_NAME/u);
  assert.match(compose, /networks: \[local\]/u);
  assert.match(compose, /name: \$\{COMPOSE_PROJECT_NAME:-databreeze-local\}-network/u);
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
    assert.match(collector, new RegExp(`${signal}[\\s\\S]*processors: \\[memory_limiter, batch\\]`, 'u'));
    assert.match(collector, new RegExp(`${signal}[\\s\\S]*exporters: \\[debug\\]`, 'u'));
  }
  assert.match(collector, /health_check:[\s\S]*endpoint: 0\.0\.0\.0:13133/u);
  assert.doesNotMatch(collector, /filelog|otlphttp|s3|https?:\/\//iu);
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
  for (const command of ['config', 'preflight', 'check', 'start', 'stop', 'reset', 'restart-check', 'status', 'logs', 'smoke']) {
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
  assert.match(`${invalidTimeout.stdout}\n${invalidTimeout.stderr}`, /--wait-seconds must be an integer/u);

  const invalidDisk = spawnSync(process.execPath, [helpScript, 'check', '--min-free-gib=-1'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(invalidDisk.status, 0);
  assert.match(`${invalidDisk.stdout}\n${invalidDisk.stderr}`, /--min-free-gib must be a non-negative number/u);

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
  assert.match(`${invalidProject.stdout}\n${invalidProject.stderr}`, /COMPOSE_PROJECT_NAME must start/u);

  const composeConfig = spawnSync(process.execPath, [helpScript, 'config'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (composeConfig.status === 0) assert.match(composeConfig.stdout, /Compose configuration is valid/u);
  assert.match(script, /logs', '--no-color/u);
  assert.match(script, /--service must name one of/u);
  assert.match(script, /--tail must be an integer/u);
  assert.match(script, /COMPOSE_PROJECT_NAME must start/u);
});
