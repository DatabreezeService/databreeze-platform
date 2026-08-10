import assert from 'node:assert/strict';
import test from 'node:test';

import { EtlAcceptanceController } from '../../../src/features/dda/etl/api/etl-acceptance.controller.js';
import { EtlAcceptanceProblemError } from '../../../src/features/dda/etl/application/etl-acceptance-problem.error.js';
import type { EtlAcceptanceServiceV1 } from '../../../src/features/dda/etl/application/etl-acceptance.service.js';

void test('[DDA-007] acceptance controller returns version IDs without source values', async () => {
  const controller = new EtlAcceptanceController({
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
  } as unknown as EtlAcceptanceServiceV1);

  const response = await controller.accept({
    tenantScope: {
      scopeType: 'project',
      organizationId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      projectId: '00000000-0000-4000-8000-000000000003',
    },
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
  const controller = new EtlAcceptanceController({
    accept: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_HASH_MISMATCH' as const }),
  } as unknown as EtlAcceptanceServiceV1);
  await assert.rejects(
    controller.accept({
      tenantScope: {
        scopeType: 'project',
        organizationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: '00000000-0000-4000-8000-000000000002',
        projectId: '00000000-0000-4000-8000-000000000003',
      },
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
      error instanceof EtlAcceptanceProblemError && error.code === 'DDA_ETL_HASH_MISMATCH',
  );
});
