import assert from 'node:assert/strict';
import test from 'node:test';

import { EtlProposalController } from '../../../src/features/dda/etl/api/etl-proposal.controller.js';
import { EtlProposalProblemError } from '../../../src/features/dda/etl/application/etl-proposal-problem.error.js';
import type { EtlProposalServiceV1 } from '../../../src/features/dda/etl/application/etl-proposal.service.js';

void test('[DDA-006] proposal controller returns review summary without inventing payloads', async () => {
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

void test('[DDA-005] proposal controller maps arbitrary code to Problem', async () => {
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

void test('[DDA-007] proposal GET returns acceptanceEvidence from real plan hashes and lineage', async () => {
  const contentHash = 'a'.repeat(64);
  const schemaHash = 'b'.repeat(64);
  const inputArtifactVersionId = '00000000-0000-4000-8000-000000000012';
  const lookupParentId = '00000000-0000-4000-8000-000000000099';
  const controller = new EtlProposalController({
    propose: () => Promise.reject(new Error('unused')),
    getProposal: () =>
      Promise.resolve({
        accepted: true as const,
        value: {
          proposalId: '00000000-0000-4000-8000-000000000201',
          revision: 2,
          state: 'READY_FOR_ACCEPTANCE' as const,
          blockingReasons: [],
          plan: {
            inputArtifactVersionId,
            contentHash,
            schemaHash,
            transformations: [
              {
                stepId: '00000000-0000-4000-8000-000000000017',
                kind: 'TRIM_TEXT',
                inputs: [inputArtifactVersionId],
              },
              {
                stepId: '00000000-0000-4000-8000-000000000018',
                kind: 'LOOKUP_JOIN',
                inputs: [inputArtifactVersionId, lookupParentId],
              },
            ],
          },
          review: {
            sourceSchema: ['name'],
            inferredSchema: ['name'],
            targetSchema: ['name'],
            assumptions: ['trim'],
            beforeSample: [],
            afterSample: [],
            counts: { changed: 3, unchanged: 1, rejected: 1 },
            exclusions: [],
            unsupportedScopes: [],
            sampling: { disclosed: true, method: 'HEAD' as const, seed: 0, rowCount: 5 },
            qualityEffects: [],
            evidenceStatus: 'AVAILABLE' as const,
            estimatedCost: { cpuMs: 5, memoryMb: 8 },
            aiSuggestions: [],
          },
          createdAt: '2026-08-10T10:00:00.000Z',
        },
      }),
  } as unknown as EtlProposalServiceV1);

  const loaded = await controller.get('00000000-0000-4000-8000-000000000201');
  assert.deepEqual(loaded.acceptanceEvidence, {
    revision: 2,
    rowCount: 4,
    rejectedCount: 1,
    contentHash,
    schemaHash,
    lineageIds: [inputArtifactVersionId, lookupParentId],
  });
});

void test('[DDA-007] proposal GET omits acceptanceEvidence without plan hashes or ready state', async () => {
  const contentHash = 'a'.repeat(64);
  const schemaHash = 'b'.repeat(64);
  const inputArtifactVersionId = '00000000-0000-4000-8000-000000000012';
  const missingHashes = new EtlProposalController({
    propose: () => Promise.reject(new Error('unused')),
    getProposal: () =>
      Promise.resolve({
        accepted: true as const,
        value: {
          proposalId: '00000000-0000-4000-8000-000000000201',
          revision: 1,
          state: 'READY_FOR_ACCEPTANCE' as const,
          blockingReasons: [],
          plan: {
            inputArtifactVersionId,
            transformations: [{ kind: 'TRIM_TEXT', inputs: [inputArtifactVersionId] }],
          },
          review: {
            sourceSchema: ['name'],
            inferredSchema: ['name'],
            targetSchema: ['name'],
            assumptions: [],
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
  } as unknown as EtlProposalServiceV1);
  const withoutHashes = await missingHashes.get('00000000-0000-4000-8000-000000000201');
  assert.equal('acceptanceEvidence' in withoutHashes, false);

  const notReady = new EtlProposalController({
    propose: () => Promise.reject(new Error('unused')),
    getProposal: () =>
      Promise.resolve({
        accepted: true as const,
        value: {
          proposalId: '00000000-0000-4000-8000-000000000202',
          revision: 1,
          state: 'NEEDS_REVIEW' as const,
          blockingReasons: ['DRIFT'],
          plan: {
            inputArtifactVersionId,
            contentHash,
            schemaHash,
            transformations: [{ kind: 'TRIM_TEXT', inputs: [inputArtifactVersionId] }],
          },
          review: {
            sourceSchema: ['name'],
            inferredSchema: ['name'],
            targetSchema: ['name'],
            assumptions: [],
            beforeSample: [],
            afterSample: [],
            counts: { changed: 1, unchanged: 0, rejected: 0 },
            exclusions: [],
            unsupportedScopes: [],
            sampling: { disclosed: true, method: 'HEAD' as const, seed: 0, rowCount: 1 },
            qualityEffects: [],
            evidenceStatus: 'PARTIAL' as const,
            estimatedCost: { cpuMs: 5, memoryMb: 8 },
            aiSuggestions: [],
          },
          createdAt: '2026-08-10T10:00:00.000Z',
        },
      }),
  } as unknown as EtlProposalServiceV1);
  const blocked = await notReady.get('00000000-0000-4000-8000-000000000202');
  assert.equal('acceptanceEvidence' in blocked, false);
});
