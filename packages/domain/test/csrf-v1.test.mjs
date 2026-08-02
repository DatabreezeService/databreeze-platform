import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareCsrfTokensV1,
  CSRF_SCHEMA_VERSION_V1,
  validateCsrfTokenV1,
} from '../dist/csrf/v1.js';

test('[IAM-002] CSRF accepts a high-entropy token and compares equal values', () => {
  const token = 'QmFzZTY0dXJsVG9rZW5fMDEyMzQ1Njc4OWFiY2RlZg';
  const result = validateCsrfTokenV1(token);

  assert.equal(CSRF_SCHEMA_VERSION_V1, 1);
  assert.deepEqual(result, { accepted: true, value: token });
  assert.equal(compareCsrfTokensV1(token, token), true);
});

test('[IAM-002] CSRF rejects missing, malformed, and oversized tokens', () => {
  assert.equal(validateCsrfTokenV1(undefined).accepted, false);
  assert.equal(validateCsrfTokenV1('too-short').accepted, false);
  assert.equal(validateCsrfTokenV1('a'.repeat(257)).accepted, false);
  assert.equal(validateCsrfTokenV1('token with spaces').accepted, false);
  assert.equal(validateCsrfTokenV1('token\nwith-control').accepted, false);
});

test('[IAM-002] CSRF comparison fails closed for mismatches and malformed inputs', () => {
  const valid = 'QmFzZTY0dXJsVG9rZW5fMDEyMzQ1Njc4OWFiY2RlZg';

  assert.equal(compareCsrfTokensV1(valid, `${valid}x`), false);
  assert.equal(compareCsrfTokensV1(valid, 'different-token-value-123456789012345678901234'), false);
  assert.equal(compareCsrfTokensV1(valid, undefined), false);
  assert.equal(compareCsrfTokensV1('short', valid), false);
});
