import assert from 'node:assert/strict';
import test from 'node:test';

import * as api from '../dist/execution-attempt/v1.js';

const ids = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  jobId: '00000000-0000-4000-8000-000000000003',
  attemptId: '00000000-0000-4000-8000-000000000004',
  executorId: '00000000-0000-4000-8000-000000000005',
};

function input() {
  return {
    attemptId: ids.attemptId,
    jobId: ids.jobId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    attemptNumber: 1,
    executorType: 'CLOUD_WORKER',
    executorId: ids.executorId,
    leaseTokenHash: 'a'.repeat(64),
    leaseExpiresAt: '2026-01-01T00:05:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

void test('[JRA-007] attempts claim, start, renew, and complete only with the active lease', () => {
  const created = api.createExecutionAttemptV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const started = api.startExecutionAttemptV1(
    created.value,
    'a'.repeat(64),
    '2026-01-01T00:00:01.000Z',
  );
  assert.equal(started.accepted, true);
  if (!started.accepted) return;
  const renewed = api.renewExecutionAttemptLeaseV1(
    started.value,
    'a'.repeat(64),
    '2026-01-01T00:01:00.000Z',
    '2026-01-01T00:06:00.000Z',
  );
  assert.equal(renewed.accepted, true);
  if (!renewed.accepted) return;
  const completed = api.completeExecutionAttemptV1(
    renewed.value,
    'a'.repeat(64),
    'SUCCEEDED',
    '2026-01-01T00:02:00.000Z',
    'b'.repeat(64),
  );
  assert.equal(completed.accepted, true);
  if (completed.accepted) assert.equal(completed.value.state, 'SUCCEEDED');
});

void test('[JRA-007] stale leases and stale completions fail closed', () => {
  const created = api.createExecutionAttemptV1(input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(
    api.startExecutionAttemptV1(created.value, 'b'.repeat(64), '2026-01-01T00:00:01.000Z'),
    { accepted: false, code: 'INVALID_LEASE' },
  );
  assert.deepEqual(
    api.startExecutionAttemptV1(created.value, 'a'.repeat(64), '2026-01-01T00:06:00.000Z'),
    { accepted: false, code: 'LEASE_EXPIRED' },
  );
  const expired = api.expireExecutionAttemptV1(created.value, '2026-01-01T00:06:00.000Z');
  assert.equal(expired.accepted, true);
  if (expired.accepted)
    assert.deepEqual(
      api.completeExecutionAttemptV1(
        expired.value,
        'a'.repeat(64),
        'SUCCEEDED',
        '2026-01-01T00:06:01.000Z',
      ),
      { accepted: false, code: 'INVALID_STATE' },
    );
});
