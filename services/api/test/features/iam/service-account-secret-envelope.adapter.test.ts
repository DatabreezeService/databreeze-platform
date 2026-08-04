import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AesGcmServiceAccountSecretEnvelopeAdapter,
  randomServiceAccountSecretEnvelopeAdapter,
} from '../../../src/features/iam/adapter/service-account-secret-envelope.adapter.js';

void test('[IAM-013] service-account replay envelopes decrypt only with the configured key', () => {
  const adapter = new AesGcmServiceAccountSecretEnvelopeAdapter('a'.repeat(43));
  const envelope = adapter.seal('dbsa-secret');
  assert.notEqual(envelope, 'dbsa-secret');
  assert.equal(adapter.open(envelope), 'dbsa-secret');
  assert.equal(adapter.open(`${envelope}tampered`), undefined);
  assert.equal(
    new AesGcmServiceAccountSecretEnvelopeAdapter('b'.repeat(43)).open(envelope),
    undefined,
  );
});

void test('[IAM-013] the private-alpha envelope fallback still keeps raw secrets out of records', () => {
  const adapter = randomServiceAccountSecretEnvelopeAdapter();
  const envelope = adapter.seal('dbsa-alpha');
  assert.equal(envelope.includes('dbsa-alpha'), false);
  assert.equal(adapter.open(envelope), 'dbsa-alpha');
});

void test('[IAM-013] replay envelopes enforce key, plaintext, and framing bounds', () => {
  assert.throws(
    () => new AesGcmServiceAccountSecretEnvelopeAdapter('short'),
    /IAM_SERVICE_ACCOUNT_ENVELOPE_KEY_INVALID/u,
  );
  const adapter = new AesGcmServiceAccountSecretEnvelopeAdapter('c'.repeat(43));
  const valid = adapter.seal('bounded-secret');
  assert.throws(() => adapter.seal('contains\u0000control'), /IAM_SERVICE_ACCOUNT_SECRET_INVALID/u);
  assert.throws(() => adapter.seal('x'.repeat(513)), /IAM_SERVICE_ACCOUNT_SECRET_INVALID/u);
  assert.equal(adapter.open('v1.invalid.invalid.invalid'), undefined);
  assert.equal(adapter.open(`${valid}.extra`), undefined);
});
