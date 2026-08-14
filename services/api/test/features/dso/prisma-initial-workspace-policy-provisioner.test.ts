/* eslint-disable @typescript-eslint/require-await -- Prisma delegate doubles mirror async APIs. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PrismaInitialWorkspacePolicyProvisionerAdapter,
  type InitialWorkspacePolicyDatabaseClientV1,
} from '../../../src/features/dso/adapter/prisma-initial-workspace-policy-provisioner.adapter.js';

const organizationId = '00000000-0000-4000-8000-000000000002' as never;
const workspaceId = '00000000-0000-4000-8000-000000000003' as never;
const publishedAt = '2026-08-14T09:00:00.000Z' as never;

function database() {
  const versions = new Map<string, Record<string, unknown>>();
  const pointers = new Map<string, Record<string, unknown>>();
  const client = {
    deviceDataModePolicyRecord: {
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        [...versions.values()].filter(
          (row) =>
            row['organizationId'] === where['organizationId'] &&
            row['workspaceId'] === where['workspaceId'],
        ),
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        versions.get(where.id) ?? null,
      create: async ({ data }: { readonly data: Readonly<Record<string, unknown>> }) => {
        versions.set(data['id'] as string, { ...data });
        return data;
      },
    },
    workspaceDataModePolicyRecord: {
      findFirst: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) =>
        [...pointers.values()].find(
          (row) =>
            row['organizationId'] === where['organizationId'] &&
            row['workspaceId'] === where['workspaceId'],
        ) ?? null,
      create: async ({ data }: { readonly data: Readonly<Record<string, unknown>> }) => {
        pointers.set(`${String(data['organizationId'])}:${String(data['workspaceId'])}`, {
          ...data,
        });
        return data;
      },
    },
  } as unknown as InitialWorkspacePolicyDatabaseClientV1;
  return { client, versions, pointers };
}

void test('[IAM-022, DSO-008, DSO-027] provisions one server-owned HYBRID revision and exact current pointer', async () => {
  const state = database();
  const ids = ['00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011'];
  const adapter = new PrismaInitialWorkspacePolicyProvisionerAdapter(state.client, {
    next: () => ids.shift() ?? 'unexpected',
  });

  const binding = await adapter.provision({ organizationId, workspaceId, publishedAt });

  assert.deepEqual(binding, {
    policyId: '00000000-0000-4000-8000-000000000010',
    policyVersionId: '00000000-0000-4000-8000-000000000011',
    dataModeProjection: 'HYBRID',
  });
  assert.equal(state.versions.size, 1);
  assert.equal(state.pointers.size, 1);
  const version = [...state.versions.values()][0];
  assert.equal(version?.['revision'], 1);
  assert.equal(version?.['mode'], 'HYBRID');
  assert.deepEqual(version?.['allowedPayloadClasses'], {
    PUBLIC: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
    INTERNAL: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT', 'ORIGINAL_CONTENT'],
    CONFIDENTIAL: ['CONTROL_METADATA'],
    RESTRICTED: ['CONTROL_METADATA'],
  });
  assert.match(String(version?.['canonicalHash']), /^[a-f0-9]{64}$/u);
});

void test('[IAM-022, DSO-008] exact replay returns the immutable binding without another write', async () => {
  const state = database();
  const ids = ['00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011'];
  const adapter = new PrismaInitialWorkspacePolicyProvisionerAdapter(state.client, {
    next: () => ids.shift() ?? 'unexpected',
  });
  const first = await adapter.provision({ organizationId, workspaceId, publishedAt });
  const replay = await adapter.provision({ organizationId, workspaceId, publishedAt });
  assert.deepEqual(replay, first);
  assert.equal(state.versions.size, 1);
  assert.equal(state.pointers.size, 1);
});

void test('[IAM-019, DSO-027] partial or mismatched current policy state fails closed', async () => {
  const state = database();
  state.versions.set('00000000-0000-4000-8000-000000000011', {
    id: '00000000-0000-4000-8000-000000000011',
    policyId: '00000000-0000-4000-8000-000000000010',
    organizationId,
    workspaceId,
    revision: 1,
    mode: 'HYBRID',
  });
  const adapter = new PrismaInitialWorkspacePolicyProvisionerAdapter(state.client);
  await assert.rejects(
    adapter.provision({ organizationId, workspaceId, publishedAt }),
    /DSO_INITIAL_WORKSPACE_POLICY_CONFLICT/u,
  );
});
