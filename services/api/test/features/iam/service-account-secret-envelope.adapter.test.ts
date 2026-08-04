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
