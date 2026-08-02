import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000621';
const workspaceId = '00000000-0000-4000-8000-000000000622';
const artifactId = '00000000-0000-4000-8000-000000000623';
const versionId = '00000000-0000-4000-8000-000000000624';
const placementId = '00000000-0000-4000-8000-000000000625';
const evidenceId = '00000000-0000-4000-8000-000000000626';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000627',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000628',
    idempotencyKey: 'artifact-read',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[IAE-006, IAE-008, IAE-019, IAE-020] artifact reads return exact content-free metadata', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const tenantContext = context();
  const service = new ArtifactService(repository);
  const created = await service.register(tenantContext, {
    version: {
      artifactId,
      versionId,
      tenantScope: tenantContext.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Local',
      contentSha256: 'a'.repeat(64),
      byteSize: 10,
      mediaType: 'text/csv',
      displayName: 'orders.csv',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    placement: {
      placementId,
      tenantScope: tenantContext.tenantScope,
      kind: 'LOCAL',
      opaqueReference: 'local-placement-000001',
      contentSha256: 'a'.repeat(64),
    },
    evidence: {
      evidenceId,
      tenantScope: tenantContext.tenantScope,
      coordinate: { kind: 'ROW', row: 1, field: 'amount' },
    },
  });
  assert.equal(created.accepted, true);

  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    artifactRepository: repository,
    requestTenantContext,
  });
  try {
    const response = await app.inject({ method: 'GET', url: `/v1/artifact-versions/${versionId}` });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      readonly accepted: boolean;
      readonly value: {
        readonly version: { readonly versionId: string };
        readonly placements: readonly [{ readonly opaqueReference: string }];
      };
    };
    assert.equal(body.accepted, true);
    assert.equal(body.value.version.versionId, versionId);
    assert.equal(body.value.placements[0].opaqueReference, 'local-placement-000001');
    assert.doesNotMatch(response.body, /C:\\|\\\\|sourcePath|localPath/u);

    const evidenceResponse = await app.inject({
      method: 'GET',
      url: `/v1/artifact-versions/${versionId}/evidence`,
    });
    assert.equal(evidenceResponse.statusCode, 200);
    const evidenceBody = JSON.parse(evidenceResponse.body) as {
      readonly value: readonly [{ readonly coordinate: Record<string, unknown> }];
    };
    assert.deepEqual(evidenceBody.value[0].coordinate, {
      kind: 'ROW',
      row: 1,
      field: 'amount',
    });

    const resolutionResponse = await app.inject({
      method: 'GET',
      url: `/v1/artifact-versions/${versionId}/evidence/${evidenceId}/resolve`,
    });
    assert.equal(resolutionResponse.statusCode, 200);
    assert.deepEqual(JSON.parse(resolutionResponse.body), {
      accepted: true,
      value: {
        evidence: {
          schemaVersion: 1,
          evidenceId,
          artifactVersionId: versionId,
          tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
          coordinate: { kind: 'ROW', row: 1, field: 'amount' },
          sourceState: 'AVAILABLE',
        },
        version: {
          schemaVersion: 1,
          artifactId,
          versionId,
          tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
          sourceKind: 'FILE',
          dataMode: 'Local',
          contentSha256: 'a'.repeat(64),
          byteSize: 10,
          mediaType: 'text/csv',
          displayName: 'orders.csv',
          createdAt: '2026-01-01T00:00:00.000Z',
          status: 'ACTIVE',
        },
        action: 'OPEN_ON_SOURCE_DEVICE',
        placementReference: 'local-placement-000001',
      },
    });
  } finally {
    await app.close();
  }
});

void test('[IAE-008, IAM-009] artifact reads do not enumerate a sibling workspace', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const tenantContext = context();
  const service = new ArtifactService(repository);
  await service.register(tenantContext, {
    version: {
      artifactId,
      versionId,
      tenantScope: tenantContext.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Cloud',
      contentSha256: 'b'.repeat(64),
      byteSize: 10,
      mediaType: 'text/csv',
      displayName: 'private.csv',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    placement: {
      placementId,
      tenantScope: tenantContext.tenantScope,
      kind: 'CLOUD',
      opaqueReference: 'cloud-placement-000001',
      contentSha256: 'b'.repeat(64),
    },
  });
  const sibling = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000629',
    tenantScope: {
      scopeType: 'workspace',
      organizationId,
      workspaceId: '00000000-0000-4000-8000-000000000630',
    },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000631',
    idempotencyKey: 'artifact-read-sibling',
  });
  assert.equal(sibling.accepted, true);
  if (!sibling.accepted) return;
  const parsedVersionId = parseStableIdentifierV1(versionId);
  assert.equal(parsedVersionId.accepted, true);
  if (!parsedVersionId.accepted) return;
  const result = await service.find(sibling.value, parsedVersionId.value);
  assert.equal(result.version, undefined);
});

void test('[IAE-006, IAE-019] unavailable or deleted evidence never resolves to an open handle', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const tenantContext = context();
  const service = new ArtifactService(repository);
  const registered = await service.register(tenantContext, {
    version: {
      artifactId,
      versionId,
      tenantScope: tenantContext.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Cloud',
      contentSha256: 'c'.repeat(64),
      byteSize: 10,
      mediaType: 'text/csv',
      displayName: 'unavailable.csv',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    placement: {
      placementId,
      tenantScope: tenantContext.tenantScope,
      kind: 'CLOUD',
      opaqueReference: 'cloud-placement-000001',
      contentSha256: 'c'.repeat(64),
    },
    evidence: {
      evidenceId,
      tenantScope: tenantContext.tenantScope,
      coordinate: { kind: 'ROW', row: 1, field: 'amount' },
      sourceState: 'SOURCE_OFFLINE',
    },
  });
  assert.equal(registered.accepted, true);
  if (!registered.accepted) return;
  const registeredEvidence = registered.value.evidence;
  if (!registeredEvidence) return;

  const resolved = await service.resolveEvidence(
    tenantContext,
    registered.value.version.versionId,
    registeredEvidence.evidenceId,
  );
  assert.deepEqual(
    resolved && { action: resolved.action, placementReference: resolved.placementReference },
    {
      action: 'UNAVAILABLE',
      placementReference: undefined,
    },
  );
});
