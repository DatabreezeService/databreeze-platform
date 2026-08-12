import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryEtlProposalRepositoryAdapter } from '../../../src/features/dda/etl/adapter/in-memory-etl-proposal-repository.adapter.js';
import { AutomaticPreparationEnqueueService } from '../../../src/features/dda/etl/application/automatic-preparation-enqueue.service.js';
import { AutomaticPreparationService } from '../../../src/features/dda/etl/application/automatic-preparation.service.js';
import type { AutomaticPreparationProfileV1 } from '../../../src/features/dda/etl/application/automatic-preparation-policy.js';
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

const CONTENT_HASH = createHash('sha256').update('safe-prep-v1-accepted').digest('hex');
const SCHEMA_HASH = createHash('sha256').update('safe-prep-v1-schema').digest('hex');
const LINEAGE = [
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000301',
];

const safeProfile: AutomaticPreparationProfileV1 = {
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
};

function safePlanInput() {
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
        kind: 'CAST_TYPE',
        inputs: [plan['inputArtifactVersionId']],
        config: { field: 'amount', to: 'number' },
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

async function seedSafeProposal(proposalService: EtlProposalServiceV1) {
  const proposed = await proposalService.propose({
    planInput: safePlanInput(),
    reviewContext: {
      sourceSchema: ['name', 'amount'],
      inferredSchema: ['name', 'amount'],
      targetSchema: ['name', 'amount'],
      assumptions: ['safe trim and cast'],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 2, unchanged: 8, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 10 },
      qualityEffects: [
        {
          dimension: 'completeness',
          denominator: 10,
          coverage: 10,
          rule: 'required',
          expectation: 'present',
          sampleState: 'FULL',
          limitations: [],
          completeGateEligible: true,
        },
      ],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 10, memoryMb: 16 },
      aiSuggestions: [],
    },
  });
  assert.equal(proposed.accepted, true);
  return proposed.accepted ? proposed.value : (null as never);
}

function createPorts() {
  const jobs = new Map<string, string>();
  const iae: EtlIaePortV1 = {
    registerDerivative() {
      return Promise.resolve({
        accepted: true,
        artifactVersionId: '00000000-0000-4000-8000-000000000302',
      });
    },
  };
  const dsm: EtlDsmPortV1 = {
    registerDatasetVersion() {
      return Promise.resolve({
        accepted: true,
        datasetVersionId: '00000000-0000-4000-8000-000000000303',
        revision: 1,
      });
    },
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
          rowCount: 10,
          contentHash: CONTENT_HASH,
          schemaHash: SCHEMA_HASH,
          rejectBundleId: null,
          lineageIds: LINEAGE,
          partial: false,
        },
      });
    },
  };
  const bua: EtlBuaPortV1 = {
    admit() {
      return Promise.resolve({ accepted: true });
    },
  };
  const aud: EtlAudPortV1 = {
    emit() {
      return Promise.resolve({ accepted: true });
    },
  };
  const policy: EtlPolicyPortV1 = {
    currentPolicyVersionId() {
      return Promise.resolve(String(golden['dda-etl-plan']['dataModePolicyVersionId']));
    },
  };
  return { iae, dsm, jra, bua, aud, policy };
}

void test('[DDA-053] AUTO_ACCEPT_SAFE enqueues accepted JRA job and returns preparation summary', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedSafeProposal(proposalService);
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts());
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    proposalId: proposal.proposalId,
    profile: safeProfile,
    idempotencyKey: 'safe-prep-enqueue-1',
    correlationId: '00000000-0000-4000-8000-000000000501',
    expected: {
      rowCount: 10,
      rejectedCount: 0,
      contentHash: CONTENT_HASH,
      schemaHash: SCHEMA_HASH,
      lineageIds: LINEAGE,
    },
  });

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.kind, 'ENQUEUED');
  if (result.value.kind !== 'ENQUEUED') return;
  assert.equal(result.value.acceptance.datasetVersionId, '00000000-0000-4000-8000-000000000303');
  assert.equal(result.value.summary.counts.input, 10);
  assert.equal(result.value.summary.healthDimensions.length, 6);
  assert.equal(result.value.summary.percentageCorrectLabel, undefined);

  const stored = await repo.findById(proposal.proposalId);
  assert.equal(stored?.state, 'ACCEPTED');
});

void test('[DDA-053] REVIEW_REQUIRED leaves proposal for ETL review without enqueue', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedSafeProposal(proposalService);
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts());
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    proposalId: proposal.proposalId,
    profile: { ...safeProfile, sampledOnly: true },
    idempotencyKey: 'safe-prep-review-1',
    correlationId: '00000000-0000-4000-8000-000000000502',
    expected: {
      rowCount: 10,
      rejectedCount: 0,
      contentHash: CONTENT_HASH,
      schemaHash: SCHEMA_HASH,
      lineageIds: LINEAGE,
    },
  });

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.kind, 'ETL_REVIEW');
  const stored = await repo.findById(proposal.proposalId);
  assert.equal(stored?.state, 'READY_FOR_ACCEPTANCE');
});

void test('[DDA-053] BLOCKED creates stable review item reasons without enqueue', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedSafeProposal(proposalService);
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts());
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    proposalId: proposal.proposalId,
    profile: { ...safeProfile, sourceOverlap: true },
    idempotencyKey: 'safe-prep-blocked-1',
    correlationId: '00000000-0000-4000-8000-000000000503',
    expected: {
      rowCount: 10,
      rejectedCount: 0,
      contentHash: CONTENT_HASH,
      schemaHash: SCHEMA_HASH,
      lineageIds: LINEAGE,
    },
  });

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.kind, 'BLOCKED_REVIEW_ITEM');
  if (result.value.kind !== 'BLOCKED_REVIEW_ITEM') return;
  assert.ok(result.value.reasonCodes.includes('SOURCE_OVERLAP'));
  const stored = await repo.findById(proposal.proposalId);
  assert.equal(stored?.state, 'NEEDS_REVIEW');
  assert.ok(stored?.blockingReasons.includes('SOURCE_OVERLAP'));
});

void test('[DDA-053] post-run hash mismatch rejects automatic acceptance', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedSafeProposal(proposalService);
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts());
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    proposalId: proposal.proposalId,
    profile: safeProfile,
    idempotencyKey: 'safe-prep-mismatch-1',
    correlationId: '00000000-0000-4000-8000-000000000504',
    expected: {
      rowCount: 10,
      rejectedCount: 0,
      contentHash: createHash('sha256').update('wrong').digest('hex'),
      schemaHash: SCHEMA_HASH,
      lineageIds: LINEAGE,
    },
  });

  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'DDA_ETL_HASH_MISMATCH');
  const stored = await repo.findById(proposal.proposalId);
  assert.equal(stored?.state, 'NEEDS_REVIEW');
  assert.ok(stored?.blockingReasons.includes('EXECUTION_DIVERGED_FROM_PREVIEW'));
});
