import assert from 'node:assert/strict';
import test from 'node:test';

import { HmacEntitlementLeaseSignerAdapter } from '../../../src/features/bua/adapter/hmac-entitlement-lease-signer.adapter.js';

const key = 'a'.repeat(32);

void test('[BUA-018] HMAC lease signatures verify exact payloads and reject tampering', () => {
  const signer = new HmacEntitlementLeaseSignerAdapter(key);
  const signature = signer.sign('{"lease":1}');
  assert.equal(signer.verify('{"lease":1}', signature), true);
  assert.equal(signer.verify('{"lease":2}', signature), false);
  assert.equal(signer.verify('{"lease":1}', `${signature}x`), false);
});

void test('[BUA-018] HMAC lease signing requires a non-trivial key', () => {
  assert.throws(() => new HmacEntitlementLeaseSignerAdapter('short'), /KEY_TOO_SHORT/);
});
