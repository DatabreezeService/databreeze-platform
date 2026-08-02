import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryExecutionAttemptRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-execution-attempt-repository.adapter.js';
import { ExecutionAttemptService } from '../../../src/features/jra/application/execution-attempt.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const jobId = '00000000-0000-4000-8000-000000000003';
const attemptId = '00000000-0000-4000-8000-000000000004';
const executorId = '00000000-0000-4000-8000-000000000005';
const actorId = '00000000-0000-4000-8000-000000000006';
const correlationId = '00000000-0000-4000-8000-000000000007';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

const ids = {
  organizationId: stable(organizationId),
  workspaceId: stable(workspaceId),
  jobId: stable(jobId),
  attemptId: stable(attemptId),
  executorId: stable(executorId),
  actorId: stable(actorId),
  correlationId: stable(correlationId),
};

function context(key: string) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    actorId: ids.actorId,
    correlationId: ids.correlationId,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

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
    executorType: 'CLOUD_WORKER' as const,
    executorId: ids.executorId,
    leaseTokenHash: 'a'.repeat(64),
    leaseExpiresAt: '2026-01-01T00:05:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

void test('[JRA-007, JRA-023] service claims and advances one attempt with optimistic revisions', async () => {
  const service = new ExecutionAttemptService(new InMemoryExecutionAttemptRepositoryAdapter());
  const claimed = await service.claim(context('claim'), input());
  assert.equal(claimed.accepted, true);
  if (!claimed.accepted) return;
  const replay = await service.claim(context('replay'), input());
  assert.deepEqual(replay, claimed);
  const started = await service.start(
    context('start'),
    ids.attemptId,
    'a'.repeat(64),
    '2026-01-01T00:00:01.000Z',
    1,
  );
  assert.equal(started.accepted, true);
  if (!started.accepted) return;
  const completed = await service.complete(
    context('complete'),
    ids.attemptId,
    'a'.repeat(64),
    'SUCCEEDED',
    '2026-01-01T00:00:02.000Z',
    started.value.revision,
    'b'.repeat(64),
  );
  assert.equal(completed.accepted, true);
  if (completed.accepted) assert.equal(completed.value.state, 'SUCCEEDED');
});

void test('[JRA-007, IAM-009] stale lease completion and sibling workspace access fail closed', async () => {
  const service = new ExecutionAttemptService(new InMemoryExecutionAttemptRepositoryAdapter());
  const claimed = await service.claim(context('scope'), input());
  assert.equal(claimed.accepted, true);
  if (!claimed.accepted) return;
  const sibling = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: stable('00000000-0000-4000-8000-000000000008'),
    },
    actorId: ids.actorId,
    correlationId: ids.correlationId,
    idempotencyKey: 'sibling',
    authorizationEpoch: 1,
  });
  assert.equal(sibling.accepted, true);
  if (!sibling.accepted) return;
  assert.deepEqual(
    await service.complete(
      sibling.value,
      ids.attemptId,
      'a'.repeat(64),
      'SUCCEEDED',
      '2026-01-01T00:00:02.000Z',
      1,
    ),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
  assert.deepEqual(
    await service.complete(
      context('stale'),
      ids.attemptId,
      'b'.repeat(64),
      'SUCCEEDED',
      '2026-01-01T00:00:02.000Z',
      1,
    ),
    { accepted: false, code: 'INVALID_LEASE' },
  );
});
