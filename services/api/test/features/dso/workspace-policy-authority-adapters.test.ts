import assert from 'node:assert/strict';
import test from 'node:test';

/* eslint-disable @typescript-eslint/require-await -- deterministic Prisma-shaped adapter doubles. */

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaDataModePolicyVersionLookupAdapter,
  PrismaWorkspaceDataModePolicyAuthorityAdapter,
} from '../../../src/features/dso/adapter/prisma-workspace-data-mode-policy-authority.adapter.js';
import { PrismaWorkspaceExecutionPolicyReferenceAuthorityAdapter } from '../../../src/features/iam/adapter/prisma-workspace-execution-policy-reference.adapter.js';

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid fixture id');
  return parsed.value;
}

const ids = {
  organization: id('00000000-0000-4000-8000-000000000201'),
  workspace: id('00000000-0000-4000-8000-000000000202'),
  policy: id('00000000-0000-4000-8000-000000000203'),
  version: id('00000000-0000-4000-8000-000000000204'),
};

void test('[DSO-026/027][IAM-019] durable reads include exact full tenant ancestry', async () => {
  const queries: unknown[] = [];
  const database = {
    workspaceDataModePolicyRecord: {
      findFirst: async (input: unknown) => {
        queries.push(input);
        return {
          id: ids.policy,
          organizationId: ids.organization,
          workspaceId: ids.workspace,
          currentVersionId: ids.version,
          currentVersionHash: 'a'.repeat(64),
          revision: 4,
        };
      },
    },
    deviceDataModePolicyRecord: {
      findFirst: async (input: unknown) => {
        queries.push(input);
        return {
          id: ids.version,
          policyId: ids.policy,
          organizationId: ids.organization,
          workspaceId: ids.workspace,
          revision: 4,
          mode: 'LOCAL',
          allowedPayloadClasses: {
            PUBLIC: ['CONTROL_METADATA'],
            INTERNAL: ['CONTROL_METADATA'],
            CONFIDENTIAL: ['CONTROL_METADATA'],
            RESTRICTED: ['CONTROL_METADATA'],
          },
          allowedPlacementKinds: ['LOCAL'],
          allowedExecutorClasses: ['DESKTOP'],
          allowedDestinationClasses: ['DESKTOP'],
          canonicalHash: 'a'.repeat(64),
          publishedAt: new Date('2026-08-13T00:00:00.000Z'),
        };
      },
    },
    workspaceIdentity: {
      findFirst: async (input: unknown) => {
        queries.push(input);
        return {
          id: ids.workspace,
          organizationId: ids.organization,
          dataModePolicyId: ids.policy,
          currentDataModePolicyVersionId: ids.version,
          dataModeProjection: 'LOCAL',
          authorizationEpoch: 9,
        };
      },
    },
  };

  const current = await new PrismaWorkspaceDataModePolicyAuthorityAdapter(
    database as never,
  ).resolveCurrent({ organizationId: ids.organization, workspaceId: ids.workspace });
  const version = await new PrismaDataModePolicyVersionLookupAdapter(database as never).findExact({
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    policyId: ids.policy,
    policyVersionId: ids.version,
  });
  const reference = await new PrismaWorkspaceExecutionPolicyReferenceAuthorityAdapter(
    database as never,
  ).resolveExact({ organizationId: ids.organization, workspaceId: ids.workspace });

  assert.equal(current?.currentPolicyVersionId, ids.version);
  assert.equal(version?.policyVersionId, ids.version);
  assert.equal(reference?.authorizationEpoch, 9);
  assert.deepEqual(queries, [
    { where: { organizationId: ids.organization, workspaceId: ids.workspace } },
    {
      where: {
        id: ids.version,
        policyId: ids.policy,
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      },
    },
    { where: { id: ids.workspace, organizationId: ids.organization } },
  ]);
});

void test('[DSO-026][IAM-003/019] malformed and cross-scope rows fail closed', async () => {
  const malformed = {
    workspaceDataModePolicyRecord: {
      findFirst: async () => ({
        id: ids.policy,
        organizationId: ids.organization,
        workspaceId: id('00000000-0000-4000-8000-000000000299'),
        currentVersionId: ids.version,
        currentVersionHash: 'bad',
        revision: 0,
      }),
    },
    workspaceIdentity: {
      findFirst: async () => ({
        id: ids.workspace,
        organizationId: ids.organization,
        dataModePolicyId: ids.policy,
        currentDataModePolicyVersionId: ids.version,
        dataModeProjection: 'INVALID',
        authorizationEpoch: 0,
      }),
    },
  };

  assert.equal(
    await new PrismaWorkspaceDataModePolicyAuthorityAdapter(malformed as never).resolveCurrent({
      organizationId: ids.organization,
      workspaceId: ids.workspace,
    }),
    undefined,
  );
  assert.equal(
    await new PrismaWorkspaceExecutionPolicyReferenceAuthorityAdapter(
      malformed as never,
    ).resolveExact({ organizationId: ids.organization, workspaceId: ids.workspace }),
    undefined,
  );
});
