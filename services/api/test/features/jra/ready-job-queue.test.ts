import assert from 'node:assert/strict';
import test from 'node:test';

import { createJobDispatchRecordV1 } from '@databreeze/domain/dispatch/v1';
import { createJobV1, createTypedActionDefinitionV1 } from '@databreeze/domain/jobs/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryReadyJobQueueRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-ready-job-queue-repository.adapter.js';
import { ReadyJobQueueService } from '../../../src/features/jra/application/ready-job-queue.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000501',
  workspace: '00000000-0000-4000-8000-000000000502',
  siblingWorkspace: '00000000-0000-4000-8000-000000000503',
  actor: '00000000-0000-4000-8000-000000000504',
  correlation: '00000000-0000-4000-8000-000000000505',
  job: '00000000-0000-4000-8000-000000000506',
  dispatch: '00000000-0000-4000-8000-000000000507',
});

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

function context(workspaceId: string, key: string) {
  const parsed = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: id(ids.organization),
      workspaceId: id(workspaceId),
    },
    actorId: id(ids.actor),
    correlationId: id(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test context');
  return parsed.value;
}

function readyItem(workspaceId = ids.workspace) {
  const scope = {
    scopeType: 'workspace' as const,
    organizationId: id(ids.organization),
    workspaceId: id(workspaceId),
  };
  const action = createTypedActionDefinitionV1({
    actionType: 'dda.materialize.widget-result',
    version: 1,
    inputSchemaId: 'dda.widget.input.v4',
    outputSchemaId: 'dda.widget.output.v4',
    handlerDigest: 'a'.repeat(64),
    requiredCapabilities: ['artifact.read'],
    sideEffectClass: 'NONE',
    riskClass: 'READ_ONLY',
    defaultTimeoutSeconds: 120,
    maxAttempts: 3,
    approvalClass: 'NONE',
  });
  assert.equal(action.accepted, true);
  if (!action.accepted) throw new Error('invalid test action');
  const job = createJobV1({
    jobId: id(ids.job),
    tenantScope: scope,
    requestedBy: id(ids.actor),
    action: action.value,
    inputManifestHash: 'b'.repeat(64),
    idempotencyKey: 'materialize:ready-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(job.accepted, true);
  if (!job.accepted) throw new Error('invalid test job');
  const dispatch = createJobDispatchRecordV1({
    dispatchId: id(ids.dispatch),
    jobId: id(ids.job),
    tenantScope: scope,
    eventType: 'JOB_READY',
    payloadHash: 'c'.repeat(64),
    idempotencyKey: 'dispatch:ready-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(dispatch.accepted, true);
  if (!dispatch.accepted) throw new Error('invalid test dispatch');
  return { job: job.value, dispatch: dispatch.value };
}

void test('[JRA-001/JRA-013] ready queue promotes CREATED work and acknowledges its outbox atomically', async () => {
  const repository = new InMemoryReadyJobQueueRepositoryAdapter();
  repository.seed(readyItem());
  const service = new ReadyJobQueueService(repository);
  const result = await service.promote(
    context(ids.workspace, 'promote-1'),
    '2026-01-01T00:00:01.000Z',
    10,
  );
  assert.equal('accepted' in result, false);
  if ('accepted' in result) return;
  assert.equal(result.promoted.length, 1);
  assert.equal(result.promoted[0]?.job.state, 'QUEUED');
  assert.equal(result.promoted[0]?.job.revision, 2);
  assert.equal(result.promoted[0]?.dispatch.deliveredAt, '2026-01-01T00:00:01.000Z');
  assert.equal(repository.getTransitions().length, 1);
  assert.deepEqual(
    await service.promote(context(ids.workspace, 'promote-2'), '2026-01-01T00:00:02.000Z', 10),
    { promoted: [], skipped: [] },
  );
});

void test('[IAM-009/JRA-013] ready reconstruction never leaks a sibling workspace', async () => {
  const repository = new InMemoryReadyJobQueueRepositoryAdapter();
  repository.seed(readyItem());
  const result = await new ReadyJobQueueService(repository).promote(
    context(ids.siblingWorkspace, 'scope-1'),
    '2026-01-01T00:00:01.000Z',
    10,
  );
  assert.equal('accepted' in result, false);
  if ('accepted' in result) return;
  assert.deepEqual(result, { promoted: [], skipped: [] });
});

void test('[JRA-001] invalid batch limits fail closed before touching durable work', async () => {
  const repository = new InMemoryReadyJobQueueRepositoryAdapter();
  repository.seed(readyItem());
  const result = await new ReadyJobQueueService(repository).promote(
    context(ids.workspace, 'limit-1'),
    '2026-01-01T00:00:01.000Z',
    0,
  );
  assert.deepEqual(result, { accepted: false, code: 'INVALID_LIMIT' });
  assert.equal(repository.getTransitions().length, 0);
});
