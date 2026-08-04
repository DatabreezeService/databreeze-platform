import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const artifactId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const placementId = '55555555-5555-4555-8555-555555555555';
const evidenceId = '66666666-6666-4666-8666-666666666666';

const contextResult = createIamTenantContextV1({
  actorId: '77777777-7777-4777-8777-777777777777',
  tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
  authorizationEpoch: 1,
  correlationId: '88888888-8888-4888-8888-888888888888',
  idempotencyKey: 'local-artifact-registration-001',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const tenantContext = contextResult.value;

const registrationPayload = {
  artifactId,
  versionId,
  placementId,
  evidence: {
    evidenceId,
    coordinate: { kind: 'CELL', sheet: 'Orders', address: 'B4' },
  },
  sourceKind: 'FILE',
  contentSha256: 'a'.repeat(64),
  byteSize: 42,
  mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  displayName: 'orders.xlsx',
  createdAt: '2026-08-04T00:00:00.000Z',
  opaqueReference: 'desktop-local-handle-000001',
};

function requestTenantContext(): RequestTenantContextPortV1 {
  return { resolve: () => Promise.resolve(tenantContext) };
}

void test('IAE-001/004/006/019 local registration stores only opaque metadata and resolves source-device evidence', async () => {
  const repository = new InMemoryArtifactRepositoryAdapter();
  const { app } = await createApiApplication({
    artifactRepository: repository,
    requestTenantContext: requestTenantContext(),
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/artifact-versions/local',
      headers: { 'idempotency-key': 'local-artifact-registration-001' },
      payload: registrationPayload,
    });
    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body) as {
      readonly accepted: boolean;
      readonly value: {
        readonly version: { readonly dataMode: string; readonly tenantScope: unknown };
        readonly placement: { readonly kind: string; readonly opaqueReference: string };
        readonly evidence?: { readonly coordinate: Record<string, unknown> };
      };
    };
    assert.equal(body.accepted, true);
    assert.equal(body.value.version.dataMode, 'Local');
    assert.deepEqual(body.value.version.tenantScope, tenantContext.tenantScope);
    assert.equal(body.value.placement.kind, 'LOCAL');
    assert.equal(body.value.placement.opaqueReference, registrationPayload.opaqueReference);
    assert.deepEqual(body.value.evidence?.coordinate, registrationPayload.evidence.coordinate);
    assert.doesNotMatch(response.body, /sourcePath|localPath|rawBytes|file:\/\//iu);

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/artifact-versions/local',
      headers: { 'idempotency-key': 'local-artifact-registration-001' },
      payload: registrationPayload,
    });
    assert.equal(replay.statusCode, 201);
    assert.deepEqual(JSON.parse(replay.body), body);

    const resolution = await app.inject({
      method: 'GET',
      url: `/v1/artifact-versions/${versionId}/evidence/${evidenceId}/resolve`,
    });
    assert.equal(resolution.statusCode, 200);
    assert.deepEqual(JSON.parse(resolution.body), {
      accepted: true,
      value: {
        evidence: {
          schemaVersion: 1,
          evidenceId,
          artifactVersionId: versionId,
          tenantScope: tenantContext.tenantScope,
          coordinate: registrationPayload.evidence.coordinate,
          sourceState: 'AVAILABLE',
        },
        version: {
          schemaVersion: 1,
          artifactId,
          versionId,
          tenantScope: tenantContext.tenantScope,
          sourceKind: 'FILE',
          dataMode: 'Local',
          contentSha256: 'a'.repeat(64),
          byteSize: 42,
          mediaType: registrationPayload.mediaType,
          displayName: 'orders.xlsx',
          createdAt: '2026-08-04T00:00:00.000Z',
          status: 'ACTIVE',
          scanState: 'PENDING',
        },
        action: 'OPEN_ON_SOURCE_DEVICE',
        placementReference: registrationPayload.opaqueReference,
      },
    });
  } finally {
    await app.close();
  }
});

void test('IAE-004 local registration rejects caller paths, bytes, and tenant scope fields', async () => {
  const { app } = await createApiApplication({
    artifactRepository: new InMemoryArtifactRepositoryAdapter(),
    requestTenantContext: requestTenantContext(),
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/artifact-versions/local',
      headers: { 'idempotency-key': 'local-artifact-registration-002' },
      payload: {
        ...registrationPayload,
        sourcePath: 'C:\\Users\\alice\\orders.xlsx',
        rawBytes: 'not-accepted',
        tenantScope: { scopeType: 'organization', organizationId },
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).code, 'VALIDATION_FAILED');
    assert.doesNotMatch(response.body, /C:\\|alice|rawBytes|tenantScope/iu);
  } finally {
    await app.close();
  }
});
