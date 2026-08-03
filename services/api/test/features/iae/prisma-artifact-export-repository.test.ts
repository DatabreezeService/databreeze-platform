import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactExportManifestV1 } from '@databreeze/domain/artifact-export/v1';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

import {
  PrismaArtifactExportRepositoryAdapter,
  type ArtifactExportDatabaseClientV1,
  type ArtifactExportDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-artifact-export-repository.adapter.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const scopeResult = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId,
  workspaceId,
});
if (!scopeResult.accepted) throw new Error('fixture scope invalid');
const scope = scopeResult.value;
const contextResult = createIamTenantContextV1({
  actorId: '55555555-5555-4555-8555-555555555555',
  tenantScope: scope,
  authorizationEpoch: 1,
  correlationId: '66666666-6666-4666-8666-666666666666',
  idempotencyKey: 'prisma-export',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;
const manifest = createArtifactExportManifestV1({
  manifestId: '33333333-3333-4333-8333-333333333333',
  tenantScope: scope,
  entries: [
    {
      versionId: '44444444-4444-4444-8444-444444444444',
      contentSha256: 'a'.repeat(64),
      byteSize: 32,
      evidenceIds: [],
      processorVersions: ['spreadsheet-auditor@1'],
    },
  ],
  approvalState: 'PENDING',
  createdAt: '2026-08-02T00:00:00.000Z',
  canonicalHash: 'b'.repeat(64),
});
if (!manifest.accepted) throw new Error('fixture manifest invalid');

void test('IAE-018 Prisma export adapter preserves immutable manifests and scopes reads', async () => {
  const rows = new Map<string, ArtifactExportDatabaseRowV1>();
  const client: ArtifactExportDatabaseClientV1 = {
    artifactExportManifestRecord: {
      create({ data }) {
        const row = { ...data };
        if (rows.has(row.id)) {
          throw Object.assign(new Error('fixture unique constraint violation'), { code: 'P2002' });
        }
        rows.set(row.id, row);
        return Promise.resolve(row);
      },
      findUnique({ where }) {
        return Promise.resolve(rows.get(where.id) ?? null);
      },
    },
    $transaction(work) {
      return work(client);
    },
  };
  const repository = new PrismaArtifactExportRepositoryAdapter(client);
  await repository.save(context, manifest.value);
  await repository.save(context, manifest.value);
  assert.deepEqual(await repository.find(context, manifest.value.manifestId), manifest.value);
  assert.equal(rows.size, 1);
});
