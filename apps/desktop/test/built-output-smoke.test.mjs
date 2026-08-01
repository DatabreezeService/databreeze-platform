import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('production build emits isolated main, preload, and renderer outputs', () => {
  const main = readFileSync(path.join(desktopDirectory, 'dist/main/index.js'), 'utf8');
  const preload = readFileSync(path.join(desktopDirectory, 'dist/preload/index.cjs'), 'utf8');
  const renderer = readFileSync(path.join(desktopDirectory, 'dist/renderer/index.html'), 'utf8');

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(preload, /exposeInMainWorld/);
  assert.match(preload, /desktop:v1:session:get-safe-state/);
  assert.match(renderer, /Content-Security-Policy/);
  assert.doesNotMatch(renderer, /unsafe-inline|unsafe-eval/);
});
