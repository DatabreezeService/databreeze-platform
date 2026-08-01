import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const relativePath of [
  'src/shared/desktop-contract-v1.ts',
  'src/application/local-state.port.ts',
  'src/application/sidecar-lifecycle.port.ts',
  'src/main/adapters/locked-local-state.adapter.ts',
  'src/main/adapters/unavailable-sidecar.adapter.ts',
  'src/main/desktop-window.ts',
  'src/main/index.ts',
  'src/main/window-policy.ts',
  'src/main/navigation-policy.ts',
  'src/main/ipc-registry.ts',
  'src/preload/bridge-v1.ts',
  'src/preload/index.ts',
  'src/renderer/app.tsx',
  'src/renderer/main.tsx',
]) {
  test(`owns the ${relativePath} trust-boundary entry point`, () => {
    assert.equal(existsSync(path.join(desktopDirectory, relativePath)), true, relativePath);
  });
}
