import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { InMemoryArtifactRetentionRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-retention-repository.adapter.js';
import { ArtifactService } from '../../../src/features/iae/application/artifact.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000731';
const workspaceId = '00000000-0000-4000-8000-000000000732';
const actorId = '00000000-0000-4000-8000-000000000733';
const artifactId = '00000000-0000-4000-8000-000000000734';
const versionId = '00000000-0000-4000-8000-000000000735';
const placementId = '00000000-0000-4000-8000-000000000736';
const requestId = '00000000-0000-4000-8000-000000000737';

void test('[IAE-016, IAM-009] retention HTTP binds requester to the authenticated actor and supports reads', async () => {
  const contextResult = createIamTenantContextV1({
    actorId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000738',
    idempotencyKey: 'retention-http',
  });
  assert.equal(contextResult.accepted, true);
  if (!contextResult.accepted) throw new Error('fixture context rejected');
  const context = contextResult.value;
  const artifacts = new InMemoryArtifactRepositoryAdapter();
  await new ArtifactService(artifacts).register(context, {
    version: {
      artifactId,
      versionId,
      tenantScope: context.tenantScope,
      sourceKind: 'FILE',
      dataMode: 'Local',
      contentSha256: 'b'.repeat(64),
      byteSize: 1,
      mediaType: 'text/plain',
      displayName: 'retention.txt',
      createdAt: '2026-08-02T00:00:00.000Z',
    },
    placement: {
      placementId,
      tenantScope: context.tenantScope,
      kind: 'LOCAL',
      opaqueReference: 'local-retention-placement',
      contentSha256: 'b'.repeat(64),
    },
  });
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(context),
  };
  const retention = new InMemoryArtifactRetentionRepositoryAdapter();
  const { app } = await createApiApplication({
    artifactRepository: artifacts,
    artifactRetentionRepository: retention,
    requestTenantContext,
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/artifact-versions/${versionId}/deletion-requests`,
      payload: {
        requestId,
        requestedBy: '00000000-0000-4000-8000-000000000739',
        requestedAt: '2026-08-02T01:00:00.000Z',
        evaluatedAt: '2026-08-02T01:00:00.000Z',
        workspaceRetentionUntil: '2026-07-01T00:00:00.000Z',
        resourceRetentionUntil: '2026-07-01T00:00:00.000Z',
        auditRetentionUntil: '2026-07-01T00:00:00.000Z',
        recoveryWindowUntil: '2026-07-01T00:00:00.000Z',
        activeApproval: false,
        legalHold: false,
      },
    });
    assert.equal(response.statusCode, 201);
    const created = response.json() as {
      readonly accepted: boolean;
      readonly value?: { readonly requestedBy?: string; readonly requestId?: string };
    };
    assert.equal(created.accepted, true);
    assert.equal(created.value?.requestId, requestId);
    assert.equal(created.value?.requestedBy, actorId);

    const read = await app.inject({
      method: 'GET',
      url: `/v1/artifact-deletion-requests/${requestId}`,
    });
    assert.equal(read.statusCode, 200);
    assert.deepEqual(read.json(), created);
    assert.doesNotMatch(read.body, /path|bytes|excerpt|opaqueReference/iu);
  } finally {
    await app.close();
  }
});
