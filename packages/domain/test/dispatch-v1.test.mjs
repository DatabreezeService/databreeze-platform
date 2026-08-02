import assert from 'node:assert/strict';
import test from 'node:test';

import * as api from '../dist/dispatch/v1.js';

const input = {
  dispatchId: '00000000-0000-4000-8000-000000000001',
  jobId: '00000000-0000-4000-8000-000000000002',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000003',
    workspaceId: '00000000-0000-4000-8000-000000000004',
  },
  eventType: 'JOB_READY',
  payloadHash: 'a'.repeat(64),
  idempotencyKey: 'dispatch-1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

void test('[JRA-001, JRA-002, JRA-013] dispatch records are immutable, typed, and delivery-revisioned', () => {
  const created = api.createJobDispatchRecordV1(input);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const delivered = api.markJobDispatchDeliveredV1(created.value, '2026-01-01T00:00:02.000Z');
  assert.equal(delivered.accepted, true);
  if (delivered.accepted) {
    assert.equal(delivered.value.deliveredAt, '2026-01-01T00:00:02.000Z');
    assert.equal(delivered.value.revision, 2);
  }
  assert.deepEqual(api.markJobDispatchDeliveredV1(created.value, '2025-12-31T23:59:59.000Z'), {
    accepted: false,
    code: 'INVALID_TIMESTAMP',
  });
});
