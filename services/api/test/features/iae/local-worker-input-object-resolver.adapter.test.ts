import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ArtifactRepositoryPortV1 } from '../../../src/features/iae/application/artifact-repository.port.js';
import { LocalWorkerInputObjectResolverAdapter } from '../../../src/features/iae/adapter/local-worker-input-object-resolver.adapter.js';
import type { ExecutionRouteWorkspacePolicyAuthorityPortV1 } from '../../../src/features/dso/application/execution-route-policy-authority.port.js';
import type { JobV1 } from '@databreeze/domain/jobs/v1';
import type { ExecutionAttemptV1 } from '@databreeze/domain/execution-attempt/v1';
import type { ArtifactVersionV1, ContentPlacementV1 } from '@databreeze/domain/artifact/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test id');
  return parsed.value;
}

function timestamp(value: string): StrictUtcTimestampV1 {
  const parsed = parseStrictUtcTimestampV1(value);
  if (!parsed.accepted) throw new Error('invalid test timestamp');
  return parsed.value;
}

const scope = Object.freeze({
  scopeType: 'workspace' as const,
  organizationId: id('00000000-0000-4000-8000-000000000001'),
  workspaceId: id('00000000-0000-4000-8000-000000000002'),
}) satisfies TenantScopeV1;
const artifact = Object.freeze({
  schemaVersion: 1 as const,
  artifactId: id('00000000-0000-4000-8000-000000000010'),
  versionId: id('00000000-0000-4000-8000-000000000011'),
  tenantScope: scope,
  sourceKind: 'FILE' as const,
  dataMode: 'Hybrid' as const,
  contentSha256: 'a'.repeat(64),
  byteSize: 12,
  mediaType: 'text/csv',
  displayName: 'sales.csv',
  createdAt: timestamp('2026-08-19T00:00:00.000Z'),
  status: 'ACTIVE' as const,
  scanState: 'CLEAN' as const,
}) satisfies ArtifactVersionV1;
const placement = Object.freeze({
  schemaVersion: 1 as const,
  placementId: id('00000000-0000-4000-8000-000000000012'),
  artifactVersionId: artifact.versionId,
  tenantScope: scope,
  kind: 'CLOUD' as const,
  opaqueReference: 'local-placement',
  contentSha256: artifact.contentSha256,
  available: true,
  revision: 1,
}) satisfies ContentPlacementV1;

const job = Object.freeze({
  jobId: '00000000-0000-4000-8000-000000000020',
  tenantScope: scope,
  requestedBy: '00000000-0000-4000-8000-000000000003',
  action: {
    actionType: 'dda.materialize.widget-result',
    version: 1,
    inputSchemaId: 'dda.dashboard-widget-result-parameters.v1',
    outputSchemaId: 'dda.dashboard-widget-result.v4',
    handlerDigest: 'b'.repeat(64),
    requiredCapabilities: ['READ_DATASET'],
    sideEffectClass: 'NONE' as const,
    riskClass: 'READ_ONLY' as const,
  },
  inputManifestHash: 'c'.repeat(64),
  idempotencyKey: 'local-worker-input-job-001',
  state: 'RUNNING' as const,
  revision: 1,
  createdAt: '2026-08-19T00:00:00.000Z',
  startedAt: '2026-08-19T00:00:00.000Z',
  finishedAt: undefined,
}) as unknown as JobV1;
const attempt = Object.freeze({
  attemptId: '00000000-0000-4000-8000-000000000021',
  jobId: job.jobId,
  tenantScope: scope,
  attemptNumber: 1,
  executorType: 'CLOUD_WORKER' as const,
  executorId: '00000000-0000-4000-8000-000000000003',
  leaseTokenHash: 'd'.repeat(64),
  leaseExpiresAt: '2026-08-19T00:15:00.000Z',
  state: 'RUNNING' as const,
  createdAt: '2026-08-19T00:00:00.000Z',
  heartbeatAt: '2026-08-19T00:00:00.000Z',
  startedAt: '2026-08-19T00:00:00.000Z',
  finishedAt: undefined,
  resultManifestHash: undefined,
  revision: 2,
}) as unknown as ExecutionAttemptV1;

function resolver(mode: 'HYBRID' | 'LOCAL' = 'HYBRID') {
  const artifacts = {
    findVersion: async () => artifact,
    listPlacements: async () => [placement],
  } as unknown as ArtifactRepositoryPortV1;
  const policies: ExecutionRouteWorkspacePolicyAuthorityPortV1 = {
    resolveCurrentWorkspacePolicy: async () =>
      ({
        policy: { mode, allowedPlacementKinds: ['CLOUD'] },
        authorizationEpoch: 1,
      }) as never,
  };
  return new LocalWorkerInputObjectResolverAdapter({ artifacts, policies });
}

void test('[IAE-024/JRA-033] local resolver returns exact server-owned hash and length metadata', async () => {
  const result = await resolver().resolveInputObjects({
    tenantScope: scope,
    job,
    attempt,
    inputObjectIds: [artifact.versionId],
  });
  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.deepEqual(result.value.objects, [
      { objectId: artifact.versionId, contentSha256: artifact.contentSha256, contentLength: 12 },
    ]);
    assert.equal(result.value.maxBytes, 10 * 1024 * 1024 * 1024);
  }
});

void test('[IAE-024/JRA-033] local resolver rejects missing descriptor IDs and LOCAL policy', async () => {
  const missing = await resolver().resolveInputObjects({ tenantScope: scope, job, attempt });
  assert.deepEqual(missing, { accepted: false, code: 'INVALID_OBJECT_REFERENCE' });
  const denied = await resolver('LOCAL').resolveInputObjects({
    tenantScope: scope,
    job,
    attempt,
    inputObjectIds: [artifact.versionId],
  });
  assert.deepEqual(denied, { accepted: false, code: 'INPUT_OBJECTS_UNAVAILABLE' });
});
