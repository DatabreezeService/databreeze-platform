import assert from 'node:assert/strict';
import test from 'node:test';

import { DatabaseReadinessAdapter } from '../../../src/features/system/adapter/database-readiness.adapter.js';

void test('[DDA-036] database readiness accepts a completed production probe', async () => {
  const readiness = new DatabaseReadinessAdapter(() => Promise.resolve([{ ready: 1 }]), 50);

  assert.equal(await readiness.check(), true);
});

void test('[DDA-036] database readiness collapses provider failures to not ready', async () => {
  const readiness = new DatabaseReadinessAdapter(
    () => Promise.reject(new Error('provider host and credential detail')),
    50,
  );

  assert.equal(await readiness.check(), false);
});

void test('[DDA-036] database readiness collapses synchronous probe failures to not ready', async () => {
  const readiness = new DatabaseReadinessAdapter(() => {
    throw new Error('synchronous provider detail');
  }, 50);

  assert.equal(await readiness.check(), false);
});

void test('[DDA-036] database readiness returns not ready within its configured deadline', async () => {
  const readiness = new DatabaseReadinessAdapter(() => new Promise<never>(() => undefined), 10);

  const observed = await Promise.race([
    readiness.check(),
    new Promise<'observer-timeout'>((resolve) => {
      setTimeout(() => resolve('observer-timeout'), 250);
    }),
  ]);

  assert.equal(observed, false);
});
