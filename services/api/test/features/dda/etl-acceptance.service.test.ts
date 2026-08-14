import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryEtlProposalRepositoryAdapter } from '../../../src/features/dda/etl/adapter/in-memory-etl-proposal-repository.adapter.js';
import { EtlAcceptanceServiceV1 } from '../../../src/features/dda/etl/application/etl-acceptance.service.js';
import type { EtlAcceptanceAuthorizationPortV1 } from '../../../src/features/dda/etl/application/etl-acceptance-authorization.port.js';
import type { EtlProposalAuthorityPortV1 } from '../../../src/features/dda/etl/application/etl-proposal-authority.port.js';
import type {
  EtlAudPortV1,
  EtlBuaPortV1,
  EtlDsmPortV1,
  EtlIaePortV1,
  EtlJraPortV1,
  EtlPolicyPortV1,
} from '../../../src/features/dda/etl/application/etl-foundation-ports.js';
import { EtlProposalServiceV1 } from '../../../src/features/dda/etl/application/etl-proposal.service.js';

const fixtureRoot = resolve(process.cwd(), '../../packages/contracts/test/fixtures/dda/v1');
const golden = JSON.parse(readFileSync(resolve(fixtureRoot, 'golden-valid.json'), 'utf8')) as {
  readonly 'dda-etl-plan': Record<string, unknown>;
};

const scopeResult = parseTenantScopeV1(golden['dda-etl-plan']['tenantScope']);
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const otherScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000099',
  projectId: '00000000-0000-4000-8000-000000000099',
});
assert.equal(otherScopeResult.accepted, true);
const otherScope = otherScopeResult.accepted ? otherScopeResult.value : (null as never);

const acceptanceContext = {
  tenantScope,
  actorId: '00000000-0000-4000-8000-000000000004' as never,
  correlationId: '00000000-0000-4000-8000-000000000401' as never,
  idempotencyKey: 'etl-service-test',
  authorizationEpoch: 1,
  mfaReenrollmentRequired: false,
};
const otherAcceptanceContext = {
  ...acceptanceContext,
  tenantScope: otherScope,
};
const allowEtlAcceptance: EtlAcceptanceAuthorizationPortV1 = {
  authorize() {
    return Promise.resolve({ accepted: true as const });
  },
};
const allowEtlProposalAuthority: EtlProposalAuthorityPortV1 = {
  authorizeAndResolve(input) {
    return Promise.resolve({
      accepted: true as const,
      value: { planInput: input.planInput, reviewContext: input.reviewContext },
    });
  },
  reauthorize() {
    return Promise.resolve({ accepted: true as const });
  },
};

const MESSY_SALES_ROWS = 5;
const MESSY_SALES_ACCEPTED = 4;
const MESSY_SALES_REJECTED = 1;
const MESSY_CONTENT_HASH = createHash('sha256').update('messy-sales-v1-accepted').digest('hex');
const MESSY_SCHEMA_HASH = createHash('sha256').update('messy-sales-v1-schema').digest('hex');
const MESSY_LINEAGE = [
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000301',
];

function validPlanInput() {
  const plan = golden['dda-etl-plan'];
  return {
    planId: plan['planId'],
    planVersionId: plan['planVersionId'],
    tenantScope: plan['tenantScope'],
    inputArtifactVersionId: plan['inputArtifactVersionId'],
    schemaVersionId: plan['schemaVersionId'],
    mappingVersionId: plan['mappingVersionId'],
    ruleSetVersionId: plan['ruleSetVersionId'],
    engineBindingId: plan['engineBindingId'],
    transformations: [
      {
        stepId: '00000000-0000-4000-8000-000000000017',
        kind: 'TRIM_TEXT',
        inputs: [plan['inputArtifactVersionId']],
        config: { field: 'name' },
      },
      {
        stepId: '00000000-0000-4000-8000-000000000018',
        kind: 'FILTER_ROWS',
        inputs: [plan['inputArtifactVersionId']],
        config: { reason: 'INVALID_AMOUNT' },
      },
    ],
    contentHash: plan['contentHash'],
    schemaHash: plan['schemaHash'],
    dataClassification: plan['dataClassification'],
    dataModePolicyVersionId: plan['dataModePolicyVersionId'],
    retentionReferenceId: plan['retentionReferenceId'],
    evidenceReferenceId: plan['evidenceReferenceId'],
    createdAt: plan['createdAt'],
  };
}

