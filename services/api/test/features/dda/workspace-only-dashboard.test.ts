import assert from 'node:assert/strict';
import test from 'node:test';

import { assertWorkspaceOnlyAudienceV1 } from '../../../src/features/dda/dashboard/application/workspace-only-audience.js';

void test('[DDA-058] rejects public anonymous guest and shared-link audiences', () => {
  for (const audience of ['PUBLIC', 'ANONYMOUS', 'EXTERNAL_GUEST', 'SHARED_LINK'] as const) {
    const result = assertWorkspaceOnlyAudienceV1(audience);
    assert.equal(result.accepted, false);
    if (result.accepted) return;
    assert.equal(result.code, 'PROHIBITED_AUDIENCE');
  }
});

void test('[DDA-058] allows workspace-member audiences only', () => {
  for (const audience of ['OWNER', 'WORKSPACE_VIEWERS', 'PROJECT_VIEWERS'] as const) {
    const result = assertWorkspaceOnlyAudienceV1(audience);
    assert.equal(result.accepted, true);
  }
});
