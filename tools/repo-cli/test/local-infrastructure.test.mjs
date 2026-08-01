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

  const bucketScript = read('infrastructure/local/minio/bootstrap-buckets.sh');
  assert.match(bucketScript, /MINIO_ROOT_PASSWORD/);
  assert.doesNotMatch(bucketScript, /databreeze-local-change-me/);
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
