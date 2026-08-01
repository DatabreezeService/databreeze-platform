import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

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
