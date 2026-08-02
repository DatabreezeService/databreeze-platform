import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(desktopDirectory, 'package.json');

test('Desktop is an independently buildable workspace package', () => {
  assert.equal(existsSync(manifestPath), true, 'apps/desktop/package.json must exist');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, '@databreeze/desktop');
  assert.equal(manifest.private, true);
  assert.deepEqual(Object.keys(manifest.scripts).sort(), [
    'build',
    'dev',
    'lint',
    'security:check',
    'test',
    'typecheck',
  ]);
});
