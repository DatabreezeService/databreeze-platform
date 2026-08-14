import assert from 'node:assert/strict';
import test from 'node:test';

import { createDataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';

import { PrismaLocalWebIntakeAdapter } from '../../../src/features/iae/adapter/local-web-intake.adapter.js';

const scope = Object.freeze({
  scopeType: 'workspace' as const,
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
});
const context = Object.freeze({
  tenantScope: scope,
  actorId: '00000000-0000-4000-8000-000000000003',
  authorizationEpoch: 1,
});

function createDatabase() {
  const rows = {
    versions: new Map<string, any>(),
    placements: new Map<string, any>(),
    inbox: new Map<string, any>(),
  };
  const database: any = {
    artifactVersion: {
      create: async ({ data }: any) => {
        rows.versions.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: any) => rows.versions.get(where.id) ?? null,
    },
    contentPlacement: {
      create: async ({ data }: any) => {
        rows.placements.set(data.id, data);
        return data;
      },
    },
    inboxItem: {
      create: async ({ data }: any) => {
        rows.inbox.set(data.id, data);
        return data;
      },
      findFirst: async ({ where }: any) =>
        [...rows.inbox.values()].find(
          (row: any) =>
            row.organizationId === where.organizationId &&
            row.workspaceId === where.workspaceId &&
            row.projectId === where.projectId &&
            row.idempotencyKey === where.idempotencyKey,
        ) ?? null,
    },
    $transaction: async (work: any) => work(database),
  };
  return { database, rows };
}

test('PrismaLocalWebIntakeAdapter creates one scoped artifact, placement, and inbox item and replays exact idempotency', async () => {
  const { database, rows } = createDatabase();
  const stored: Array<{ key: string; bytes: Uint8Array }> = [];
  const adapter = new PrismaLocalWebIntakeAdapter({
    database,
    authorization: {
      authorize: async () => ({ accepted: true as const, value: true as const }),
    },
    policies: {
      resolveCurrentWorkspacePolicy: async () => {
        const policy = createDataModePolicyVersionV1({
          policyId: '00000000-0000-4000-8000-000000000005',
          policyVersionId: '00000000-0000-4000-8000-000000000004',
          organizationId: scope.organizationId,
          workspaceId: scope.workspaceId,
          revision: 1,
          mode: 'HYBRID',
          allowedPayloadClasses: {
            PUBLIC: ['ORIGINAL_CONTENT'],
            INTERNAL: ['ORIGINAL_CONTENT'],
            CONFIDENTIAL: ['ORIGINAL_CONTENT'],
            RESTRICTED: [],
          },
          allowedPlacementKinds: ['CLOUD_OBJECT'],
          allowedExecutorClasses: [],
          allowedDestinationClasses: [],
          canonicalHash: 'c45c468fcc5fd9e88882b8d475de902f5572df186c88aa0450928881c32d5a67',
          publishedAt: '2026-08-14T00:00:00.000Z',
        });
        assert.equal(policy.accepted, true);
        if (!policy.accepted) throw new Error('test policy invalid');
        return { policy: policy.value, authorizationEpoch: 1 };
      },
    },
    objectStore: {
      put: async (input) => {
        stored.push({ key: input.objectKey, bytes: input.bytes });
      },
      delete: async () => undefined,
    },
    ids: (() => {
      let next = 10;
      return { next: () => `00000000-0000-4000-8000-0000000000${next++}` };
    })(),
    clock: () => new Date('2026-08-14T00:00:00.000Z'),
  });
  const bytes = new TextEncoder().encode('region,total\nNorth,12\n');
  const input = {
    tenantScope: scope,
    fileName: 'sales.csv',
    mediaType: 'text/csv',
    expectedSha256: '6fd4bd4ea83231efff3181fe2c70d433bcd481aa88c8d486c509bcb5bb2609b2',
    bytes,
    idempotencyKey: 'local-upload-1',
  } as any;
  const fullContext = {
    ...context,
    correlationId: '00000000-0000-4000-8000-000000000006',
    idempotencyKey: 'local-upload-1',
    mfaReenrollmentRequired: false,
  } as any;
  const first = await adapter.upload(fullContext, input);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const replay = await adapter.upload(fullContext, input);
  assert.deepEqual(replay, { accepted: true, value: { ...first.value, replayed: true } });
  assert.equal(rows.versions.size, 1);
  assert.equal(rows.placements.size, 1);
  assert.equal(rows.inbox.size, 1);
  assert.equal(stored.length, 1);
});