async function seedProposal(proposalService: EtlProposalServiceV1) {
  const proposed = await proposalService.propose({
    planInput: validPlanInput(),
    reviewContext: {
      sourceSchema: ['name', 'amount'],
      inferredSchema: ['name', 'amount'],
      targetSchema: ['name', 'amount'],
      assumptions: ['filter invalid amounts'],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 1, unchanged: 3, rejected: 1 },
      exclusions: [{ scope: 'row', reasonCode: 'INVALID_AMOUNT', count: 1 }],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 5 },
      qualityEffects: [
        {
          dimension: 'completeness',
          denominator: 5,
          coverage: 4,
          rule: 'required',
          expectation: 'present',
          sampleState: 'FULL',
          limitations: ['rejected counted separately'],
          completeGateEligible: false,
        },
      ],
      evidenceStatus: 'PARTIAL',
      estimatedCost: { cpuMs: 20, memoryMb: 32 },
      aiSuggestions: [],
    },
  });
  assert.equal(proposed.accepted, true);
  return proposed.accepted ? proposed.value : (null as never);
}

function createPorts(
  overrides: {
    iae?: Partial<EtlIaePortV1>;
    dsm?: Partial<EtlDsmPortV1>;
    jra?: Partial<EtlJraPortV1>;
    bua?: Partial<EtlBuaPortV1>;
    aud?: Partial<EtlAudPortV1>;
    policy?: Partial<EtlPolicyPortV1>;
    manifest?: {
      rowCount?: number;
      contentHash?: string;
      schemaHash?: string;
      rejectBundleId?: string | null;
      lineageIds?: readonly string[];
      partial?: boolean;
    };
  } = {},
) {
  const jobs = new Map<string, string>();
  const iae: EtlIaePortV1 = {
    registerDerivative() {
      return Promise.resolve({
        accepted: true,
        artifactVersionId: '00000000-0000-4000-8000-000000000302',
      });
    },
    ...overrides.iae,
  };
  const dsm: EtlDsmPortV1 = {
    registerDatasetVersion() {
      return Promise.resolve({
        accepted: true,
        datasetVersionId: '00000000-0000-4000-8000-000000000303',
        revision: 1,
      });
    },
    ...overrides.dsm,
  };
  const jra: EtlJraPortV1 = {
    createTypedJob(input) {
      const existing = jobs.get(input.idempotencyKey);
      if (existing) return Promise.resolve({ accepted: true, jobId: existing, replayed: true });
      const jobId = '00000000-0000-4000-8000-000000000304';
      jobs.set(input.idempotencyKey, jobId);
      return Promise.resolve({ accepted: true, jobId, replayed: false });
    },
    awaitResultManifest() {
      return Promise.resolve({
        accepted: true,
        manifest: {
          rowCount: overrides.manifest?.rowCount ?? MESSY_SALES_ACCEPTED,
          contentHash: overrides.manifest?.contentHash ?? MESSY_CONTENT_HASH,
          schemaHash: overrides.manifest?.schemaHash ?? MESSY_SCHEMA_HASH,
          rejectBundleId:
            overrides.manifest && 'rejectBundleId' in overrides.manifest
              ? (overrides.manifest.rejectBundleId ?? null)
              : '00000000-0000-4000-8000-000000000305',
          lineageIds: overrides.manifest?.lineageIds ?? MESSY_LINEAGE,
          partial: overrides.manifest?.partial ?? false,
        },
      });
    },
    ...overrides.jra,
  };
  const bua: EtlBuaPortV1 = {
    admit() {
      return Promise.resolve({ accepted: true });
    },
    ...overrides.bua,
  };
  const aud: EtlAudPortV1 = {
    emit() {
      return Promise.resolve({ accepted: true });
    },
    ...overrides.aud,
  };
  const policy: EtlPolicyPortV1 = {
    currentPolicyVersionId() {
      return Promise.resolve(String(golden['dda-etl-plan']['dataModePolicyVersionId']));
    },
    ...overrides.policy,
  };
  return { iae, dsm, jra, bua, aud, policy };
}

