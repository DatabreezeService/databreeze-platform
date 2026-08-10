import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { createDdaEtlPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import { InMemoryEtlProposalRepositoryAdapter } from '../../../src/features/dda/etl/adapter/in-memory-etl-proposal-repository.adapter.js';
import { EtlProposalServiceV1 } from '../../../src/features/dda/etl/application/etl-proposal.service.js';

const fixtureRoot = resolve(process.cwd(), '../../packages/contracts/test/fixtures/dda/v1');
const golden = JSON.parse(readFileSync(resolve(fixtureRoot, 'golden-valid.json'), 'utf8')) as {
  readonly 'dda-etl-plan': Record<string, unknown>;
};
const invalidCode = JSON.parse(
  readFileSync(resolve(fixtureRoot, 'invalid-arbitrary-code.json'), 'utf8'),
) as Record<string, unknown>;
const invalidCrossTenant = JSON.parse(
  readFileSync(resolve(fixtureRoot, 'invalid-cross-tenant.json'), 'utf8'),
) as Record<string, unknown>;

function validPlanInput(overrides: Record<string, unknown> = {}) {
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
    ],
    contentHash: plan['contentHash'],
    schemaHash: plan['schemaHash'],
    dataClassification: plan['dataClassification'],
    dataModePolicyVersionId: plan['dataModePolicyVersionId'],
    retentionReferenceId: plan['retentionReferenceId'],
    evidenceReferenceId: plan['evidenceReferenceId'],
    createdAt: plan['createdAt'],
    ...overrides,
  };
}

function createService() {
  return new EtlProposalServiceV1(new InMemoryEtlProposalRepositoryAdapter());
}

void test('[DDA-005] rejects arbitrary code fields from frozen invalid fixture', async () => {
  const service = createService();
  const created = createDdaEtlPlanV1({
    planId: invalidCode['planId'],
    planVersionId: invalidCode['planVersionId'],
    tenantScope: invalidCode['tenantScope'],
    inputArtifactVersionId: invalidCode['inputArtifactVersionId'],
    schemaVersionId: invalidCode['schemaVersionId'],
    mappingVersionId: invalidCode['mappingVersionId'],
    ruleSetVersionId: invalidCode['ruleSetVersionId'],
    engineBindingId: invalidCode['engineBindingId'],
    transformations: invalidCode['transformations'],
    contentHash: invalidCode['contentHash'],
    schemaHash: invalidCode['schemaHash'],
    dataClassification: invalidCode['dataClassification'],
    dataModePolicyVersionId: invalidCode['dataModePolicyVersionId'],
    retentionReferenceId: invalidCode['retentionReferenceId'],
    evidenceReferenceId: invalidCode['evidenceReferenceId'],
    createdAt: invalidCode['createdAt'],
  });
  assert.equal(created.accepted, false);
  if (!created.accepted) assert.equal(created.code, 'UNSUPPORTED_TRANSFORM');

  const result = await service.propose({
    planInput: {
      ...invalidCode,
      transformations: [
        {
          stepId: '00000000-0000-4000-8000-000000000017',
          kind: 'EXECUTE_SQL',
          inputs: [invalidCode['inputArtifactVersionId']],
          config: { code: 'drop table sales' },
        },
      ],
    },
    reviewContext: {
      sourceSchema: ['name', 'amount'],
      inferredSchema: ['name', 'amount'],
      targetSchema: ['name', 'amount'],
      assumptions: ['trim name'],
      beforeSample: [{ name: ' A ' }],
      afterSample: [{ name: 'A' }],
      counts: { changed: 1, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 1 },
      qualityEffects: [],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 10, memoryMb: 32 },
      aiSuggestions: [],
    },
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_ETL_ARBITRARY_CODE');
});

void test('[DDA-005] rejects cycles and missing exact version bindings', async () => {
  const service = createService();
  const cyclic = await service.propose({
    planInput: validPlanInput({
      transformations: [
        {
          stepId: '00000000-0000-4000-8000-000000000031',
          kind: 'TRIM_TEXT',
          inputs: ['00000000-0000-4000-8000-000000000032'],
          config: { field: 'name' },
        },
        {
          stepId: '00000000-0000-4000-8000-000000000032',
          kind: 'NORMALIZE_TEXT',
          inputs: ['00000000-0000-4000-8000-000000000031'],
          config: { field: 'name' },
        },
      ],
    }),
    reviewContext: {
      sourceSchema: ['name'],
      inferredSchema: ['name'],
      targetSchema: ['name'],
      assumptions: [],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 0, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 0 },
      qualityEffects: [],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 1, memoryMb: 1 },
      aiSuggestions: [],
    },
  });
  assert.equal(cyclic.accepted, false);
  if (!cyclic.accepted) assert.equal(cyclic.code, 'DDA_ETL_CYCLE');

  const missing = await service.propose({
    planInput: validPlanInput({ engineBindingId: undefined }),
    reviewContext: {
      sourceSchema: ['name'],
      inferredSchema: ['name'],
      targetSchema: ['name'],
      assumptions: [],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 0, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 0 },
      qualityEffects: [],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 1, memoryMb: 1 },
      aiSuggestions: [],
    },
  });
  assert.equal(missing.accepted, false);
  if (!missing.accepted) assert.equal(missing.code, 'DDA_ETL_MISSING_VERSION_BINDING');
});

