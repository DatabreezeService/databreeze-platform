import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyAutomaticPreparation,
  type AutomaticPreparationProfileV1,
  type AutomaticPreparationPlanV1,
} from '../../../src/features/dda/etl/application/automatic-preparation-policy.js';
import { AutomaticPreparationService } from '../../../src/features/dda/etl/application/automatic-preparation.service.js';

const safePlan: AutomaticPreparationPlanV1 = {
  sourceColumns: ['name', 'amount'],
  steps: [
    {
      stepId: 'step-rename',
      kind: 'RENAME_COLUMNS',
      config: { mapping: 'name:name' },
      reversible: true,
      omitsRows: false,
    },
    {
      stepId: 'step-trim',
      kind: 'TRIM_TEXT',
      config: { field: 'name' },
      reversible: true,
      omitsRows: false,
    },
    {
      stepId: 'step-cast',
      kind: 'CAST_TYPE',
      config: { field: 'amount', to: 'number' },
      reversible: true,
      omitsRows: false,
    },
  ],
};

const safeProof = (stepId: string, config: Record<string, unknown>) => ({
  stepId,
  engineProduced: true as const,
  verifiedConfig: config,
  sourceColumns: ['name', 'amount'],
  outputColumns: ['name', 'amount'],
  lossless: true as const,
  reversible: true as const,
  exactAllColumnIdentity: false,
});

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
    safeProof('step-rename', { mapping: 'name:name' }),
    safeProof('step-trim', { field: 'name' }),
    safeProof('step-cast', { field: 'amount', to: 'number' }),
  ],
};

void test('[DDA-053] safe header aliases and type annotations auto-accept under SAFE_NON_LOSSY', () => {
  const result = classifyAutomaticPreparation(safePlan, safeProfile);
  assert.deepEqual(result, {
    decision: 'AUTO_ACCEPT_SAFE',
    reasonCodes: [],
  });
});

void test('[DDA-053] ambiguous date, currency, and duplicate-key changes require review', () => {
  assert.equal(
    classifyAutomaticPreparation(safePlan, {
      ...safeProfile,
      ambiguousMappings: 1,
    }).decision,
    'REVIEW_REQUIRED',
  );
  assert.equal(
    classifyAutomaticPreparation(safePlan, {
      ...safeProfile,
      currencyInference: true,
    }).decision,
    'REVIEW_REQUIRED',
  );
  assert.equal(
    classifyAutomaticPreparation(safePlan, {
      ...safeProfile,
      changedDuplicateKey: true,
    }).decision,
    'REVIEW_REQUIRED',
  );
});

void test('[DDA-053] row filters, rejects, overlap, and blocked quality dimensions block automatic acceptance', () => {
  assert.equal(
    classifyAutomaticPreparation(
      {
        sourceColumns: ['name', 'amount'],
        steps: [
          {
            stepId: 'step-filter',
            kind: 'FILTER_ROWS',
            config: { reason: 'invalid' },
            reversible: false,
            omitsRows: true,
          },
        ],
      },
      safeProfile,
    ).decision,
    'BLOCKED',
  );
  assert.equal(
    classifyAutomaticPreparation(safePlan, {
      ...safeProfile,
      omittedRows: 1,
      accounting: { ...safeProfile.accounting, output: 9, rejected: 1 },
    }).decision,
    'BLOCKED',
  );
  assert.equal(
    classifyAutomaticPreparation(safePlan, {
      ...safeProfile,
      sourceOverlap: true,
    }).decision,
    'BLOCKED',
  );
  assert.equal(
    classifyAutomaticPreparation(safePlan, {
      ...safeProfile,
      blockedQualityDimensions: ['validity'],
    }).decision,
    'BLOCKED',
  );
});

void test('[DDA-053] sampled profiles and source drift require review while accounting stays complete', () => {
  const sampled = classifyAutomaticPreparation(safePlan, {
    ...safeProfile,
    sampledOnly: true,
  });
  assert.equal(sampled.decision, 'REVIEW_REQUIRED');
  assert.ok(sampled.reasonCodes.includes('SAMPLED_PROFILE'));
  const drift = classifyAutomaticPreparation(safePlan, {
    ...safeProfile,
    sourceDrift: true,
  });
  assert.equal(drift.decision, 'REVIEW_REQUIRED');
  const brokenAccounting = classifyAutomaticPreparation(safePlan, {
    ...safeProfile,
    accounting: {
      input: 10,
      output: 9,
      unchanged: 8,
      changed: 1,
      rejected: 0,
      quarantined: 0,
      unsupported: 0,
    },
  });
  assert.equal(brokenAccounting.decision, 'BLOCKED');
  assert.ok(brokenAccounting.reasonCodes.includes('INCOMPLETE_ACCOUNTING'));
});

void test('[DDA-053] service routes auto-accept, review, and blocked decisions', () => {
  const service = new AutomaticPreparationService();
  assert.equal(service.classifyAndRoute(safePlan, safeProfile).kind, 'ENQUEUE_ACCEPTED_JOB');
  assert.equal(
    service.classifyAndRoute(safePlan, { ...safeProfile, sampledOnly: true }).kind,
    'ETL_REVIEW',
  );
  assert.equal(
    service.classifyAndRoute(
      {
        sourceColumns: ['name', 'amount'],
        steps: [
          {
            stepId: 'step-filter',
            kind: 'FILTER_ROWS',
            config: { reason: 'invalid' },
            reversible: false,
            omitsRows: true,
          },
        ],
      },
      safeProfile,
    ).kind,
    'BLOCKED_REVIEW_ITEM',
  );
});

void test('[DDA-053] actual transformation configs require proof of reversibility', () => {
  for (const kind of ['SELECT_COLUMNS', 'CAST_TYPE', 'TRIM_TEXT', 'NORMALIZE_TEXT']) {
    const result = classifyAutomaticPreparation(
      {
        steps: [
          {
            stepId: `step-${kind}`,
            kind,
            config: kind === 'SELECT_COLUMNS' ? { columns: ['id'] } : { field: 'value' },
            reversible: true,
            omitsRows: false,
          },
        ],
      } as never,
      safeProfile,
    );
    assert.notEqual(result.decision, 'AUTO_ACCEPT_SAFE', kind);
  }
});
