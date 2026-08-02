import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { InMemoryArtifactIntakeRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-intake-repository.adapter.js';
import { ArtifactIntakeService } from '../../../src/features/iae/application/artifact-intake.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

const organizationId = '00000000-0000-4000-8000-000000000601';
const workspaceId = '00000000-0000-4000-8000-000000000602';
const inboxItemId = '00000000-0000-4000-8000-000000000603';
const artifactVersionId = '00000000-0000-4000-8000-000000000604';

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000605',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000606',
    idempotencyKey: 'http-inbox',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

void test('[IAE-001, IAM-009] HTTP inbox listing uses the configured tenant context and returns no source content', async () => {
  const repository = new InMemoryArtifactIntakeRepositoryAdapter();
  const tenantContext = context();
  const intake = new ArtifactIntakeService(repository);
  const created = await intake.create(tenantContext, {
    inboxItemId,
    tenantScope: tenantContext.tenantScope,
    idempotencyKey: 'http-inbox-item',
    artifactVersionId,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);

  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.resolve(tenantContext),
  };
  const { app } = await createApiApplication({
    artifactIntakeRepository: repository,
    requestTenantContext,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/artifacts/inbox' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [created.accepted ? created.value : undefined]);
    assert.doesNotMatch(response.body, /opaque|path|byte|excerpt/u);
  } finally {
    await app.close();
  }
});
