import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { AutomaticPreparationController } from '../../../src/features/dda/etl/api/automatic-preparation.controller.js';
import { AutomaticPreparationEnqueueService } from '../../../src/features/dda/etl/application/automatic-preparation-enqueue.service.js';
import { AutomaticPreparationService } from '../../../src/features/dda/etl/application/automatic-preparation.service.js';
import { classifyAutomaticPreparation } from '../../../src/features/dda/etl/application/automatic-preparation-policy.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const request = { headers: { authorization: 'Bearer verified-request' } };
const requestContext: RequestTenantContextPortV1 = {
  resolve: () =>
    Promise.resolve({
      tenantScope,
      actorId: '00000000-0000-4000-8000-000000000004' as never,
      correlationId: '00000000-0000-4000-8000-000000000005' as never,
      idempotencyKey: 'trusted-request-key',
      authorizationEpoch: 7,
      mfaReenrollmentRequired: false,
    }),
};

const proposalId = '00000000-0000-4000-8000-000000000201';
const profile = {
  policy: 'SAFE_NON_LOSSY' as const,
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
  stepProofs: [],
};

const expected = {
  rowCount: 1,
  rejectedCount: 0,
  contentHash: 'a'.repeat(64),
  schemaHash: 'b'.repeat(64),
  lineageIds: ['00000000-0000-4000-8000-000000000012'],
};

function scopedProposalRecord(revision = 3) {
  return {
    proposalId,
    revision,
    state: 'READY_FOR_ACCEPTANCE' as const,
    blockingReasons: [],
    plan: {
      planVersionId: '00000000-0000-4000-8000-000000000202',
      inputArtifactVersionId: '00000000-0000-4000-8000-000000000203',
      dataModePolicyVersionId: '00000000-0000-4000-8000-000000000204',
      transformations: [],
    },
    review: { exclusions: [], qualityEffects: [] },
  };
}

function scopedProposal() {
  return {
    findById: () => Promise.resolve(scopedProposalRecord()),
    save: (value: unknown) => Promise.resolve(value),
    update: (value: unknown) => Promise.resolve(value),
    reserveAcceptance: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_COMMAND_UNAVAILABLE' as const }),
    completeAcceptance: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_COMMAND_UNAVAILABLE' as const }),
    releaseAcceptance: () => Promise.resolve(),
  };
}

function authorities(policy: unknown) {
  return {
    profile: {
      resolve: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            tenantScope,
            proposalId: proposalId as never,
            proposalRevision: 3,
            planVersionId: '00000000-0000-4000-8000-000000000202' as never,
            inputArtifactVersionId: '00000000-0000-4000-8000-000000000203' as never,
            profileId: '00000000-0000-4000-8000-000000000205' as never,
            profileVersionId: '00000000-0000-4000-8000-000000000206' as never,
            engineProduced: true as const,
            immutable: true as const,
            profile,
            expected,
          },
        }),
    },
    policy,
    dataset: {
      resolve: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            tenantScope,
            datasetId: '00000000-0000-4000-8000-000000000207' as never,
            datasetVersionId: '00000000-0000-4000-8000-000000000208' as never,
            inputArtifactVersionId: '00000000-0000-4000-8000-000000000203' as never,
            sourceColumns: ['value'],
            contentHash: expected.contentHash,
            schemaHash: expected.schemaHash,
            lineageIds: expected.lineageIds as never,
            immutableOriginal: true as const,
          },
        }),
    },
  };
}

void test('[DDA-053][IAM-002] automatic preparation accepts only proposal id, idempotency key, and revision from HTTP', async () => {
  let received: Record<string, unknown> | undefined;
  const controller = new AutomaticPreparationController(
    {
      evaluateAndMaybeEnqueue: (input: Record<string, unknown>) => {
        received = input;
        return Promise.resolve({
          accepted: true as const,
          value: {
            kind: 'ETL_REVIEW' as const,
            classification: {
              decision: 'REVIEW_REQUIRED' as const,
              reasonCodes: ['SAMPLED_PROFILE'],
            },
            proposalId,
          },
        });
      },
    } as never,
    requestContext,
    scopedProposal() as never,
  );

  const response = await controller.evaluate(request, {
    proposalId,
    idempotencyKey: 'browser-idempotency-key',
    expectedRevision: 3,
  } as never);

  assert.equal(response.kind, 'ETL_REVIEW');
  assert.deepEqual(received, {
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004',
    proposalId,
    idempotencyKey: 'browser-idempotency-key',
    expectedRevision: 3,
    correlationId: '00000000-0000-4000-8000-000000000005' as never,
  });
});

void test('[DDA-053][IAM-002] rejects a browser-supplied safe profile and accounting evidence', async () => {
  const controller = new AutomaticPreparationController(
    {
      evaluateAndMaybeEnqueue: () =>
        Promise.resolve({
          accepted: true as const,
          value: {
            kind: 'ETL_REVIEW' as const,
            classification: { decision: 'REVIEW_REQUIRED' as const, reasonCodes: [] },
            proposalId,
          },
        }),
    } as never,
    requestContext,
    scopedProposal() as never,
  );

  await assert.rejects(
    controller.evaluate(request, {
      proposalId,
      idempotencyKey: 'browser-idempotency-key',
      expectedRevision: 3,
      profile,
      correlationId: '00000000-0000-4000-8000-000000000005',
      expected,
    } as never),
    (error: unknown) => error instanceof BadRequestException,
  );
});