void test('[DDA-005] rejects unstable transform order', async () => {
  const service = createService();
  const result = await service.propose({
    planInput: validPlanInput({
      transformations: [
        {
          stepId: '00000000-0000-4000-8000-000000000042',
          kind: 'AGGREGATE',
          inputs: [golden['dda-etl-plan']['inputArtifactVersionId']],
          config: { grain: 'day' },
        },
        {
          stepId: '00000000-0000-4000-8000-000000000041',
          kind: 'TRIM_TEXT',
          inputs: [golden['dda-etl-plan']['inputArtifactVersionId']],
          config: { field: 'name' },
        },
      ],
    }),
    reviewContext: {
      sourceSchema: ['name'],
      inferredSchema: ['name'],
      targetSchema: ['name'],
      assumptions: [],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 0, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 0 },
      qualityEffects: [],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 1, memoryMb: 1 },
      aiSuggestions: [],
    },
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_ETL_UNSTABLE_ORDER');
});

void test('[DDA-011] material drift and ambiguous headers force review', async () => {
  const service = createService();
  const result = await service.propose({
    planInput: validPlanInput(),
    reviewContext: {
      sourceSchema: ['Customer Name', 'customer_name', 'amount'],
      inferredSchema: ['customer_name', 'amount'],
      targetSchema: ['customer_name', 'amount'],
      assumptions: [],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 0, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 0 },
      qualityEffects: [],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 1, memoryMb: 1 },
      aiSuggestions: [],
      driftSignals: [
        'AMBIGUOUS_HEADER',
        'BREAKING_TYPE_CHANGE',
        'OVERLAP_PERIOD',
        'DUPLICATE_KEY_CHANGE',
      ],
    },
  });
  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.equal(result.value.state, 'NEEDS_REVIEW');
    assert.ok(result.value.blockingReasons.includes('AMBIGUOUS_HEADER'));
    assert.ok(result.value.blockingReasons.includes('BREAKING_TYPE_CHANGE'));
  }
});

