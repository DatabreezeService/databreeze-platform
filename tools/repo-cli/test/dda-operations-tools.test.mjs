import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function run(relativeScript, args = [], environment = {}) {
  return spawnSync(process.execPath, [path.join(repositoryRoot, relativeScript), ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    timeout: 30_000,
    windowsHide: process.platform === 'win32',
  });
}

test('restore verification keeps database credentials out of command arguments', () => {
  const result = run('tools/recovery/verify-dda-restore.mjs', [
    '--database-url',
    'postgresql://secret@example.invalid/database',
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /DATABREEZE_RESTORED_DATABASE_URL/u);
  assert.doesNotMatch(result.stderr, /secret|example\.invalid/u);
});

test('restore verification requires an explicit isolated-staging acknowledgement before live access', () => {
  const result = run('tools/recovery/verify-dda-restore.mjs', [], {
    DATABREEZE_RESTORED_DATABASE_URL: 'postgresql://unused.invalid/database',
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--acknowledge-isolated-restored-staging/u);
  assert.doesNotMatch(result.stderr, /unused\.invalid/u);
});

test('restore fixture verification remains content-safe and credential-free', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(repositoryRoot, 'tools/recovery/verify-dda-restore.mjs'), '--fixture-only'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  const report = JSON.parse(output);

  assert.equal(report.status, 'ok');
  assert.equal(report.contentSafe, true);
  assert.equal(Object.hasOwn(report, 'databaseUrl'), false);
});

test('live load verification requires one bounded HTTPS staging target', () => {
  const absent = run('tools/performance/dda-load.mjs');
  assert.equal(absent.status, 2);
  assert.match(absent.stderr, /DATABREEZE_LOAD_TARGET_ORIGIN/u);

  const unsafe = run('tools/performance/dda-load.mjs', [], {
    DATABREEZE_LOAD_TARGET_ORIGIN: 'http://localhost:3000',
  });
  assert.equal(unsafe.status, 2);
  assert.match(unsafe.stderr, /HTTPS staging origin/u);
});
