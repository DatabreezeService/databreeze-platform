import assert from 'node:assert/strict';
import test from 'node:test';

import { BuaModule } from '../../../src/features/bua/bua.module.js';
import { ENTITLEMENT_LEASE_SERVICE } from '../../../src/features/bua/application/entitlement-lease.service.js';

void test('[BUA-017, BUA-018] module composes lease service from secret-manager key material', () => {
  const dynamic = BuaModule.register({ entitlementLeaseSigningKey: 'a'.repeat(32) });
  assert.equal(
    dynamic.providers?.some(
      (provider) =>
        typeof provider === 'object' &&
        'provide' in provider &&
        provider.provide === ENTITLEMENT_LEASE_SERVICE,
    ),
    true,
  );
});
