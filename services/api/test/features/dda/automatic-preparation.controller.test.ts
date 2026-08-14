import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { AutomaticPreparationController } from '../../../src/features/dda/etl/api/automatic-preparation.controller.js';
import type { AutomaticPreparationEnqueueService } from '../../../src/features/dda/etl/application/automatic-preparation-enqueue.service.js';

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
      idempotencyKey: 'automatic-preparation-test',
      authorizationEpoch: 1,
      mfaReenrollmentRequired: false,
    }),
};
const scopedProposal = {
  findById: () => Promise.resolve({}),
  save: (record: unknown) => Promise.resolve(record),
  update: (record: unknown) => Promise.resolve(record),
} as never;

void test('[DDA-053] automatic preparation controller returns enqueued summary without percentage-correct', async () => {
  const controller = new AutomaticPreparationController(
    {
      evaluateAndMaybeEnqueue: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            kind: 'ENQUEUED' as const,
            classification: { decision: 'AUTO_ACCEPT_SAFE' as const, reasonCodes: [] },
            acceptance: {
              proposalId: '00000000-0000-4000-8000-000000000201',
              jobId: '00000000-0000-4000-8000-000000000304',
              artifactVersionId: '00000000-0000-4000-8000-000000000302',
              datasetVersionId: '00000000-0000-4000-8000-000000000303',
              rowCount: 10,
              contentHash: 'a'.repeat(64),
              schemaHash: 'b'.repeat(64),
              lineageIds: ['00000000-0000-4000-8000-000000000012'],
              replayed: false,
            },
            summary: {
              summaryId: '00000000-0000-4000-8000-000000000501',
              datasetVersionId: '00000000-0000-4000-8000-000000000303',
              automaticPolicy: 'SAFE_NON_LOSSY' as const,
              counts: {
                input: 10,
                output: 10,
                unchanged: 8,
                changed: 2,
                rejected: 0,
                quarantined: 0,
                unsupported: 0,
              },
              transformations: ['TRIM_TEXT'],
              warnings: [],
              exclusions: [],
              healthDimensions: [],
            },
          },
        }),
    } as unknown as AutomaticPreparationEnqueueService,
    requestContext,
    scopedProposal,
  );

  const response = await controller.evaluate(request, {
    proposalId: '00000000-0000-4000-8000-000000000201',
    idempotencyKey: 'prep-1',
    expectedRevision: 1,
  });

  assert.equal(response.accepted, true);
  assert.equal(response.kind, 'ENQUEUED');
  assert.equal(response.summary?.automaticPolicy, 'SAFE_NON_LOSSY');
  assert.equal(JSON.stringify(response).includes('percentageCorrect'), false);
});

void test('[DDA-053] automatic preparation controller maps acceptance failures', async () => {
  const controller = new AutomaticPreparationController(
    {
      evaluateAndMaybeEnqueue: () =>
        Promise.resolve({ accepted: false as const, code: 'DDA_ETL_HASH_MISMATCH' as const }),
    } as unknown as AutomaticPreparationEnqueueService,
    requestContext,
    scopedProposal,
  );

  await assert.rejects(
    controller.evaluate(request, {
      proposalId: '00000000-0000-4000-8000-000000000201',
      idempotencyKey: 'prep-2',
      expectedRevision: 1,
    }),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 422,
  );
});