void test('[DDA-053] step labels never prove SELECT_COLUMNS, CAST_TYPE, TRIM_TEXT, or NORMALIZE_TEXT non-lossy', () => {
  for (const kind of ['SELECT_COLUMNS', 'CAST_TYPE', 'TRIM_TEXT', 'NORMALIZE_TEXT']) {
    const classification = classifyAutomaticPreparation(
      {
        steps: [
          {
            kind,
            config: kind === 'SELECT_COLUMNS' ? { columns: ['id'] } : { field: 'value' },
            reversible: true,
            omitsRows: false,
          },
        ],
      } as never,
      profile,
    );
    assert.notEqual(classification.decision, 'AUTO_ACCEPT_SAFE', kind);
  }
});

void test('[DDA-053][IAM-019] server authority outage, Viewer authorization, and stale revision fail closed before acceptance', async () => {
  const acceptanceCalls: unknown[] = [];
  const acceptance = {
    accept: (input: unknown) => {
      acceptanceCalls.push(input);
      return Promise.resolve({
        accepted: true as const,
        value: {
          proposalId,
          jobId: '00000000-0000-4000-8000-000000000304',
          artifactVersionId: '00000000-0000-4000-8000-000000000302',
          datasetVersionId: '00000000-0000-4000-8000-000000000303',
          rowCount: 1,
          contentHash: 'a'.repeat(64),
          schemaHash: 'b'.repeat(64),
          lineageIds: expected.lineageIds,
          replayed: false,
        },
      });
    },
  };
  const serverProfile = {
    resolve: () => Promise.resolve({ accepted: true as const, value: { profile, proposalId } }),
  };
  const policyOutage = {
    resolve: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_POLICY_UNAVAILABLE' as const }),
    recheck: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_POLICY_UNAVAILABLE' as const }),
  };
  const enqueue = Reflect.construct(AutomaticPreparationEnqueueService, [
    new AutomaticPreparationService(),
    scopedProposal(),
    acceptance,
    { ...authorities(policyOutage), profile: serverProfile },
  ]) as AutomaticPreparationEnqueueService;

  const outage = await enqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004',
    proposalId,
    idempotencyKey: 'server-key',
    expectedRevision: 3,
    correlationId: '00000000-0000-4000-8000-000000000005' as never,
  } as never);
  assert.deepEqual(outage, { accepted: false, code: 'DDA_ETL_POLICY_UNAVAILABLE' });
  assert.equal(acceptanceCalls.length, 0);

  const viewerDenied = {
    resolve: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_UNAUTHORIZED' as const }),
    recheck: () =>
      Promise.resolve({ accepted: false as const, code: 'DDA_ETL_UNAUTHORIZED' as const }),
  };
  const viewerEnqueue = Reflect.construct(AutomaticPreparationEnqueueService, [
    new AutomaticPreparationService(),
    scopedProposal(),
    acceptance,
    { ...authorities(viewerDenied), profile: serverProfile },
  ]) as AutomaticPreparationEnqueueService;
  const denied = await viewerEnqueue.evaluateAndMaybeEnqueue({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004',
    proposalId,
    idempotencyKey: 'viewer-key',
    expectedRevision: 3,
    correlationId: '00000000-0000-4000-8000-000000000005' as never,
  } as never);
  assert.deepEqual(denied, { accepted: false, code: 'DDA_ETL_UNAUTHORIZED' });
  assert.equal(acceptanceCalls.length, 0);

  const staleRepository = {
    ...scopedProposal(),
    findById: () => Promise.resolve({ ...scopedProposalRecord(), revision: 4 }),
  };
  const stale = Reflect.construct(AutomaticPreparationEnqueueService, [
    new AutomaticPreparationService(),
    staleRepository,
    acceptance,
    authorities({
      resolve: () => Promise.resolve({ accepted: true as const, value: {} }),
      recheck: () => Promise.resolve({ accepted: true as const, value: {} }),
    }),
  ]) as AutomaticPreparationEnqueueService;
  const staleResult = await stale.evaluateAndMaybeEnqueue({
    tenantScope,
    actorId: '00000000-0000-4000-8000-000000000004',
    proposalId,
    idempotencyKey: 'stale-key',
    expectedRevision: 3,
    correlationId: '00000000-0000-4000-8000-000000000005' as never,
  } as never);
  assert.deepEqual(staleResult, { accepted: false, code: 'DDA_ETL_REVISION_CONFLICT' });
  assert.equal(acceptanceCalls.length, 0);
});

void test('[DDA-053][IAM-019] missing request authentication fails closed before service evaluation', async () => {
  let evaluated = false;
  const controller = new AutomaticPreparationController(
    {
      evaluateAndMaybeEnqueue: () => {
        evaluated = true;
        return Promise.resolve({
          accepted: true as const,
          value: {
            kind: 'ETL_REVIEW' as const,
            classification: { decision: 'REVIEW_REQUIRED' as const, reasonCodes: [] },
            proposalId,
          },
        });
      },
    } as never,
    undefined,
    scopedProposal() as never,
  );

  await assert.rejects(
    controller.evaluate(request, {
      proposalId,
      idempotencyKey: 'missing-auth-key',
      expectedRevision: 3,
    }),
    (error: unknown) =>
      error instanceof Error &&
      'getStatus' in error &&
      (error as { getStatus(): number }).getStatus() === 503,
  );
  assert.equal(evaluated, false);
});
