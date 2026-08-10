import assert from 'node:assert/strict';
import test from 'node:test';

import { EtlProposalController } from '../../../src/features/dda/etl/api/etl-proposal.controller.js';
import { EtlProposalProblemError } from '../../../src/features/dda/etl/application/etl-proposal-problem.error.js';
import type { EtlProposalServiceV1 } from '../../../src/features/dda/etl/application/etl-proposal.service.js';

void test('[DDA-006] proposal controller returns review summary without inventing payloads', () => {
  const controller = new EtlProposalController({
    propose: () =>
      Promise.resolve({
        accepted: true as const,
        value: {
          proposalId: '00000000-0000-4000-8000-000000000201',
          revision: 1,
          state: 'READY_FOR_ACCEPTANCE' as const,
          blockingReasons: [],
          plan: { transformations: [{ kind: 'TRIM_TEXT' }] },
          review: {
            sourceSchema: ['name'],
            inferredSchema: ['name'],
            targetSchema: ['name'],
            assumptions: ['trim'],
            beforeSample: [],
            afterSample: [],
            counts: { changed: 1, unchanged: 0, rejected: 0 },
            exclusions: [],
            unsupportedScopes: [],
            sampling: { disclosed: true, method: 'HEAD' as const, seed: 0, rowCount: 1 },
            qualityEffects: [],
            evidenceStatus: 'AVAILABLE' as const,
            estimatedCost: { cpuMs: 5, memoryMb: 8 },
            aiSuggestions: [],
          },
          createdAt: '2026-08-10T10:00:00.000Z',
        },
      }),
    getProposal: () =>
      Promise.resolve({
        accepted: true as const,
        value: {
          proposalId: '00000000-0000-4000-8000-000000000201',
          revision: 1,
          state: 'READY_FOR_ACCEPTANCE' as const,
          blockingReasons: [],
          plan: { transformations: [{ kind: 'TRIM_TEXT' }] },
          review: {
            sourceSchema: ['name'],
            inferredSchema: ['name'],
            targetSchema: ['name'],
            assumptions: ['trim'],
            beforeSample: [{ name: ' A ' }],
            afterSample: [{ name: 'A' }],
            counts: { changed: 1, unchanged: 0, rejected: 0 },
            exclusions: [],
            unsupportedScopes: [],
            sampling: { disclosed: true, method: 'HEAD' as const, seed: 0, rowCount: 1 },
            qualityEffects: [],
            evidenceStatus: 'AVAILABLE' as const,
            estimatedCost: { cpuMs: 5, memoryMb: 8 },
            aiSuggestions: [],
          },
          createdAt: '2026-08-10T10:00:00.000Z',
        },
      }),
  } as unknown as EtlProposalServiceV1);

  const created = await controller.propose({
    planInput: { engineBindingId: 'x' },
    reviewContext: {},
  });
  assert.equal(created.accepted, true);
  assert.equal(created.state, 'READY_FOR_ACCEPTANCE');

  const loaded = await controller.get('00000000-0000-4000-8000-000000000201');
  assert.deepEqual(loaded.sourceSchema, ['name']);
  assert.deepEqual(loaded.orderedSteps, [{ kind: 'TRIM_TEXT' }]);
});

void test('[DDA-005] proposal controller maps arbitrary code to Problem', () => {
  const controller = new EtlProposalController({
    propose: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_ARBITRARY_CODE' as const }),
    getProposal: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_NOT_FOUND' as const }),
  } as unknown as EtlProposalServiceV1);
  await assert.rejects(
    controller.propose({ planInput: {}, reviewContext: {} }),
    (error: unknown) =>
      error instanceof EtlProposalProblemError && error.code === 'DDA_ETL_ARBITRARY_CODE',
  );
});
