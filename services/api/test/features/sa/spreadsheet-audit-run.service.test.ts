import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createArtifactVersionV1,
  createContentPlacementV1,
  updateContentPlacementAvailabilityV1,
  type ArtifactVersionV1,
} from '@databreeze/domain/artifact/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { InMemoryArtifactRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-artifact-repository.adapter.js';
import { SpreadsheetAuditRunService } from '../../../src/features/sa/application/spreadsheet-audit-run.service.js';
import { InMemorySpreadsheetAuditRunRepositoryAdapter } from '../../../src/features/sa/adapter/in-memory-spreadsheet-audit-run-repository.adapter.js';

const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  organization: '22222222-2222-4222-8222-222222222222',
  workspace: '33333333-3333-4333-8333-333333333333',
  otherWorkspace: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  correlation: '44444444-4444-4444-8444-444444444444',
  artifact: '55555555-5555-4555-8555-555555555555',
  otherArtifact: '66666666-6666-4666-8666-666666666666',
};

function context(workspaceId: string, idempotencyKey: string) {
  const result = createIamTenantContextV1({
    actorId: ids.actor,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId,
    },
    authorizationEpoch: 1,
    correlationId: ids.correlation,
    idempotencyKey,
  });
  if (!result.accepted) throw new Error('fixture context invalid');
  return result.value;
}

async function seedArtifact(
  repository: InMemoryArtifactRepositoryAdapter,
  tenant: ReturnType<typeof context>,
  versionId: string,
  options: { readonly scanState?: 'PENDING' | 'CLEAN'; readonly available?: boolean } = {},
) {
  const version = createArtifactVersionV1({
    artifactId: '99999999-9999-4999-8999-999999999999',
    versionId,
    tenantScope: tenant.tenantScope,
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    byteSize: 128,
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    displayName: 'orders.xlsx',
    createdAt: '2026-08-04T00:00:00.000Z',
    status: 'ACTIVE',
    scanState: options.scanState ?? 'CLEAN',
  });
  if (!version.accepted) throw new Error(`artifact fixture rejected: ${version.code}`);
  await repository.saveVersion(tenant, version.value);
  const placement = createContentPlacementV1({
    placementId: versionId,
    artifactVersion: version.value,
    tenantScope: tenant.tenantScope,
    kind: 'LOCAL',
    opaqueReference: 'local-placement-0001',
    contentSha256: version.value.contentSha256,
    available: options.available ?? true,
  });
  if (!placement.accepted) throw new Error(`placement fixture rejected: ${placement.code}`);
  await repository.savePlacement(tenant, placement.value);
}

