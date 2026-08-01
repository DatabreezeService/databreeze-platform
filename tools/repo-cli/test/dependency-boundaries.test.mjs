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

test('rejects literal dynamic imports, require calls, and TypeScript import-equals of services', () => {
  const result = checkFixture('client-loads-service-literals');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /dynamic\.ts/);
  assert.match(result.stderr, /required\.ts/);
  assert.match(result.stderr, /import-equals\.ts/);
  assert.equal(
    result.stderr.match(/rule=clients-must-not-import-service-implementations/g)?.length,
    3,
  );
});

test('rejects a client import of the API directory itself', () => {
  const result = checkFixture('client-imports-service-directory');

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

test('rejects a feature import of another feature persistence directory', () => {
  const result = checkFixture('feature-imports-persistence-directory');

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

test('rejects a client import of a private workspace-package subpath', () => {
  const result = checkFixture('private-deep-import');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps[\\/]web[\\/]src[\\/]client\.ts/);
  assert.match(result.stderr, /rule=workspace-packages-must-not-import-private-subpaths/);
});

test('uses exact and most-specific export entries before broader patterns, including null targets', () => {
  const result = checkFixture('exports-null-precedence');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /blocked\.ts/);
  assert.match(result.stderr, /private\.ts/);
  assert.doesNotMatch(result.stderr, /public\.ts/);
  assert.equal(
    result.stderr.match(/rule=workspace-packages-must-not-import-private-subpaths/g)?.length,
    2,
  );
});
