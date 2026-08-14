import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { EtlAcceptanceController } from '../../../src/features/dda/etl/api/etl-acceptance.controller.js';
import type { EtlAcceptanceServiceV1 } from '../../../src/features/dda/etl/application/etl-acceptance.service.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);
const request = { headers: { authorization: 'Bearer verified-request' } };
const requestContext = {
  resolve: () =>
    Promise.resolve({
      tenantScope,
      actorId: '00000000-0000-4000-8000-000000000004' as never,
      correlationId: '00000000-0000-4000-8000-000000000005' as never,
      idempotencyKey: 'etl-acceptance-test',
      authorizationEpoch: 1,
      mfaReenrollmentRequired: false,
    }),
};
const scopedProposal = {
  findById: () => Promise.resolve({}),
  save: (record: unknown) => Promise.resolve(record),
  update: (record: unknown) => Promise.resolve(record),
} as never;

void test('[DDA-007] acceptance controller returns version IDs without source values', async () => {
  const controller = new EtlAcceptanceController(
    {
      accept: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            proposalId: '00000000-0000-4000-8000-000000000201',
            jobId: '00000000-0000-4000-8000-000000000304',
            artifactVersionId: '00000000-0000-4000-8000-000000000302',
            datasetVersionId: '00000000-0000-4000-8000-000000000303',
            rowCount: 4,
            contentHash: 'a'.repeat(64),
            schemaHash: 'b'.repeat(64),
            lineageIds: ['00000000-0000-4000-8000-000000000012'],
            replayed: false,
          },
        }),
    } as unknown as EtlAcceptanceServiceV1,
    requestContext,
    scopedProposal,
  );

  const response = await controller.accept(request, {
    proposalId: '00000000-0000-4000-8000-000000000201',
    expectedRevision: 1,
    idempotencyKey: 'k1',
    correlationId: '00000000-0000-4000-8000-000000000401',
    expected: {
      rowCount: 4,
      rejectedCount: 1,
      contentHash: 'a'.repeat(64),
      schemaHash: 'b'.repeat(64),
      lineageIds: ['00000000-0000-4000-8000-000000000012'],
    },
  });
  assert.equal(response.accepted, true);
  assert.equal(response.datasetVersionId, '00000000-0000-4000-8000-000000000303');
  assert.doesNotMatch(JSON.stringify(response), /Cafe|sourcePath|rawBytes/u);
});

void test('[DDA-007] acceptance controller maps failures to Problem codes', async () => {
  const controller = new EtlAcceptanceController(
    {
      accept: () =>
        Promise.resolve({ accepted: false as const, code: 'DDA_ETL_HASH_MISMATCH' as const }),
    } as unknown as EtlAcceptanceServiceV1,
    requestContext,
    scopedProposal,
  );
  await assert.rejects(
    controller.accept(request, {
      proposalId: '00000000-0000-4000-8000-000000000201',
      expectedRevision: 1,
      idempotencyKey: 'k2',
      correlationId: '00000000-0000-4000-8000-000000000401',
      expected: {
        rowCount: 4,
        rejectedCount: 1,
        contentHash: 'a'.repeat(64),
        schemaHash: 'b'.repeat(64),
        lineageIds: ['00000000-0000-4000-8000-000000000012'],
      },
    }),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 422,
  );
});

void test('[IAM-019] acceptance controller maps authority and command failures to safe HTTP statuses', async () => {
  const body = {
    proposalId: '00000000-0000-4000-8000-000000000201',
    expectedRevision: 1,
    idempotencyKey: 'authority-status-key',
    correlationId: '00000000-0000-4000-8000-000000000401',
    expected: {
      rowCount: 4,
      rejectedCount: 1,
      contentHash: 'a'.repeat(64),
      schemaHash: 'b'.repeat(64),
      lineageIds: ['00000000-0000-4000-8000-000000000012'],
    },
  };
  for (const [code, status] of [
    ['DDA_ETL_AUTHORIZATION_DENIED', 403],
    ['DDA_ETL_COMMAND_CONFLICT', 409],
    ['DDA_ETL_AUTHORIZATION_UNAVAILABLE', 503],
  ] as const) {
    const controller = new EtlAcceptanceController(
      {
        accept: () => Promise.resolve({ accepted: false as const, code }),
      } as unknown as EtlAcceptanceServiceV1,
      requestContext,
      scopedProposal,
    );
    await assert.rejects(
      controller.accept(request, body),
      (error: unknown) =>
        error instanceof Error &&
        'getStatus' in error &&
        (error as { getStatus(): number }).getStatus() === status,
    );
  }
});
