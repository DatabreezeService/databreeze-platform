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

const CONTENT_HASH = createHash('sha256').update('safe-prep-v1-accepted').digest('hex');
const SCHEMA_HASH = createHash('sha256').update('safe-prep-v1-schema').digest('hex');
const LINEAGE = ['00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000301'];

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
  stepProofs: [
    {
      stepId: '00000000-0000-4000-8000-000000000017',
      engineProduced: true,
      verifiedConfig: { field: 'name' },
      sourceColumns: ['name', 'amount'],
      outputColumns: ['name', 'amount'],
      lossless: true,
      reversible: true,
      exactAllColumnIdentity: false,
    },
    {
      stepId: '00000000-0000-4000-8000-000000000018',
      engineProduced: true,
      verifiedConfig: { field: 'amount', to: 'number' },
      sourceColumns: ['name', 'amount'],
      outputColumns: ['name', 'amount'],
      lossless: true,
      reversible: true,
      exactAllColumnIdentity: false,
    },
  ],
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

const allowEtlAcceptance = {
  authorize: () => Promise.resolve({ accepted: true as const }),
};
const allowEtlProposalAuthority: EtlProposalAuthorityPortV1 = {
  authorizeAndResolve(input) {
    return Promise.resolve({
      accepted: true as const,
      value: { planInput: input.planInput, reviewContext: input.reviewContext },
    });
  },
  reauthorize: () => Promise.resolve({ accepted: true as const }),
};

function createAuthorities(
  proposal: { readonly proposalId: string; readonly plan: unknown },
  profile = safeProfile,
  expectedOverride: Partial<{
    readonly rowCount: number;
    readonly rejectedCount: number;
    readonly contentHash: string;
    readonly schemaHash: string;
    readonly lineageIds: readonly string[];
  }> = {},
) {
  const plan = proposal.plan as Record<string, string>;
  const expected = {
    rowCount: profile.accounting.output,
    rejectedCount: profile.accounting.rejected,
    contentHash: expectedOverride.contentHash ?? CONTENT_HASH,
    schemaHash: expectedOverride.schemaHash ?? SCHEMA_HASH,
    lineageIds: expectedOverride.lineageIds ?? LINEAGE,
    ...expectedOverride,
  };
  return {
    profile: {
      resolve: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            tenantScope,
            proposalId: proposal.proposalId as never,
            proposalRevision: 1,
            planVersionId: plan['planVersionId'] as never,
            inputArtifactVersionId: plan['inputArtifactVersionId'] as never,
            profileId: '00000000-0000-4000-8000-000000000601' as never,
            profileVersionId: '00000000-0000-4000-8000-000000000602' as never,
            engineProduced: true as const,
            immutable: true as const,
            profile,
            expected,
          },
        }),
    },
    policy: {
      resolve: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            tenantScope,
            authorized: true as const,
            policyVersionId: plan['dataModePolicyVersionId'] as never,
            automaticPolicy: 'SAFE_NON_LOSSY' as const,
            authorizationEpoch: 1,
          },
        }),
      recheck: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            tenantScope,
            authorized: true as const,
            policyVersionId: plan['dataModePolicyVersionId'] as never,
            automaticPolicy: 'SAFE_NON_LOSSY' as const,
            authorizationEpoch: 1,
          },
        }),
    },
    dataset: {
      resolve: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            tenantScope,
            datasetId: '00000000-0000-4000-8000-000000000603' as never,
            datasetVersionId: '00000000-0000-4000-8000-000000000604' as never,
            inputArtifactVersionId: plan['inputArtifactVersionId'] as never,
            sourceColumns: ['name', 'amount'],
            contentHash: expected.contentHash,
            schemaHash: expected.schemaHash,
            lineageIds: expected.lineageIds as never,
            immutableOriginal: true as const,
          },
        }),
    },
  };
}

void test('[DDA-053] AUTO_ACCEPT_SAFE enqueues accepted JRA job and returns preparation summary', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedSafeProposal(proposalService);
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts(), {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
    createAuthorities(proposal),
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004' as never,
    proposalId: proposal.proposalId,
    idempotencyKey: 'safe-prep-enqueue-1',
    expectedRevision: proposal.revision,
    correlationId: '00000000-0000-4000-8000-000000000501' as never,
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
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts(), {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
    createAuthorities(proposal, { ...safeProfile, sampledOnly: true }),
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004' as never,
    proposalId: proposal.proposalId,
    idempotencyKey: 'safe-prep-review-1',
    expectedRevision: proposal.revision,
    correlationId: '00000000-0000-4000-8000-000000000502' as never,
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
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts(), {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
    createAuthorities(proposal, { ...safeProfile, sourceOverlap: true }),
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004' as never,
    proposalId: proposal.proposalId,
    idempotencyKey: 'safe-prep-blocked-1',
    expectedRevision: proposal.revision,
    correlationId: '00000000-0000-4000-8000-000000000503' as never,
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
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts(), {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
    createAuthorities(proposal, safeProfile, {
      contentHash: createHash('sha256').update('wrong').digest('hex'),
    }),
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004' as never,
    proposalId: proposal.proposalId,
    idempotencyKey: 'safe-prep-mismatch-1',
    expectedRevision: proposal.revision,
    correlationId: '00000000-0000-4000-8000-000000000504' as never,
  });

  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.code, 'DDA_ETL_HASH_MISMATCH');
  const stored = await repo.findById(proposal.proposalId);
  assert.equal(stored?.state, 'NEEDS_REVIEW');
  assert.ok(stored?.blockingReasons.includes('EXECUTION_DIVERGED_FROM_PREVIEW'));
});

void test('[DDA-053] server rejects profile accounting that disagrees with the immutable evidence', async () => {
  const repo = new InMemoryEtlProposalRepositoryAdapter();
  const proposalService = new EtlProposalServiceV1(repo);
  const proposal = await seedSafeProposal(proposalService);
  const acceptance = new EtlAcceptanceServiceV1(repo, createPorts(), {
    authorization: allowEtlAcceptance,
    proposalAuthority: allowEtlProposalAuthority,
  });
  const enqueue = new AutomaticPreparationEnqueueService(
    new AutomaticPreparationService(),
    repo,
    acceptance,
    createAuthorities(proposal, safeProfile, { rowCount: 9 }),
  );

  const result = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004' as never,
    proposalId: proposal.proposalId,
    idempotencyKey: 'safe-prep-accounting-mismatch-1',
    expectedRevision: proposal.revision,
    correlationId: '00000000-0000-4000-8000-000000000505' as never,
  });

  assert.deepEqual(result, { accepted: false, code: 'DDA_ETL_PROFILE_INVALID' });
});
