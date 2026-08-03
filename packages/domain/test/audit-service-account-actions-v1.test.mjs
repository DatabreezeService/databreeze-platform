import assert from 'node:assert/strict';
import test from 'node:test';

import * as audit from '../dist/audit/v1.js';

void test('[IAM-013, AUD-002] service-account lifecycle actions are part of the closed audit vocabulary', () => {
  assert.deepEqual(
    ['service_account.created', 'service_account.rotated', 'service_account.revoked'].map(
      (action) => audit.AUDIT_ACTIONS_V1.includes(action),
    ),
    [true, true, true],
  );
});
