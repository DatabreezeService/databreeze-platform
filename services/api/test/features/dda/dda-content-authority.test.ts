import assert from 'node:assert/strict';
import test from 'node:test';

import { DdaContentAuthorityV1 } from '../../../src/features/dda/application/dda-content-authority.js';

void test('[DDA-043] empty or control-character source content cannot be branded', () => {
  const authority = new DdaContentAuthorityV1();
  assert.equal(authority.brandSourceContent('').accepted, false);
  assert.equal(authority.brandSourceContent('\u0000hostile').accepted, false);
});
