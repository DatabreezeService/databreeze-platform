import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryJobRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-job-repository.adapter.js';
import { JobService } from '../../../src/features/jra/application/job.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';
const jobId = '00000000-0000-4000-8000-000000000020';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function context(workspace: string, key: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: workspace },
    actorId,
    correlationId,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

const action = {
  actionType: 'spreadsheet.audit',
  version: 1,
  inputSchemaId: 'schema.spreadsheet.audit.input.v1',
  outputSchemaId: 'schema.spreadsheet.audit.output.v1',
  handlerDigest: 'a'.repeat(64),
  requiredCapabilities: ['artifact.read'],
  sideEffectClass: 'NONE',
  riskClass: 'READ_ONLY',
  defaultTimeoutSeconds: 60,
  maxAttempts: 3,
  approvalClass: 'NONE',
};

function input() {
  return {
    jobId,
    requestedBy: actorId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    inputManifestHash: 'b'.repeat(64),
    idempotencyKey: 'job-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    action,
  };
}

void test('[JRA-001, JRA-002, JRA-007] job creation and transitions are idempotent and revisioned', async () => {
  const service = new JobService(new InMemoryJobRepositoryAdapter());
  const created = await service.create(context(workspaceId, 'create'), input());
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const replay = await service.create(context(workspaceId, 'replay'), input());
  assert.deepEqual(replay, created);
  const queued = await service.transition(
    context(workspaceId, 'queue'),
    stable(jobId),
    'QUEUED',
    '2026-01-01T00:00:01.000Z',
    1,
  );
  assert.equal(queued.accepted, true);
  if (queued.accepted)
    assert.deepEqual(
      await service.transition(
        context(workspaceId, 'stale'),
        stable(jobId),
        'DISPATCHED',
        '2026-01-01T00:00:02.000Z',
        1,
      ),
      { accepted: false, code: 'INVALID_REVISION' },
    );
});

void test('[IAM-009, JRA-001] sibling workspaces cannot read or transition a job', async () => {
  const service = new JobService(new InMemoryJobRepositoryAdapter());
  const created = await service.create(context(workspaceId, 'scope'), input());
  assert.equal(created.accepted, true);
  assert.equal(await service.find(context(siblingWorkspaceId, 'read'), stable(jobId)), undefined);
  assert.deepEqual(
    await service.transition(
      context(siblingWorkspaceId, 'transition'),
      stable(jobId),
      'QUEUED',
      '2026-01-01T00:00:01.000Z',
      1,
    ),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
});
