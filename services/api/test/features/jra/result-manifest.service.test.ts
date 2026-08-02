import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryResultManifestRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-result-manifest-repository.adapter.js';
import { ResultManifestService } from '../../../src/features/jra/application/result-manifest.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const jobId = '00000000-0000-4000-8000-000000000004';
const attemptId = '00000000-0000-4000-8000-000000000005';
const resultManifestId = '00000000-0000-4000-8000-000000000006';
const sourceId = '00000000-0000-4000-8000-000000000007';
const outputId = '00000000-0000-4000-8000-000000000008';
const reviewerId = '00000000-0000-4000-8000-000000000009';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';

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
  attemptId: stable(attemptId),
  resultManifestId: stable(resultManifestId),
  sourceId: stable(sourceId),
  outputId: stable(outputId),
  reviewerId: stable(reviewerId),
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
    resultManifestId: ids.resultManifestId,
    jobId: ids.jobId,
    attemptId: ids.attemptId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    sourceArtifactVersionIds: [ids.sourceId],
    outputIds: [ids.outputId],
    outputHashes: ['b'.repeat(64)],
    evidenceCoverage: 'COMPLETE' as const,
    handlerDigest: 'c'.repeat(64),
    engineVersion: 'engine-1.0.0',
    attemptNumber: 1,
    reviewerId: ids.reviewerId,
    approvalState: 'APPROVED' as const,
    manifestHash: 'd'.repeat(64),
    generatedAt: '2026-01-01T00:02:00.000Z',
  };
}

void test('[JRA-012, JRA-029] service publishes one immutable attempt result and replays idempotently', async () => {
  const service = new ResultManifestService(new InMemoryResultManifestRepositoryAdapter());
  const published = await service.publish(context(ids.workspaceId, 'publish'), input());
  assert.equal(published.accepted, true);
  if (!published.accepted) return;
  const replay = await service.publish(context(ids.workspaceId, 'replay'), input());
  assert.deepEqual(replay, published);
  const found = await service.find(context(ids.workspaceId, 'find'), ids.resultManifestId);
  assert.deepEqual(found, published.value);
});

void test('[IAM-009, JRA-012] result manifests remain invisible to sibling workspaces', async () => {
  const service = new ResultManifestService(new InMemoryResultManifestRepositoryAdapter());
  await service.publish(context(ids.workspaceId, 'publish-scope'), input());
  assert.equal(
    await service.find(context(ids.siblingWorkspaceId, 'read-scope'), ids.resultManifestId),
    undefined,
  );
});
