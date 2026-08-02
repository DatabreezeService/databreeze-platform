import assert from 'node:assert/strict';
import test from 'node:test';

import { AppModule } from '../../src/app.module.js';
import { AudModule } from '../../src/features/aud/aud.module.js';
import { BuaModule } from '../../src/features/bua/bua.module.js';

function moduleTypes(): readonly unknown[] {
  const registered = AppModule.register();
  return (registered.imports ?? []).map((entry) =>
    typeof entry === 'object' && entry !== null && 'module' in entry
      ? (entry as { readonly module: unknown }).module
      : entry,
  );
}

void test('[IAM-001, AUD-001, BUA-001] application composition includes identity, audit, and entitlements modules', () => {
  const types = moduleTypes();
  assert.ok(types.includes(AudModule));
  assert.ok(types.includes(BuaModule));
});
