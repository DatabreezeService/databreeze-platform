import assert from 'node:assert/strict';
import test from 'node:test';

import { DdaModule } from '../../../src/features/dda/dda.module.js';

void test('[DDA-036] production composition fails closed without durable database binding', () => {
  assert.throws(
    () =>
      DdaModule.register({
        runtimeMode: 'production',
      }),
    (error: unknown) =>
      error instanceof Error && error.message === 'DDA_PRODUCTION_DATABASE_REQUIRED',
  );
});

void test('[DDA-036] test/dev factory may keep explicit in-memory adapters without database', () => {
  const module = DdaModule.register({
    runtimeMode: 'test',
    allowInMemoryAdapters: true,
  });
  assert.equal(module.module, DdaModule);
  assert.ok(Array.isArray(module.providers));
});
