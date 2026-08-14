import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { EtlProposalController } from '../../../src/features/dda/etl/api/etl-proposal.controller.js';
import type { EtlProposalAuthorityPortV1 } from '../../../src/features/dda/etl/application/etl-proposal-authority.port.js';
import type { EtlProposalServiceV1 } from '../../../src/features/dda/etl/application/etl-proposal.service.js';

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
      idempotencyKey: 'etl-proposal-test',
      authorizationEpoch: 1,
      mfaReenrollmentRequired: false,
    }),
};

function review() {
  return {
    sourceSchema: ['name'],
    inferredSchema: ['name'],
    targetSchema: ['name'],
    assumptions: ['trim'],
    beforeSample: [{ name: ' A ' }],
    afterSample: [{ name: 'A' }],
    counts: { changed: 1, unchanged: 0, rejected: 0 },
    exclusions: [],
    unsupportedScopes: [],
    sampling: { disclosed: true as const, method: 'HEAD' as const, seed: 0, rowCount: 1 },
    qualityEffects: [],
    evidenceStatus: 'AVAILABLE' as const,
    estimatedCost: { cpuMs: 5, memoryMb: 8 },
    aiSuggestions: [],
  };
}

function record(input: {
  readonly proposalId?: string;
  readonly revision?: number;
  readonly state?: 'NEEDS_REVIEW' | 'READY_FOR_ACCEPTANCE';
  readonly plan?: Record<string, unknown>;
  readonly blockingReasons?: readonly string[];
}) {
  return {
    proposalId: input.proposalId ?? '00000000-0000-4000-8000-000000000201',
    revision: input.revision ?? 1,
    state: input.state ?? ('READY_FOR_ACCEPTANCE' as const),
    blockingReasons: input.blockingReasons ?? [],
    plan: {
      tenantScope,
      transformations: [{ kind: 'TRIM_TEXT' }],
      ...(input.plan ?? {}),
    },
    review: review(),
    createdAt: '2026-08-10T10:00:00.000Z',
  };
}

const allowEtlProposalAuthority: EtlProposalAuthorityPortV1 = {
  authorizeAndResolve(input) {
    return Promise.resolve({
      accepted: true as const,
      value: { planInput: input.planInput, reviewContext: input.reviewContext },
    });
  },
  reauthorize: () => Promise.resolve({ accepted: true as const }),
};

function repositoryFor(value: unknown) {
  return {
    findById: () => Promise.resolve(value),
    save: (record: unknown) => Promise.resolve(record),
    update: (record: unknown) => Promise.resolve(record),
  } as never;
}

void test('[DDA-006, IAM-002] proposal controller returns review summary without inventing payloads', async () => {
  const createdRecord = record({});
  const service = {
    propose: () => Promise.resolve({ accepted: true as const, value: createdRecord }),
  };
  const controller = new EtlProposalController(
    service as unknown as EtlProposalServiceV1,
    requestContext,
    repositoryFor(createdRecord),
    allowEtlProposalAuthority,
  );

  const created = await controller.propose(request, {
    planInput: { engineBindingId: 'x' },
    reviewContext: review(),
  });
  assert.equal(created.accepted, true);
  assert.equal(created.state, 'READY_FOR_ACCEPTANCE');

  const loaded = await controller.get(request, createdRecord.proposalId);
  assert.deepEqual(loaded.sourceSchema, ['name']);
  assert.deepEqual(loaded.orderedSteps, [{ kind: 'TRIM_TEXT' }]);
});

void test('[DDA-005] proposal controller maps arbitrary code to a safe HTTP problem', async () => {
  const controller = new EtlProposalController(
    {
      propose: () =>
        Promise.resolve({ accepted: false as const, code: 'DDA_ETL_ARBITRARY_CODE' as const }),
    } as unknown as EtlProposalServiceV1,
    requestContext,
    repositoryFor(undefined),
    allowEtlProposalAuthority,
  );
  await assert.rejects(
    controller.propose(request, { planInput: {}, reviewContext: review() }),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 400,
  );
});

void test('[DDA-007] proposal GET returns acceptanceEvidence from real plan hashes and lineage', async () => {
  const contentHash = 'a'.repeat(64);
  const schemaHash = 'b'.repeat(64);
  const inputArtifactVersionId = '00000000-0000-4000-8000-000000000012';
  const lookupParentId = '00000000-0000-4000-8000-000000000099';
  const proposal = record({
    revision: 2,
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
  });
  proposal.review.counts.changed = 3;
  proposal.review.counts.unchanged = 1;
  proposal.review.counts.rejected = 1;
  const controller = new EtlProposalController(
    {} as EtlProposalServiceV1,
    requestContext,
    repositoryFor(proposal),
  );

  const loaded = await controller.get(request, proposal.proposalId);
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
  const missingHashes = record({
    plan: {
      inputArtifactVersionId,
      transformations: [{ kind: 'TRIM_TEXT', inputs: [inputArtifactVersionId] }],
    },
  });
  const missingPlan = missingHashes.plan as Record<string, unknown>;
  delete missingPlan['contentHash'];
  delete missingPlan['schemaHash'];
  const missingController = new EtlProposalController(
    {} as EtlProposalServiceV1,
    requestContext,
    repositoryFor(missingHashes),
  );
  const withoutHashes = await missingController.get(request, missingHashes.proposalId);
  assert.equal('acceptanceEvidence' in withoutHashes, false);

  const notReady = record({
    proposalId: '00000000-0000-4000-8000-000000000202',
    state: 'NEEDS_REVIEW',
    blockingReasons: ['DRIFT'],
    plan: {
      inputArtifactVersionId,
      contentHash,
      schemaHash,
      transformations: [{ kind: 'TRIM_TEXT', inputs: [inputArtifactVersionId] }],
    },
  });
  const notReadyController = new EtlProposalController(
    {} as EtlProposalServiceV1,
    requestContext,
    repositoryFor(notReady),
  );
  const blocked = await notReadyController.get(request, notReady.proposalId);
  assert.equal('acceptanceEvidence' in blocked, false);
});

void test('[IAM-019] proposal GET fails closed when the scoped repository is not composed', async () => {
  const controller = new EtlProposalController({} as EtlProposalServiceV1, requestContext);
  await assert.rejects(
    controller.get(request, '00000000-0000-4000-8000-000000000201'),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 503,
  );
});