void test('[SA-001] run admission returns a stable job/run handle and replays idempotently', async () => {
  const repository = new InMemorySpreadsheetAuditRunRepositoryAdapter();
  const artifactRepository = new InMemoryArtifactRepositoryAdapter();
  const tenant = context(ids.workspace, 'sa-run-1');
  await seedArtifact(artifactRepository, tenant, ids.artifact);
  const service = new SpreadsheetAuditRunService(
    repository,
    artifactRepository,
    () => '77777777-7777-4777-8777-777777777777',
    () => new Date('2026-08-04T00:00:00.000Z'),
  );
  const first = await service.admit(tenant, {
    artifactVersionId: ids.artifact,
    processorVersion: 'spreadsheet-auditor-0.1.0',
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.runId, '77777777-7777-4777-8777-777777777777');
  assert.equal(first.value.jobId, '77777777-7777-4777-8777-777777777777');
  assert.equal(Object.hasOwn(first.value, 'tenantScope'), false);
  assert.equal(Object.hasOwn(first.value, 'idempotencyKey'), false);

  const replay = await service.admit(tenant, {
    artifactVersionId: ids.artifact,
    processorVersion: 'spreadsheet-auditor-0.1.0',
  });
  assert.deepEqual(replay, first);
});

void test('[SA-001] idempotency keys cannot be reused for a different input', async () => {
  const repository = new InMemorySpreadsheetAuditRunRepositoryAdapter();
  const artifactRepository = new InMemoryArtifactRepositoryAdapter();
  const tenant = context(ids.workspace, 'sa-run-conflict');
  await seedArtifact(artifactRepository, tenant, ids.artifact);
  await seedArtifact(artifactRepository, tenant, ids.otherArtifact);
  let nextId = 0;
  const service = new SpreadsheetAuditRunService(
    repository,
    artifactRepository,
    () => `77777777-7777-4777-8777-77777777777${++nextId}`,
    () => new Date('2026-08-04T00:00:00.000Z'),
  );
  assert.equal(
    (
      await service.admit(tenant, {
        artifactVersionId: ids.artifact,
        processorVersion: 'spreadsheet-auditor-0.1.0',
      })
    ).accepted,
    true,
  );
  assert.deepEqual(
    await service.admit(tenant, {
      artifactVersionId: ids.otherArtifact,
      processorVersion: 'spreadsheet-auditor-0.1.0',
    }),
    { accepted: false, code: 'SA_RUN_IDEMPOTENCY_CONFLICT' },
  );
});

void test('[SA-001] idempotency is isolated by exact workspace scope', async () => {
  const repository = new InMemorySpreadsheetAuditRunRepositoryAdapter();
  const artifactRepository = new InMemoryArtifactRepositoryAdapter();
  await seedArtifact(artifactRepository, context(ids.workspace, 'seed-workspace'), ids.artifact);
  await seedArtifact(
    artifactRepository,
    context(ids.otherWorkspace, 'seed-other-workspace'),
    ids.otherArtifact,
  );
  let nextId = 0;
  const service = new SpreadsheetAuditRunService(
    repository,
    artifactRepository,
    () => `88888888-8888-4888-8888-88888888888${++nextId}`,
    () => new Date('2026-08-04T00:00:00.000Z'),
  );
  const first = await service.admit(context(ids.workspace, 'same-key'), {
    artifactVersionId: ids.artifact,
    processorVersion: 'spreadsheet-auditor-0.1.0',
  });
  const second = await service.admit(context(ids.otherWorkspace, 'same-key'), {
    artifactVersionId: ids.otherArtifact,
    processorVersion: 'spreadsheet-auditor-0.1.0',
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (first.accepted && second.accepted) assert.notEqual(first.value.runId, second.value.runId);
});

void test('[SA-001] run admission rejects missing, foreign, unclean, and unavailable artifacts', async () => {
  const repository = new InMemorySpreadsheetAuditRunRepositoryAdapter();
  const artifactRepository = new InMemoryArtifactRepositoryAdapter();
  const tenant = context(ids.workspace, 'sa-run-artifact-gates');
  await seedArtifact(artifactRepository, tenant, ids.artifact);
  await seedArtifact(artifactRepository, tenant, ids.otherArtifact, { scanState: 'PENDING' });
  await seedArtifact(artifactRepository, tenant, '77777777-7777-4777-8777-777777777777', {
    available: false,
  });
  await seedArtifact(
    artifactRepository,
    context(ids.otherWorkspace, 'foreign-seed'),
    '88888888-8888-4888-8888-888888888888',
  );
  const service = new SpreadsheetAuditRunService(repository, artifactRepository);

  for (const artifactVersionId of [
    '99999999-9999-4999-8999-999999999999',
    '88888888-8888-4888-8888-888888888888',
    ids.otherArtifact,
    '77777777-7777-4777-8777-777777777777',
  ]) {
    assert.deepEqual(
      await service.admit(tenant, {
        artifactVersionId,
        processorVersion: 'spreadsheet-auditor-0.1.0',
      }),
      { accepted: false, code: 'SA_RUN_ARTIFACT_UNAVAILABLE' },
    );
  }
});

void test('[SA-001] idempotent replay returns the original handle after placement loss', async () => {
  const repository = new InMemorySpreadsheetAuditRunRepositoryAdapter();
  const artifactRepository = new InMemoryArtifactRepositoryAdapter();
  const tenant = context(ids.workspace, 'sa-run-replay-after-loss');
  await seedArtifact(artifactRepository, tenant, ids.artifact);
  const service = new SpreadsheetAuditRunService(repository, artifactRepository);
  const first = await service.admit(tenant, {
    artifactVersionId: ids.artifact,
    processorVersion: 'spreadsheet-auditor-0.1.0',
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const placements = await artifactRepository.listPlacements(
    tenant,
    ids.artifact as ArtifactVersionV1['versionId'],
  );
  const placement = placements[0];
  assert.ok(placement);
  if (!placement) return;
  const unavailable = updateContentPlacementAvailabilityV1(placement, false, placement.revision);
  assert.equal(unavailable.accepted, true);
  if (!unavailable.accepted) return;
  await artifactRepository.updatePlacement(tenant, unavailable.value);

  assert.deepEqual(
    await service.admit(tenant, {
      artifactVersionId: ids.artifact,
      processorVersion: 'spreadsheet-auditor-0.1.0',
    }),
    first,
  );
});
