import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryEtlProposalRepositoryAdapter } from '../../../src/features/dda/etl/adapter/in-memory-etl-proposal-repository.adapter.js';
import { EtlAcceptanceServiceV1 } from '../../../src/features/dda/etl/application/etl-acceptance.service.js';
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

const MESSY_SALES_ROWS = 5;
const MESSY_SALES_ACCEPTED = 4;
const MESSY_SALES_REJECTED = 1;
const MESSY_CONTENT_HASH = createHash('sha256').update('messy-sales-v1-accepted').digest('hex');
const MESSY_SCHEMA_HASH = createHash('sha256').update('messy-sales-v1-schema').digest('hex');
const MESSY_LINEAGE = ['00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000301'];

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

function createPorts(overrides: {
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
} = {}) {
  const jobs = new Map<string, string>();
  const iae: EtlIaePortV1 = {
    async registerDerivative() {
      return { accepted: true, artifactVersionId: '00000000-0000-4000-8000-000000000302' };
    },
    ...overrides.iae,
  };
  const dsm: EtlDsmPortV1 = {
    async registerDatasetVersion() {
      return {
        accepted: true,
        datasetVersionId: '00000000-0000-4000-8000-000000000303',
        revision: 1,
      };
    },
    ...overrides.dsm,
  };
  const jra: EtlJraPortV1 = {
    async createTypedJob(input) {
      const existing = jobs.get(input.idempotencyKey);
      if (existing) return { accepted: true, jobId: existing, replayed: true };
      const jobId = '00000000-0000-4000-8000-000000000304';
      jobs.set(input.idempotencyKey, jobId);
      return { accepted: true, jobId, replayed: false };
    },
    async awaitResultManifest() {
      return {
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
      };
    },
    ...overrides.jra,
  };
  const bua: EtlBuaPortV1 = {
    async admit() {
      return { accepted: true };
    },
    ...overrides.bua,
  };
  const aud: EtlAudPortV1 = {
    async emit() {
      return { accepted: true };
    },
    ...overrides.aud,
  };
  const policy: EtlPolicyPortV1 = {
    async currentPolicyVersionId() {
      return String(golden['dda-etl-plan']['dataModePolicyVersionId']);
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
  const service = new EtlAcceptanceServiceV1(repo, ports);
  const result = await service.accept({
    tenantScope,
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
  const service = new EtlAcceptanceServiceV1(repo, ports);
  const first = await service.accept({
    tenantScope,
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

void test('[DDA-007] stale proposal partial output hash schema reject and policy failures', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedProposal(proposalService);
  await repo.update({ ...proposal, state: 'NEEDS_REVIEW', blockingReasons: ['BREAKING_TYPE_CHANGE'] });

  const staleService = new EtlAcceptanceServiceV1(repo, createPorts());
  const stale = await staleService.accept({
    tenantScope,
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
          async currentPolicyVersionId() {
            return '00000000-0000-4000-8000-000000000999';
          },
        },
      }),
      code: 'DDA_ETL_POLICY_CHANGED',
    },
    {
      name: 'jra-retry',
      ports: createPorts({
        jra: {
          async createTypedJob() {
            return { accepted: true, jobId: '00000000-0000-4000-8000-000000000304', replayed: false };
          },
          async awaitResultManifest() {
            return { accepted: false, code: 'JRA_RETRY' };
          },
        },
      }),
      code: 'DDA_ETL_JRA_RETRY',
    },
    {
      name: 'dsm',
      ports: createPorts({
        dsm: {
          async registerDatasetVersion() {
            return { accepted: false, code: 'DSM_REGISTER_FAILED' };
          },
        },
      }),
      code: 'DDA_ETL_DSM_FAILED',
    },
    {
      name: 'aud',
      ports: createPorts({
        aud: {
          async emit() {
            return { accepted: false, code: 'AUD_FAILED' };
          },
        },
      }),
      code: 'DDA_ETL_AUD_FAILED',
    },
  ];

  for (const item of cases) {
    const service = new EtlAcceptanceServiceV1(repo, item.ports);
    const result = await service.accept({
      tenantScope,
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
