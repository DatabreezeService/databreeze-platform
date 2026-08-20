import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createJobV1, createTypedActionDefinitionV1 } from '@databreeze/domain/jobs/v1';
import { createIamTenantContextV1 } from '../../../src/platform/iam-tenant-context.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { InMemoryJobHistoryReadAdapter } from '../../../src/features/jra/adapter/in-memory-job-history-read.adapter.js';
import { JobHistoryController } from '../../../src/features/jra/api/job-history.controller.js';
import type { IamRepositoryPortV1 } from '../../../src/features/iam/application/iam-repository.port.js';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('test identifier');
  return parsed.value;
}

function accepted<T>(
  result:
    | { readonly accepted: true; readonly value: T }
    | { readonly accepted: false; readonly code: unknown },
): T {
  if (!result.accepted) throw new Error('test result rejected');
  return result.value;
}

const organizationId = stable('00000000-0000-4000-8000-000000000901');
const workspaceId = stable('00000000-0000-4000-8000-000000000902');
const actorId = stable('00000000-0000-4000-8000-000000000903');
const jobId = stable('00000000-0000-4000-8000-000000000904');
const scope = { scopeType: 'workspace' as const, organizationId, workspaceId };
const context = accepted(
  createIamTenantContextV1({
    tenantScope: scope,
    actorId,
    correlationId: stable('00000000-0000-4000-8000-000000000905'),
    idempotencyKey: 'history-test',
    authorizationEpoch: 1,
    mfaReenrollmentRequired: false,
  }),
);
const action = accepted(
  createTypedActionDefinitionV1({
    actionType: 'analysis.execute',
    version: 1,
    inputSchemaId: 'analysis.input.v1',
    outputSchemaId: 'analysis.output.v1',
    handlerDigest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    requiredCapabilities: [],
    sideEffectClass: 'NONE',
    riskClass: 'READ_ONLY',
    defaultTimeoutSeconds: 60,
    maxAttempts: 1,
    approvalClass: 'NONE',
  }),
);
const job = accepted(
  createJobV1({
    jobId,
    tenantScope: scope,
    requestedBy: actorId,
    action,
    inputManifestHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    idempotencyKey: 'job-history',
    createdAt: '2026-08-13T01:00:00.000Z',
  }),
);

function controller(roleId = 'owner') {
  const iam: IamRepositoryPortV1 = {
    findMembership: async () => ({
      id: actorId,
      principalId: actorId,
      scope,
      roleId,
      status: 'ACTIVE' as const,
      revision: 1,
    }),
    listMemberships: async () => [],
    saveMembership: async () => undefined,
    withTransaction: async (_context, work) =>
      work({
        findMembership: async () => undefined,
        listMemberships: async () => [],
        saveMembership: async () => undefined,
      }),
  };
  return new JobHistoryController(
    new InMemoryJobHistoryReadAdapter([job]),
    { resolve: async () => context },
    iam,
  );
}

void test('[JRA-012] job history returns a closed, metadata-only page', async () => {
  const value = await controller().list({ query: {} });
  assert.equal(value.accepted, true);
  assert.equal(value.items[0]?.jobId, jobId);
  assert.equal('inputManifestHash' in (value.items[0] as object), false);
});

void test('[JRA-012] job history rejects unknown client query fields', async () => {
  await assert.rejects(
    () => controller().list({ query: { tenantScope: 'client-authority' } }),
    BadRequestException,
  );
});

void test('[JRA-012] job history is permission-gated', async () => {
  await assert.rejects(() => controller('unknown-role').list({ query: {} }), ForbiddenException);
});

void test('[JRA-012] missing job is non-enumerating after authorization', async () => {
  await assert.rejects(
    () => controller().get({}, '00000000-0000-4000-8000-000000000999'),
    NotFoundException,
  );
});
