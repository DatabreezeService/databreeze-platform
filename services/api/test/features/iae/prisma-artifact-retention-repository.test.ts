import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createArtifactDeletionRequestV1 } from '@databreeze/domain/artifact-retention/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  PrismaArtifactRetentionRepositoryAdapter,
  type ArtifactRetentionDatabaseClientV1,
  type ArtifactRetentionDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-artifact-retention-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('fixture identifier rejected');
  return parsed.value;
}

const organizationId = id('00000000-0000-4000-8000-000000000821');
const workspaceId = id('00000000-0000-4000-8000-000000000822');
const requestId = id('00000000-0000-4000-8000-000000000823');

function context() {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000824',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000825',
    idempotencyKey: 'prisma-retention',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function client(
  rows: ArtifactRetentionDatabaseRowV1[],
  options: { readonly forceRevisionConflict?: boolean } = {},
): ArtifactRetentionDatabaseClientV1 {
  return {
    artifactDeletionRequestRecord: {
      create({ data }) {
        const persisted = { ...data } as ArtifactRetentionDatabaseRowV1;
        rows.push(persisted);
        return Promise.resolve(persisted);
      },
      findUnique({ where }) {
        return Promise.resolve(rows.find((row) => row.id === where.id) ?? null);
      },
      update({ where, data }) {
        const current = rows.find((row) => row.id === where.id);
        if (!current) throw new Error('fixture retention request not found');
        const next = { ...current, ...data };
        rows[rows.indexOf(current)] = next;
        return Promise.resolve(next);
      },
      updateMany({ where, data }) {
        const current = rows.find((row) => row.id === where.id);
        if (options.forceRevisionConflict || !current || current.revision !== where.revision)
          return Promise.resolve({ count: 0 });
        const next = { ...current, ...data };
        rows[rows.indexOf(current)] = next;
        return Promise.resolve({ count: 1 });
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('[IAE-016, IAE-021, IAM-009] Prisma retention adapter preserves immutable request identity and revisions', async () => {
  const rows: ArtifactRetentionDatabaseRowV1[] = [];
  const repository = new PrismaArtifactRetentionRepositoryAdapter(client(rows));
  const tenantContext = context();
  const created = createArtifactDeletionRequestV1({
    requestId,
    artifactVersionId: '00000000-0000-4000-8000-000000000826',
    tenantScope: tenantContext.tenantScope,
    requestedBy: tenantContext.actorId,
    requestedAt: '2026-01-03T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await repository.save(tenantContext, created.value);
  await repository.save(tenantContext, created.value);
  assert.deepEqual(await repository.find(tenantContext, requestId), created.value);
  assert.equal(rows.length, 1);
});

void test('[IAE-016] Prisma retention adapter rejects a database revision race', async () => {
  const rows: ArtifactRetentionDatabaseRowV1[] = [];
  const repository = new PrismaArtifactRetentionRepositoryAdapter(
    client(rows, { forceRevisionConflict: true }),
  );
  const tenantContext = context();
  const created = createArtifactDeletionRequestV1({
    requestId,
    artifactVersionId: '00000000-0000-4000-8000-000000000826',
    tenantScope: tenantContext.tenantScope,
    requestedBy: tenantContext.actorId,
    requestedAt: '2026-01-03T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await repository.save(tenantContext, created.value);
  await assert.rejects(
    repository.save(tenantContext, {
      ...created.value,
      state: 'BLOCKED',
      blockers: ['LEGAL_HOLD'],
      revision: 2,
    }),
    /IAE_REVISION_CONFLICT/u,
  );
  assert.equal(rows[0]?.revision, 1);
});
