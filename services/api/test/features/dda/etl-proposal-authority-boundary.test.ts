import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { EtlProposalController } from '../../../src/features/dda/etl/api/etl-proposal.controller.js';
import type {
  EtlProposalAuthorityPortV1,
  EtlProposalAuthorityValueV1,
} from '../../../src/features/dda/etl/application/etl-proposal-authority.port.js';
import type { EtlProposalServiceV1 } from '../../../src/features/dda/etl/application/etl-proposal.service.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const ids = Object.freeze({
  clientArtifact: '00000000-0000-4000-8000-000000000011',
  serverArtifact: '00000000-0000-4000-8000-000000000012',
  serverSchema: '00000000-0000-4000-8000-000000000013',
  serverMapping: '00000000-0000-4000-8000-000000000014',
  serverRule: '00000000-0000-4000-8000-000000000015',
  serverPolicy: '00000000-0000-4000-8000-000000000016',
  serverRetention: '00000000-0000-4000-8000-000000000017',
  serverEvidence: '00000000-0000-4000-8000-000000000018',
  proposal: '00000000-0000-4000-8000-000000000019',
});

const requestContext = {
  resolve: () =>
    Promise.resolve({
      tenantScope,
      actorId: '00000000-0000-4000-8000-000000000021' as never,
      correlationId: '00000000-0000-4000-8000-000000000022' as never,
      idempotencyKey: 'etl-proposal-boundary',
      authorizationEpoch: 1,
      workspaceAuthorizationEpoch: 2,
      mfaReenrollmentRequired: false,
    }),
};

function review(label: string) {
  return {
    sourceSchema: [label],
    inferredSchema: [label],
    targetSchema: [label],
    assumptions: [`server-${label}`],
    beforeSample: [],
    afterSample: [],
    counts: { changed: 1, unchanged: 0, rejected: 0 },
    exclusions: [],
    unsupportedScopes: [],
    sampling: { disclosed: true as const, method: 'HEAD' as const, seed: 1, rowCount: 1 },
    qualityEffects: [],
    evidenceStatus: 'AVAILABLE' as const,
    estimatedCost: { cpuMs: 1, memoryMb: 2 },
    aiSuggestions: [],
  };
}

const resolved: EtlProposalAuthorityValueV1 = {
  planInput: {
    tenantScope,
    planId: ids.proposal,
    planVersionId: ids.proposal,
    inputArtifactVersionId: ids.serverArtifact,
    schemaVersionId: ids.serverSchema,
    mappingVersionId: ids.serverMapping,
    ruleSetVersionId: ids.serverRule,
    engineBindingId: ids.serverMapping,
    contentHash: 'a'.repeat(64),
    schemaHash: 'b'.repeat(64),
    dataClassification: 'INTERNAL',
    dataModePolicyVersionId: ids.serverPolicy,
    retentionReferenceId: ids.serverRetention,
    evidenceReferenceId: ids.serverEvidence,
    createdAt: '2026-08-13T05:00:00.000Z',
  },
  reviewContext: review('server'),
};

function repositoryFor(record: unknown) {
  return {
    findById: () => Promise.resolve(record),
    save: (value: unknown) => Promise.resolve(value),
    update: (value: unknown) => Promise.resolve(value),
  } as never;
}

void test('[DDA-006][IAM-DDA] ETL proposal POST authorizes ETL_PROPOSE and uses server-resolved resources', async () => {
  const calls: unknown[] = [];
  const authority: EtlProposalAuthorityPortV1 = {
    authorizeAndResolve: (input) => {
      calls.push(input);
      return Promise.resolve({ accepted: true, value: resolved });
    },
    reauthorize: () => Promise.resolve({ accepted: true }),
  };
  let serviceInput: unknown;
  const service = {
    propose: (input: unknown) => {
      serviceInput = input;
      return Promise.resolve({
        accepted: true as const,
        value: {
          proposalId: ids.proposal,
          revision: 1,
          state: 'READY_FOR_ACCEPTANCE' as const,
          blockingReasons: [],
          plan: resolved.planInput,
          review: resolved.reviewContext,
        },
      });
    },
  };
  const controller = new EtlProposalController(
    service as unknown as EtlProposalServiceV1,
    requestContext,
    repositoryFor(undefined),
    authority,
  );

  await controller.propose(
    { headers: { authorization: 'Bearer verified-request' } },
    {
      planInput: {
        inputArtifactVersionId: ids.clientArtifact,
        schemaVersionId: ids.clientArtifact,
        mappingVersionId: ids.clientArtifact,
      },
      reviewContext: review('client'),
    },
  );

  assert.equal(calls.length, 1);
  assert.equal((calls[0] as { action: string }).action, 'ETL_PROPOSE');
  assert.equal(
    (serviceInput as { planInput: Record<string, unknown> }).planInput['inputArtifactVersionId'],
    ids.serverArtifact,
  );
  assert.deepEqual(
    (serviceInput as { reviewContext: unknown }).reviewContext,
    resolved.reviewContext,
  );
});

void test('[DDA-006][IAM-DDA] an unavailable ETL proposal authority blocks POST before proposal persistence', async () => {
  let serviceCalled = false;
  const authority: EtlProposalAuthorityPortV1 = {
    authorizeAndResolve: () =>
      Promise.resolve({
        accepted: false,
        code: 'AUTHORIZATION_UNAVAILABLE' as const,
      }),
    reauthorize: () =>
      Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' as const }),
  };
  const controller = new EtlProposalController(
    {
      propose: () => {
        serviceCalled = true;
        return Promise.reject(new Error('must not persist'));
      },
    } as unknown as EtlProposalServiceV1,
    requestContext,
    repositoryFor(undefined),
    authority,
  );

  await assert.rejects(
    controller.propose(
      { headers: { authorization: 'Bearer verified-request' } },
      { planInput: {}, reviewContext: review('client') },
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 503,
  );
  assert.equal(serviceCalled, false);
});

void test('[DDA-006][IAM-DDA] a denied ETL proposal authority remains a forbidden response', async () => {
  let serviceCalled = false;
  const authority: EtlProposalAuthorityPortV1 = {
    authorizeAndResolve: () => Promise.resolve({ accepted: false, code: 'FORBIDDEN' as const }),
    reauthorize: () => Promise.resolve({ accepted: false, code: 'FORBIDDEN' as const }),
  };
  const controller = new EtlProposalController(
    {
      propose: () => {
        serviceCalled = true;
        return Promise.reject(new Error('must not persist'));
      },
    } as unknown as EtlProposalServiceV1,
    requestContext,
    repositoryFor(undefined),
    authority,
  );

  await assert.rejects(
    controller.propose(
      { headers: { authorization: 'Bearer verified-request' } },
      { planInput: {}, reviewContext: review('client') },
    ),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 403,
  );
  assert.equal(serviceCalled, false);
});
