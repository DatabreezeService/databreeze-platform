import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryArtifactLineageRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-lineage-repository.adapter.js';
import { ArtifactGovernanceService } from '../../../src/features/iae/application/artifact-governance.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000641';
const workspaceId = '00000000-0000-4000-8000-000000000642';
const sourceVersionId = '00000000-0000-4000-8000-000000000643';
const derivedVersionId = '00000000-0000-4000-8000-000000000644';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000645',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000646',
    idempotencyKey: 'lineage-http',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[IAE-007] lineage endpoints resolve exact derived and source versions', async () => {
  const repository = new InMemoryArtifactLineageRepositoryAdapter();
  const tenantContext = context();
  const governance = new ArtifactGovernanceService(repository);
  const created = await governance.registerLineage(tenantContext, {
    lineageId: '00000000-0000-4000-8000-000000000647',
    derivedArtifactVersionId: derivedVersionId,
    tenantScope: tenantContext.tenantScope,
    sourceArtifactVersionIds: [sourceVersionId],
    sourceTenantScopes: [tenantContext.tenantScope],
    processorVersion: 'spreadsheet-auditor@1',
    coordinateLineage: [],
  });
  assert.equal(created.accepted, true);

  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    artifactLineageRepository: repository,
    requestTenantContext,
  });
  try {
    const derived = await app.inject({
      method: 'GET',
      url: `/v1/artifact-versions/${derivedVersionId}/lineage`,
    });
    assert.equal(derived.statusCode, 200);
    const derivedBody = JSON.parse(derived.body) as {
      readonly value: { readonly derivedArtifactVersionId: string };
    };
    assert.equal(derivedBody.value.derivedArtifactVersionId, derivedVersionId);

    const source = await app.inject({
      method: 'GET',
      url: `/v1/artifact-versions/${sourceVersionId}/derived-lineage`,
    });
    assert.equal(source.statusCode, 200);
    const sourceBody = JSON.parse(source.body) as { readonly value: readonly unknown[] };
    assert.equal(sourceBody.value.length, 1);
  } finally {
    await app.close();
  }
});
