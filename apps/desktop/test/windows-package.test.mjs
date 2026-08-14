import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWindowsPackagePlan } from '../scripts/package-windows.mjs';

test('DSK-020: unsigned Windows package plan uses Electron runtime and never invents signing', () => {
  const plan = createWindowsPackagePlan({
    desktopDirectory: 'C:\\repo\\apps\\desktop',
    electronRuntimeDirectory: 'C:\\repo\\node_modules\\electron\\dist',
    iexpressPath: 'C:\\Windows\\System32\\iexpress.exe',
    version: '1.2.3',
  });

  assert.equal(plan.signing, 'UNSIGNED');
  assert.equal(plan.executableName, 'DataBreeze.exe');
  assert.equal(plan.installerName, 'DataBreeze-Setup-1.2.3-unsigned.exe');
  assert.match(plan.applicationDirectory, /win-unpacked$/u);
  assert.match(plan.installerPath, /DataBreeze-Setup-1\.2\.3-unsigned\.exe$/u);
  assert.equal(Object.hasOwn(plan, 'certificatePassword'), false);
});

test('DSK-020: package plan rejects absent installer tooling instead of claiming success', () => {
  assert.throws(
    () =>
      createWindowsPackagePlan({
        desktopDirectory: 'C:\\repo\\apps\\desktop',
        electronRuntimeDirectory: 'C:\\repo\\node_modules\\electron\\dist',
        iexpressPath: null,
        version: '1.2.3',
      }),
    /IEXPRESS_UNAVAILABLE/u,
  );
});