void test('[DDA-007] golden messy-sales acceptance registers immutable DatasetVersion', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedProposal(proposalService);
  const ports = createPorts();
  const service = new EtlAcceptanceServiceV1(repo, ports, {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const result = await service.accept({
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    idempotencyKey: 'messy-sales-accept-1',
    correlationId: '00000000-0000-4000-8000-000000000401',
    expected: {
      rowCount: MESSY_SALES_ACCEPTED,
      rejectedCount: MESSY_SALES_REJECTED,
      contentHash: MESSY_CONTENT_HASH,
      schemaHash: MESSY_SCHEMA_HASH,
      lineageIds: MESSY_LINEAGE,
    },
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.datasetVersionId, '00000000-0000-4000-8000-000000000303');
  assert.equal(result.value.rowCount, MESSY_SALES_ACCEPTED);
  assert.equal(result.value.contentHash, MESSY_CONTENT_HASH);
  assert.deepEqual(result.value.lineageIds, MESSY_LINEAGE);
  assert.equal(MESSY_SALES_ROWS, MESSY_SALES_ACCEPTED + MESSY_SALES_REJECTED);
});

void test('[DDA-004][DDA-007] replay is idempotent and revision conflicts fail closed', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedProposal(proposalService);
  const ports = createPorts();
  const service = new EtlAcceptanceServiceV1(repo, ports, {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const first = await service.accept({
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    idempotencyKey: 'replay-key',
    correlationId: '00000000-0000-4000-8000-000000000402',
    expected: {
      rowCount: MESSY_SALES_ACCEPTED,
      rejectedCount: MESSY_SALES_REJECTED,
      contentHash: MESSY_CONTENT_HASH,
      schemaHash: MESSY_SCHEMA_HASH,
      lineageIds: MESSY_LINEAGE,
    },
  });
  assert.equal(first.accepted, true);
  const replay = await service.accept({
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    idempotencyKey: 'replay-key',
    correlationId: '00000000-0000-4000-8000-000000000402',
    expected: {
      rowCount: MESSY_SALES_ACCEPTED,
      rejectedCount: MESSY_SALES_REJECTED,
      contentHash: MESSY_CONTENT_HASH,
      schemaHash: MESSY_SCHEMA_HASH,
      lineageIds: MESSY_LINEAGE,
    },
  });
  assert.equal(replay.accepted, true);
  if (first.accepted && replay.accepted) {
    assert.equal(replay.value.datasetVersionId, first.value.datasetVersionId);
    assert.equal(replay.value.replayed, true);
  }

  const conflict = await service.accept({
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 99,
    idempotencyKey: 'conflict-key',
    correlationId: '00000000-0000-4000-8000-000000000403',
    expected: {
      rowCount: MESSY_SALES_ACCEPTED,
      rejectedCount: MESSY_SALES_REJECTED,
      contentHash: MESSY_CONTENT_HASH,
      schemaHash: MESSY_SCHEMA_HASH,
      lineageIds: MESSY_LINEAGE,
    },
  });
  assert.equal(conflict.accepted, false);
  if (!conflict.accepted) assert.equal(conflict.code, 'DDA_ETL_REVISION_CONFLICT');
});

void test('[DDA-004][DDA-007] same idempotency key cannot replay acceptance across tenant scopes', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedProposal(proposalService);
  const service = new EtlAcceptanceServiceV1(repo, createPorts(), {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const expected = {
    rowCount: MESSY_SALES_ACCEPTED,
    rejectedCount: MESSY_SALES_REJECTED,
    contentHash: MESSY_CONTENT_HASH,
    schemaHash: MESSY_SCHEMA_HASH,
    lineageIds: MESSY_LINEAGE,
  };
  const first = await service.accept({
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    idempotencyKey: 'cross-tenant-etl-key',
    correlationId: '00000000-0000-4000-8000-000000000406',
    expected,
  });
  assert.equal(first.accepted, true);

  const crossTenant = await service.accept({
    tenantScope: otherScope,
    context: otherAcceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    idempotencyKey: 'cross-tenant-etl-key',
    correlationId: '00000000-0000-4000-8000-000000000407',
    expected,
  });
  assert.equal(crossTenant.accepted, false);
  if (!crossTenant.accepted) assert.equal(crossTenant.code, 'DDA_ETL_NOT_FOUND');
});

void test('[DDA-007] concurrent acceptance reserves one expected revision before side effects', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedProposal(proposalService);
  let jraCalls = 0;
  let iaeCalls = 0;
  let dsmCalls = 0;
  let auditCalls = 0;
  const service = new EtlAcceptanceServiceV1(
    repo,
    createPorts({
      jra: {
        createTypedJob() {
          jraCalls += 1;
          return Promise.resolve({
            accepted: true as const,
            jobId: '00000000-0000-4000-8000-000000000304',
            replayed: false,
          });
        },
      },
      iae: {
        registerDerivative() {
          iaeCalls += 1;
          return Promise.resolve({
            accepted: true as const,
            artifactVersionId: '00000000-0000-4000-8000-000000000302',
          });
        },
      },
      dsm: {
        registerDatasetVersion() {
          dsmCalls += 1;
          return Promise.resolve({
            accepted: true as const,
            datasetVersionId: '00000000-0000-4000-8000-000000000303',
            revision: 1,
          });
        },
      },
      aud: {
        emit() {
          auditCalls += 1;
          return Promise.resolve({ accepted: true as const });
        },
      },
    }),
    { authorization: allowEtlAcceptance, proposalAuthority: allowEtlProposalAuthority },
  );
  const input = {
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    correlationId: '00000000-0000-4000-8000-000000000408',
    expected: {
      rowCount: MESSY_SALES_ACCEPTED,
      rejectedCount: MESSY_SALES_REJECTED,
      contentHash: MESSY_CONTENT_HASH,
      schemaHash: MESSY_SCHEMA_HASH,
      lineageIds: MESSY_LINEAGE,
    },
  };
  const [first, second] = await Promise.all([
    service.accept({ ...input, idempotencyKey: 'concurrent-etl-key-1' }),
    service.accept({ ...input, idempotencyKey: 'concurrent-etl-key-2' }),
  ]);
  const accepted = [first, second].filter((result) => result.accepted);
  assert.equal(accepted.length, 1);
  assert.equal(jraCalls, 1);
  assert.equal(iaeCalls, 1);
  assert.equal(dsmCalls, 1);
  assert.equal(auditCalls, 1);
  const rejectedResult = [first, second].find((result) => !result.accepted);
  assert.ok(rejectedResult);
  if (rejectedResult && !rejectedResult.accepted) {
    assert.equal(rejectedResult.code, 'DDA_ETL_REVISION_CONFLICT');
  }
});

void test('[IAM-019] Viewer or unavailable ETL acceptance authority stops before BUA and JRA', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedProposal(proposalService);
  let buaCalls = 0;
  let jraCalls = 0;
  const ports = createPorts({
    bua: {
      admit() {
        buaCalls += 1;
        return Promise.resolve({ accepted: true as const });
      },
    },
    jra: {
      createTypedJob() {
        jraCalls += 1;
        return Promise.resolve({
          accepted: true as const,
          jobId: '00000000-0000-4000-8000-000000000304',
          replayed: false,
        });
      },
    },
  });
  const denied = new EtlAcceptanceServiceV1(repo, ports, {
    authorization: {
      authorize() {
        return Promise.resolve({ accepted: false as const, code: 'FORBIDDEN' as const });
      },
    },
  });
  const input = {
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    idempotencyKey: 'viewer-denied-etl',
    correlationId: '00000000-0000-4000-8000-000000000409',
    expected: {
      rowCount: MESSY_SALES_ACCEPTED,
      rejectedCount: MESSY_SALES_REJECTED,
      contentHash: MESSY_CONTENT_HASH,
      schemaHash: MESSY_SCHEMA_HASH,
      lineageIds: MESSY_LINEAGE,
    },
  };
  assert.deepEqual(await denied.accept(input), {
    accepted: false,
    code: 'DDA_ETL_AUTHORIZATION_DENIED',
  });
  assert.equal(buaCalls, 0);
  assert.equal(jraCalls, 0);

  const unavailable = new EtlAcceptanceServiceV1(repo, ports, {
    authorization: {
      authorize() {
        return Promise.resolve({
          accepted: false as const,
          code: 'AUTHORIZATION_UNAVAILABLE' as const,
        });
      },
    },
  });
  assert.deepEqual(await unavailable.accept({ ...input, idempotencyKey: 'unavailable-etl' }), {
    accepted: false,
    code: 'DDA_ETL_AUTHORIZATION_UNAVAILABLE',
  });
});

void test('[DDA-007] same ETL command key with a different payload conflicts', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedProposal(proposalService);
  const service = new EtlAcceptanceServiceV1(repo, createPorts(), {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const expected = {
    rowCount: MESSY_SALES_ACCEPTED,
    rejectedCount: MESSY_SALES_REJECTED,
    contentHash: MESSY_CONTENT_HASH,
    schemaHash: MESSY_SCHEMA_HASH,
    lineageIds: MESSY_LINEAGE,
  };
  assert.equal(
    (
      await service.accept({
        tenantScope,
        context: acceptanceContext,
        proposalId: proposal.proposalId,
        expectedRevision: 1,
        idempotencyKey: 'etl-command-conflict',
        correlationId: '00000000-0000-4000-8000-000000000410',
        expected,
      })
    ).accepted,
    true,
  );
  const conflicting = await service.accept({
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    idempotencyKey: 'etl-command-conflict',
    correlationId: '00000000-0000-4000-8000-000000000410',
    expected: { ...expected, rowCount: MESSY_SALES_ACCEPTED - 1 },
  });
  assert.deepEqual(conflicting, { accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' });
});

void test('[DDA-007] stale proposal partial output hash schema reject and policy failures', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedProposal(proposalService);
  await repo.update({
    ...proposal,
    state: 'NEEDS_REVIEW',
    blockingReasons: ['BREAKING_TYPE_CHANGE'],
  });

  const staleService = new EtlAcceptanceServiceV1(repo, createPorts(), {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const stale = await staleService.accept({
    tenantScope,
    context: acceptanceContext,
    proposalId: proposal.proposalId,
    expectedRevision: 1,
    idempotencyKey: 'stale',
    correlationId: '00000000-0000-4000-8000-000000000404',
    expected: {
      rowCount: MESSY_SALES_ACCEPTED,
      rejectedCount: MESSY_SALES_REJECTED,
      contentHash: MESSY_CONTENT_HASH,
      schemaHash: MESSY_SCHEMA_HASH,
      lineageIds: MESSY_LINEAGE,
    },
  });
  assert.equal(stale.accepted, false);
  if (!stale.accepted) assert.equal(stale.code, 'DDA_ETL_STALE_PROPOSAL');

  const fresh = await seedProposal(new EtlProposalServiceV1(repo));
  const cases: Array<{
    name: string;
    ports: ReturnType<typeof createPorts>;
    code: string;
  }> = [
    {
      name: 'partial',
      ports: createPorts({ manifest: { partial: true } }),
      code: 'DDA_ETL_PARTIAL_OUTPUT',
    },
    {
      name: 'hash',
      ports: createPorts({ manifest: { contentHash: 'c'.repeat(64) } }),
      code: 'DDA_ETL_HASH_MISMATCH',
    },
    {
      name: 'schema',
      ports: createPorts({ manifest: { schemaHash: 'd'.repeat(64) } }),
      code: 'DDA_ETL_SCHEMA_MISMATCH',
    },
    {
      name: 'reject',
      ports: createPorts({ manifest: { rejectBundleId: null } }),
      code: 'DDA_ETL_MISSING_REJECT_BUNDLE',
    },
    {
      name: 'policy',
      ports: createPorts({
        policy: {
          currentPolicyVersionId() {
            return Promise.resolve('00000000-0000-4000-8000-000000000999');
          },
        },
      }),
      code: 'DDA_ETL_POLICY_CHANGED',
    },
    {
      name: 'jra-retry',
      ports: createPorts({
        jra: {
          createTypedJob() {
            return Promise.resolve({
              accepted: true,
              jobId: '00000000-0000-4000-8000-000000000304',
              replayed: false,
            });
          },
          awaitResultManifest() {
            return Promise.resolve({ accepted: false, code: 'JRA_RETRY' });
          },
        },
      }),
      code: 'DDA_ETL_JRA_RETRY',
    },
    {
      name: 'dsm',
      ports: createPorts({
        dsm: {
          registerDatasetVersion() {
            return Promise.resolve({ accepted: false, code: 'DSM_REGISTER_FAILED' });
          },
        },
      }),
      code: 'DDA_ETL_DSM_FAILED',
    },
    {
      name: 'aud',
      ports: createPorts({
        aud: {
          emit() {
            return Promise.resolve({ accepted: false, code: 'AUD_FAILED' });
          },
        },
      }),
      code: 'DDA_ETL_AUD_FAILED',
    },
  ];

  for (const item of cases) {
    const service = new EtlAcceptanceServiceV1(repo, item.ports, {
      authorization: allowEtlAcceptance,
      proposalAuthority: allowEtlProposalAuthority,
    });
    const result = await service.accept({
      tenantScope,
      context: acceptanceContext,
      proposalId: fresh.proposalId,
      expectedRevision: 1,
      idempotencyKey: `case-${item.name}`,
      correlationId: '00000000-0000-4000-8000-000000000405',
      expected: {
        rowCount: MESSY_SALES_ACCEPTED,
        rejectedCount: MESSY_SALES_REJECTED,
        contentHash: MESSY_CONTENT_HASH,
        schemaHash: MESSY_SCHEMA_HASH,
        lineageIds: MESSY_LINEAGE,
      },
    });
    assert.equal(result.accepted, false, item.name);
    if (!result.accepted) assert.equal(result.code, item.code, item.name);
  }
});
