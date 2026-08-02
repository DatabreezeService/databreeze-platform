import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryDispatchRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-dispatch-repository.adapter.js';
import { DispatchService } from '../../../src/features/jra/application/dispatch.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const jobId = '00000000-0000-4000-8000-000000000004';
const dispatchId = '00000000-0000-4000-8000-000000000005';
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
  siblingWorkspaceId: stable(siblingWorkspaceId),
  jobId: stable(jobId),
  dispatchId: stable(dispatchId),
  actorId: stable(actorId),
  correlationId: stable(correlationId),
};

function context(workspace: typeof ids.workspaceId, key: string) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: workspace,
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
    dispatchId: ids.dispatchId,
    jobId: ids.jobId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    eventType: 'JOB_READY' as const,
    payloadHash: 'a'.repeat(64),
    idempotencyKey: 'job-ready-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

void test('[JRA-001, JRA-002, JRA-013] service enqueues idempotently and reconstructs pending work', async () => {
  const service = new DispatchService(new InMemoryDispatchRepositoryAdapter());
  const queued = await service.enqueue(context(ids.workspaceId, 'enqueue'), input());
  assert.equal(queued.accepted, true);
  if (!queued.accepted) return;
  assert.deepEqual(await service.enqueue(context(ids.workspaceId, 'replay'), input()), queued);
  const pending = await service.pending(context(ids.workspaceId, 'pending'), 10);
  assert.deepEqual(pending, [queued.value]);
  const delivered = await service.markDelivered(
    context(ids.workspaceId, 'deliver'),
    ids.dispatchId,
    '2026-01-01T00:00:02.000Z',
    1,
  );
  assert.equal(delivered.accepted, true);
  assert.deepEqual(await service.pending(context(ids.workspaceId, 'after'), 10), []);
});

void test('[IAM-009, JRA-013] pending work is scope-isolated and stale delivery is rejected', async () => {
  const service = new DispatchService(new InMemoryDispatchRepositoryAdapter());
  const queued = await service.enqueue(context(ids.workspaceId, 'scope'), input());
  assert.equal(queued.accepted, true);
  assert.deepEqual(await service.pending(context(ids.siblingWorkspaceId, 'sibling'), 10), []);
  assert.deepEqual(
    await service.markDelivered(
      context(ids.workspaceId, 'stale'),
      ids.dispatchId,
      '2026-01-01T00:00:02.000Z',
      2,
    ),
    { accepted: false, code: 'INVALID_REVISION' },
  );
});
