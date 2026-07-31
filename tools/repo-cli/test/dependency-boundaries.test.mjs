import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const checkerPath = path.join(testDirectory, '..', 'src', 'check-dependency-boundaries.mjs');
const fixturesDirectory = path.join(testDirectory, 'fixtures', 'dependency-boundaries');

function checkFixture(name) {
  return spawnSync(process.execPath, [checkerPath, '--root', path.join(fixturesDirectory, name)], {
    encoding: 'utf8',
  });
}

test('accepts an allowed API dependency on a shared pure package', () => {
  const result = checkFixture('allowed-imports');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
});

test('rejects a client import of a service implementation', () => {
  const result = checkFixture('client-imports-service');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps[\\/]web[\\/]src[\\/]client\.ts/);
  assert.match(result.stderr, /rule=clients-must-not-import-service-implementations/);
});

test('rejects a feature import of another feature persistence adapter', () => {
  const result = checkFixture('feature-imports-feature-persistence');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /features[\\/]inbox[\\/]application[\\/]handler\.ts/);
  assert.match(result.stderr, /rule=features-must-not-import-other-feature-persistence/);
});

test('accepts a feature import of its own persistence adapter', () => {
  const result = checkFixture('feature-imports-own-persistence');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
});

test('rejects a workspace package that omits its public exports map', () => {
  const result = checkFixture('package-without-exports');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /packages[\\/]contracts[\\/]package\.json/);
  assert.match(result.stderr, /rule=workspace-packages-must-declare-public-exports/);
});

test('rejects a workspace package with an empty public exports map', () => {
  const result = checkFixture('package-with-empty-exports');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /packages[\\/]contracts[\\/]package\.json/);
  assert.match(result.stderr, /rule=workspace-packages-must-declare-public-exports/);
});

test('accepts a client import of a shared contract through its public package', () => {
  const result = checkFixture('public-contract-import');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
});