void test('[DDA-008] rejected or truncated scopes cannot satisfy a complete gate', async () => {
  const service = createService();
  const result = await service.propose({
    planInput: validPlanInput(),
    reviewContext: {
      sourceSchema: ['name'],
      inferredSchema: ['name'],
      targetSchema: ['name'],
      assumptions: ['filter invalid amounts'],
      beforeSample: [{ name: 'a' }],
      afterSample: [{ name: 'a' }],
      counts: { changed: 0, unchanged: 1, rejected: 2 },
      exclusions: [{ scope: 'row', reasonCode: 'INVALID_AMOUNT', count: 2 }],
      unsupportedScopes: [{ scope: 'sheet:hidden', reasonCode: 'UNSUPPORTED_SHEET', count: 1 }],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 1 },
      qualityEffects: [
        {
          dimension: 'completeness',
          denominator: 3,
          coverage: 1,
          rule: 'non_null_name',
          expectation: 'all rows',
          sampleState: 'PARTIAL',
          limitations: ['rejected rows excluded from numerator'],
          completeGateEligible: true,
        },
      ],
      evidenceStatus: 'PARTIAL',
      estimatedCost: { cpuMs: 12, memoryMb: 16 },
      aiSuggestions: [],
    },
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_ETL_INCOMPLETE_GATE');
});

void test('[DDA-008] undisclosed sampling is rejected', async () => {
  const service = createService();
  const result = await service.propose({
    planInput: validPlanInput(),
    reviewContext: {
      sourceSchema: ['name'],
      inferredSchema: ['name'],
      targetSchema: ['name'],
      assumptions: [],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 0, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: false, method: 'HEAD', seed: 0, rowCount: 10 },
      qualityEffects: [],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 1, memoryMb: 1 },
      aiSuggestions: [],
    },
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_ETL_UNDISCLOSED_SAMPLING');
});

void test('[DDA-009][DDA-010] quality dimensions stay separate and never claim percentage correct', async () => {
  const service = createService();
  const result = await service.propose({
    planInput: validPlanInput(),
    reviewContext: {
      sourceSchema: ['name', 'amount'],
      inferredSchema: ['name', 'amount'],
      targetSchema: ['name', 'amount'],
      assumptions: ['amount is VND integer'],
      beforeSample: [{ name: ' A ', amount: '120000' }],
      afterSample: [{ name: 'A', amount: 120000 }],
      counts: { changed: 1, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 1 },
      qualityEffects: [
        {
          dimension: 'completeness',
          denominator: 2,
          coverage: 2,
          rule: 'required_fields_present',
          expectation: '2/2',
          sampleState: 'FULL',
          limitations: ['fixture-backed'],
          completeGateEligible: true,
        },
        {
          dimension: 'validity',
          denominator: 2,
          coverage: 2,
          rule: 'amount_integer',
          expectation: 'parseable',
          sampleState: 'FULL',
          limitations: ['locale vi-VN'],
          completeGateEligible: true,
        },
        {
          dimension: 'uniqueness',
          denominator: 1,
          coverage: 1,
          rule: 'name_key',
          expectation: 'unique',
          sampleState: 'FULL',
          limitations: [],
          completeGateEligible: true,
        },
        {
          dimension: 'consistency',
          denominator: 1,
          coverage: 1,
          rule: 'schema_match',
          expectation: 'compatible',
          sampleState: 'FULL',
          limitations: [],
          completeGateEligible: true,
        },
        {
          dimension: 'freshness',
          denominator: 1,
          coverage: 1,
          rule: 'source_mtime_bound',
          expectation: 'known',
          sampleState: 'FULL',
          limitations: ['no wall-clock freshness claim'],
          completeGateEligible: true,
        },
        {
          dimension: 'extraction_confidence',
          denominator: 1,
          coverage: 1,
          rule: 'deterministic_parse',
          expectation: 'bound',
          sampleState: 'FULL',
          limitations: ['not factual correctness'],
          completeGateEligible: true,
        },
      ],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 25, memoryMb: 64 },
      aiSuggestions: [
        {
          label: 'AI_MAPPING_PROPOSAL',
          authoritative: false,
          summary: 'Suggest rename Customer to name',
        },
      ],
      overallQualitySummary: {
        formula: 'min(coverage/denominator across dimensions)',
        weights: { completeness: 1, validity: 1 },
        missingDimensionBehavior: 'block',
        coverage: 1,
        provesFactualCorrectness: false,
      },
    },
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  const dimensions = result.value.review.qualityEffects.map((item) => item.dimension);
  assert.deepEqual(dimensions.sort(), [
    'completeness',
    'consistency',
    'extraction_confidence',
    'freshness',
    'uniqueness',
    'validity',
  ]);
  assert.equal(result.value.review.overallQualitySummary?.provesFactualCorrectness, false);
  assert.doesNotMatch(JSON.stringify(result.value), /percentage correct|% correct/iu);
  assert.equal(result.value.review.aiSuggestions[0]?.authoritative, false);
  assert.equal(result.value.state, 'READY_FOR_ACCEPTANCE');
});

void test('[DDA-005] persists allowlisted golden plan proposal', async () => {
  const service = createService();
  void invalidCrossTenant;
  const cross = createDdaEtlPlanV1({
    ...validPlanInput(),
    inputTenantScope: {
      scopeType: 'project',
      organizationId: '00000000-0000-4000-8000-000000000099',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      projectId: '00000000-0000-4000-8000-000000000003',
    },
  });
  assert.equal(cross.accepted, false);
  if (!cross.accepted) assert.equal(cross.code, 'CROSS_SCOPE_REFERENCE');

  const result = await service.propose({
    planInput: validPlanInput(),
    reviewContext: {
      sourceSchema: ['name'],
      inferredSchema: ['name'],
      targetSchema: ['name'],
      assumptions: ['trim whitespace'],
      beforeSample: [{ name: ' A ' }],
      afterSample: [{ name: 'A' }],
      counts: { changed: 1, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD', seed: 0, rowCount: 1 },
      qualityEffects: [
        {
          dimension: 'completeness',
          denominator: 1,
          coverage: 1,
          rule: 'required',
          expectation: 'present',
          sampleState: 'FULL',
          limitations: [],
          completeGateEligible: true,
        },
      ],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 5, memoryMb: 8 },
      aiSuggestions: [],
    },
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  const plan = result.value.plan as { transformations: Array<{ kind: string }> };
  assert.equal(plan.transformations[0]?.kind, 'TRIM_TEXT');
  const loaded = await service.getProposal(result.value.proposalId);
  assert.equal(loaded.accepted, true);
});
