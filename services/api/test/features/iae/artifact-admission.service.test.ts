import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createArtifactVersionV1 } from '@databreeze/domain/artifact/v1';
import { ArtifactAdmissionService } from '../../../src/features/iae/application/artifact-admission.service.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'admission-service',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

void test('IAE-009/010 admission updates only the status projection after scanner checks', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const service = new ArtifactAdmissionService(repository);
  const artifact = createArtifactVersionV1({
    artifactId: '55555555-5555-4555-8555-555555555555',
    versionId: '66666666-6666-4666-8666-666666666666',
    tenantScope: context.tenantScope,
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'a'.repeat(64),
    byteSize: 4,
    mediaType: 'text/csv',
    displayName: 'orders.csv',
    createdAt: '2026-08-02T00:00:00.000Z',
    status: 'QUARANTINED',
  });
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) return;
  await repository.saveVersion(context, artifact.value);
  const admitted = await service.admit(context, artifact.value.versionId, {
    actualSha256: 'a'.repeat(64),
    actualByteSize: 4,
    detectedMediaType: 'text/csv',
    scanState: 'CLEAN',
    maxByteSize: 100,
  });
  assert.equal(admitted.accepted, true);
  if (!admitted.accepted) return;
  assert.equal(admitted.value.version.status, 'ACTIVE');
  assert.equal(admitted.value.version.scanState, 'CLEAN');
  const rejected = await service.admit(context, artifact.value.versionId, {
    actualSha256: 'b'.repeat(64),
    actualByteSize: 4,
    detectedMediaType: 'text/csv',
    scanState: 'CLEAN',
    maxByteSize: 100,
  });
  assert.deepEqual(rejected, { accepted: false, code: 'DIGEST_MISMATCH' });
});

void test('IAE-009 admission never lets request input replace the repository artifact', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const service = new ArtifactAdmissionService(repository);
  const artifact = createArtifactVersionV1({
    artifactId: '55555555-5555-4555-8555-555555555555',
    versionId: '66666666-6666-4666-8666-666666666666',
    tenantScope: context.tenantScope,
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'a'.repeat(64),
    byteSize: 4,
    mediaType: 'text/csv',
    displayName: 'orders.csv',
    createdAt: '2026-08-02T00:00:00.000Z',
    status: 'QUARANTINED',
  });
  const attackerArtifact = createArtifactVersionV1({
    artifactId: '77777777-7777-4777-8777-777777777777',
    versionId: '88888888-8888-4888-8888-888888888888',
    tenantScope: context.tenantScope,
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'b'.repeat(64),
    byteSize: 4,
    mediaType: 'text/csv',
    displayName: 'attacker.csv',
    createdAt: '2026-08-02T00:00:00.000Z',
    status: 'QUARANTINED',
  });
  assert.equal(artifact.accepted, true);
  assert.equal(attackerArtifact.accepted, true);
  if (!artifact.accepted || !attackerArtifact.accepted) return;
  await repository.saveVersion(context, artifact.value);

  const untrustedInput = {
    actualSha256: 'b'.repeat(64),
    actualByteSize: 4,
    detectedMediaType: 'text/csv',
    scanState: 'CLEAN' as const,
    maxByteSize: 100,
    artifact: attackerArtifact.value,
  };
  const result = await service.admit(context, artifact.value.versionId, untrustedInput);

  assert.deepEqual(result, { accepted: false, code: 'DIGEST_MISMATCH' });
  assert.equal(
    (await repository.findVersion(context, artifact.value.versionId))?.status,
    'QUARANTINED',
  );
});
