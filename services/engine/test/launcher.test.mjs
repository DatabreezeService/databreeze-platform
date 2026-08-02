import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { isRequiredUvVersion } from '../scripts/uv-version.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcher = path.join(projectRoot, 'scripts', 'run-engine.mjs');

function resolveUv() {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(locator, ['uv'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'uv must be available for the launcher integration test');
  return result.stdout.trim().split(/\r?\n/u)[0];
}

test('DATABREEZE_UV selects an explicit cross-platform uv executable', () => {
  const result = spawnSync(process.execPath, [launcher, 'python-version'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABREEZE_UV: resolveUv() },
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Python 3\.13\.14/u);
});

test('missing uv fails with one bounded setup diagnostic', () => {
  const result = spawnSync(process.execPath, [launcher, 'python-version'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABREEZE_UV: path.join(projectRoot, 'missing-uv') },
    windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires uv 0\.11\.32.*DATABREEZE_UV/u);
  assert.ok(result.stderr.length < 400);
});

test('uv exact-version parsing rejects prefix collisions and undocumented suffixes', () => {
  assert.equal(isRequiredUvVersion('uv 0.11.32'), true);
  assert.equal(
    isRequiredUvVersion('uv 0.11.32 (3010295ae 2026-07-23 x86_64-pc-windows-msvc)'),
    true,
  );
  assert.equal(
    isRequiredUvVersion('uv 0.11.32 (linux-build x86_64-unknown-linux-gnu)'),
    true,
  );
  assert.equal(isRequiredUvVersion('uv 0.11.320'), false);
  assert.equal(isRequiredUvVersion('uv 0.11.32 unexpected'), false);
  assert.equal(isRequiredUvVersion(`uv 0.11.32 (${`x`.repeat(161)})`), false);
});

test(
  'launcher rejects a prefix-collision version from a fake executable',
  {
    skip:
      process.platform === 'win32' ? 'Windows does not execute shebang fixtures directly' : false,
  },
  () => {
    const fakeUv = path.join(projectRoot, 'test', 'fixtures', 'fake-uv-prefix');
    const result = spawnSync(process.execPath, [launcher, 'python-version'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABREEZE_UV: fakeUv },
      windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires exactly uv 0\.11\.32/u);
  },
);
