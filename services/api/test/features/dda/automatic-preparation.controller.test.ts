import assert from 'node:assert/strict';
import test from 'node:test';

import { AutomaticPreparationController } from '../../../src/features/dda/etl/api/automatic-preparation.controller.js';
import { AutomaticPreparationProblemError } from '../../../src/features/dda/etl/application/automatic-preparation-problem.error.js';
import type { AutomaticPreparationEnqueueService } from '../../../src/features/dda/etl/application/automatic-preparation-enqueue.service.js';

void test('[DDA-053] automatic preparation controller returns enqueued summary without percentage-correct', async () => {
  const controller = new AutomaticPreparationController({
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
  } as unknown as AutomaticPreparationEnqueueService);

  const response = await controller.evaluate({
    tenantScope: {
      organizationId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
    },
    proposalId: '00000000-0000-4000-8000-000000000201',
    profile: {
      policy: 'SAFE_NON_LOSSY',
      omittedRows: 0,
      ambiguousMappings: 0,
      incompatibleTypes: 0,
      unaccountedRejects: 0,
      sourceOverlap: false,
      changedDuplicateKey: false,
      currencyInference: false,
      timezoneInference: false,
      externalEnrichment: false,
      blockedQualityDimensions: [],
      sampledOnly: false,
      sourceDrift: false,
      accounting: {
        input: 10,
        output: 10,
        unchanged: 8,
        changed: 2,
        rejected: 0,
        quarantined: 0,
        unsupported: 0,
      },
    },
    idempotencyKey: 'prep-1',
    correlationId: '00000000-0000-4000-8000-000000000501',
    expected: {
      rowCount: 10,
      rejectedCount: 0,
      contentHash: 'a'.repeat(64),
      schemaHash: 'b'.repeat(64),
      lineageIds: ['00000000-0000-4000-8000-000000000012'],
    },
  } as unknown as Parameters<AutomaticPreparationController['evaluate']>[0]);

  assert.equal(response.accepted, true);
  assert.equal(response.kind, 'ENQUEUED');
  assert.equal(response.summary?.automaticPolicy, 'SAFE_NON_LOSSY');
  assert.equal(JSON.stringify(response).includes('percentageCorrect'), false);
});

void test('[DDA-053] automatic preparation controller maps acceptance failures', async () => {
  const controller = new AutomaticPreparationController({
    evaluateAndMaybeEnqueue: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_HASH_MISMATCH' as const }),
  } as unknown as AutomaticPreparationEnqueueService);

  await assert.rejects(
    controller.evaluate({
      tenantScope: {
        organizationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: '00000000-0000-4000-8000-000000000002',
      },
      proposalId: '00000000-0000-4000-8000-000000000201',
      profile: {
        policy: 'SAFE_NON_LOSSY',
        omittedRows: 0,
        ambiguousMappings: 0,
        incompatibleTypes: 0,
        unaccountedRejects: 0,
        sourceOverlap: false,
        changedDuplicateKey: false,
        currencyInference: false,
        timezoneInference: false,
        externalEnrichment: false,
        blockedQualityDimensions: [],
        sampledOnly: false,
        sourceDrift: false,
        accounting: {
          input: 1,
          output: 1,
          unchanged: 1,
          changed: 0,
          rejected: 0,
          quarantined: 0,
          unsupported: 0,
        },
      },
      idempotencyKey: 'prep-2',
      correlationId: '00000000-0000-4000-8000-000000000502',
      expected: {
        rowCount: 1,
        rejectedCount: 0,
        contentHash: 'a'.repeat(64),
        schemaHash: 'b'.repeat(64),
        lineageIds: ['00000000-0000-4000-8000-000000000012'],
      },
    } as unknown as Parameters<AutomaticPreparationController['evaluate']>[0]),
    (error: unknown) =>
      error instanceof AutomaticPreparationProblemError && error.code === 'DDA_ETL_HASH_MISMATCH',
  );
});
