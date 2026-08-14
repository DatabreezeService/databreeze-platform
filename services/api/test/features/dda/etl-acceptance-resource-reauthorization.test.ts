import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { EtlAcceptanceServiceV1 } from '../../../src/features/dda/etl/application/etl-acceptance.service.js';
import type { EtlProposalAuthorityPortV1 } from '../../../src/features/dda/etl/application/etl-proposal-authority.port.js';
import type { EtlProposalRepositoryPortV1 } from '../../../src/features/dda/etl/application/etl-proposal-repository.port.js';
import type { EtlAcceptanceAuthorizationPortV1 } from '../../../src/features/dda/etl/application/etl-acceptance-authorization.port.js';
import type {
  EtlAudPortV1,
  EtlBuaPortV1,
  EtlDsmPortV1,
  EtlIaePortV1,
  EtlJraPortV1,
  EtlPolicyPortV1,
} from '../../../src/features/dda/etl/application/etl-foundation-ports.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const ids = Object.freeze({
  actor: '00000000-0000-4000-8000-000000000011',
  correlation: '00000000-0000-4000-8000-000000000012',
  proposal: '00000000-0000-4000-8000-000000000013',
  artifact: '00000000-0000-4000-8000-000000000014',
  policy: '00000000-0000-4000-8000-000000000015',
});

const context = {
  tenantScope,
  actorId: ids.actor as never,
  correlationId: ids.correlation as never,
  idempotencyKey: 'acceptance-resource-reauthorization',
  authorizationEpoch: 1,
  workspaceAuthorizationEpoch: 2,
  mfaReenrollmentRequired: false,
};

const proposal = {
  proposalId: ids.proposal,
  revision: 4,
  state: 'READY_FOR_ACCEPTANCE' as const,
  blockingReasons: [],
  tenantScope,
  plan: {
    tenantScope,
    inputArtifactVersionId: ids.artifact,
    dataModePolicyVersionId: ids.policy,
    engineBindingId: ids.policy,
  },
  review: {
    sourceSchema: [],
    inferredSchema: [],
    targetSchema: [],
    assumptions: [],
    beforeSample: [],
    afterSample: [],
    counts: { changed: 1, unchanged: 0, rejected: 0 },
    exclusions: [],
    unsupportedScopes: [],
    sampling: { disclosed: true, method: 'HEAD' as const, seed: 1, rowCount: 1 },
    qualityEffects: [],
    evidenceStatus: 'AVAILABLE' as const,
    estimatedCost: { cpuMs: 1, memoryMb: 1 },
    aiSuggestions: [],
  },
  createdAt: '2026-08-13T05:00:00.000Z',
};

function repository(calls: string[]): EtlProposalRepositoryPortV1 {
  return {
    findById: () => Promise.resolve(proposal),
    save: (record) => Promise.resolve(record),
    update: (record) => Promise.resolve(record),
    reserveAcceptance: () => {
      calls.push('reserve');
      return Promise.resolve({ accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' as const });
    },
    completeAcceptance: () =>
      Promise.resolve({
        accepted: false,
        code: 'DDA_ETL_COMMAND_UNAVAILABLE' as const,
      }),
    releaseAcceptance: () => Promise.resolve(),
    reconcileAbandonedAcceptance: () =>
      Promise.resolve({
        accepted: false,
        code: 'DDA_ETL_COMMAND_UNAVAILABLE' as const,
      }),
  };
}

function ports(calls: string[]) {
  const authorization: EtlAcceptanceAuthorizationPortV1 = {
    authorize: () => Promise.resolve({ accepted: true }),
  };
  const foundation = {
    iae: {} as EtlIaePortV1,
    dsm: {} as EtlDsmPortV1,
    jra: {} as EtlJraPortV1,
    bua: {
      admit: () => {
        calls.push('bua');
        return Promise.resolve({ accepted: true });
      },
    } as EtlBuaPortV1,
    aud: {} as EtlAudPortV1,
    policy: {
      currentPolicyVersionId: () => Promise.resolve(ids.policy),
    } as EtlPolicyPortV1,
  };
  return { authorization, foundation };
}

void test('[DDA-004][IAM-DDA] ETL acceptance reauthorizes exact proposal resources before reservation or side effects', async () => {
  const calls: string[] = [];
  const reauthorized: unknown[] = [];
  const proposalAuthority: EtlProposalAuthorityPortV1 = {
    authorizeAndResolve: () =>
      Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' as const }),
    reauthorize: (input) => {
      reauthorized.push(input);
      return Promise.resolve({ accepted: false, code: 'RESOURCE_SCOPE_DENIED' as const });
    },
  };
  const dependencies = ports(calls);
  const service = new EtlAcceptanceServiceV1(repository(calls), dependencies.foundation, {
    authorization: dependencies.authorization,
    proposalAuthority,
  });

  const result = await service.accept({
    tenantScope,
    context,
    proposalId: ids.proposal,
    expectedRevision: proposal.revision,
    idempotencyKey: 'acceptance-1',
    correlationId: ids.correlation,
    expected: {
      rowCount: 1,
      rejectedCount: 0,
      contentHash: 'a'.repeat(64),
      schemaHash: 'b'.repeat(64),
      lineageIds: [ids.artifact],
    },
  });

  assert.deepEqual(result, { accepted: false, code: 'DDA_ETL_AUTHORIZATION_DENIED' });
  assert.equal(calls.includes('reserve'), false);
  assert.equal(calls.includes('bua'), false);
  assert.equal(reauthorized.length, 1);
  assert.equal((reauthorized[0] as { proposalId: string }).proposalId, ids.proposal);
  assert.equal(
    (reauthorized[0] as { proposalRevision: number }).proposalRevision,
    proposal.revision,
  );
  assert.equal(
    (reauthorized[0] as { plan: { inputArtifactVersionId: string } }).plan.inputArtifactVersionId,
    ids.artifact,
  );
});
