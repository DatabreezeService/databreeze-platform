import assert from 'node:assert/strict';
import test from 'node:test';

import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import type { DdaEtlPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';
import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { IamEtlProposalAuthorityAdapter } from '../../../src/features/dda/etl/adapter/iam-etl-proposal-authority.adapter.js';
import type { IamDdaMutationAuthorizationSourceV1 } from '../../../src/features/dda/adapter/iam-dda-mutation-authorization.source.js';
import type { EtlProposalResourceResolverPortV1 } from '../../../src/features/dda/etl/application/etl-proposal-authority.port.js';
import type { EtlReviewContextV1 } from '../../../src/features/dda/etl/application/etl-proposal-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000701',
  workspace: '00000000-0000-4000-8000-000000000702',
  project: '00000000-0000-4000-8000-000000000703',
  actor: '00000000-0000-4000-8000-000000000704',
  correlation: '00000000-0000-4000-8000-000000000705',
  proposal: '00000000-0000-4000-8000-000000000706',
  planVersion: '00000000-0000-4000-8000-000000000707',
  artifact: '00000000-0000-4000-8000-000000000708',
  schema: '00000000-0000-4000-8000-000000000709',
  mapping: '00000000-0000-4000-8000-000000000710',
  rule: '00000000-0000-4000-8000-000000000711',
  engine: '00000000-0000-4000-8000-000000000712',
  policy: '00000000-0000-4000-8000-000000000713',
  retention: '00000000-0000-4000-8000-000000000714',
  evidence: '00000000-0000-4000-8000-000000000715',
});

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: ids.organization,
  workspaceId: ids.workspace,
  projectId: ids.project,
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const contextResult = createIamTenantContextV1({
  tenantScope,
  actorId: ids.actor,
  correlationId: ids.correlation,
  idempotencyKey: 'etl-proposal-authority-adapter',
  authorizationEpoch: 4,
  workspaceAuthorizationEpoch: 9,
  mfaReenrollmentRequired: false,
});
assert.equal(contextResult.accepted, true);
const context = contextResult.accepted ? contextResult.value : (null as never);

const canonicalPlanInput: Record<string, unknown> = {
  schemaVersion: 1,
  tenantScope,
  planId: ids.proposal,
  planVersionId: ids.planVersion,
  inputArtifactVersionId: ids.artifact,
  schemaVersionId: ids.schema,
  mappingVersionId: ids.mapping,
  ruleSetVersionId: ids.rule,
  engineBindingId: ids.engine,
  transformations: [
    {
      stepId: '00000000-0000-4000-8000-000000000716',
      kind: 'TRIM_TEXT',
      inputs: [ids.artifact],
      config: {},
    },
  ],
  contentHash: 'a'.repeat(64),
  schemaHash: 'b'.repeat(64),
  dataClassification: 'INTERNAL',
  dataModePolicyVersionId: ids.policy,
  retentionReferenceId: ids.retention,
  evidenceReferenceId: ids.evidence,
  createdAt: '2026-08-13T06:00:00.000Z',
};

void test('[DDA-006][IAM-DDA] ETL_PROPOSE maps to derived-create and resolves the exact artifact', async () => {
  const iamCalls: unknown[] = [];
  const resolverCalls: unknown[] = [];
  const source: IamDdaMutationAuthorizationSourceV1 = {
    authorize: (input) => {
      iamCalls.push(input);
      return Promise.resolve({ allowed: true });
    },
  };
  const resolver: EtlProposalResourceResolverPortV1 = {
    resolve: (input) => {
      resolverCalls.push(input);
      return Promise.resolve({
        accepted: true,
        value: {
          planInput: canonicalPlanInput,
          reviewContext: {} as EtlReviewContextV1,
        },
      });
    },
    reauthorize: () => Promise.resolve({ accepted: true }),
  };
  const adapter = new IamEtlProposalAuthorityAdapter(source, resolver);

  const result = await adapter.authorizeAndResolve({
    context,
    action: 'ETL_PROPOSE',
    planInput: {
      tenantScope,
      inputArtifactVersionId: ids.artifact,
      schemaVersionId: ids.schema,
      clientOnly: 'must-not-be-persisted',
    },
    reviewContext: {} as EtlReviewContextV1,
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(iamCalls, [
    {
      context,
      action: PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE,
      resourceIds: [ids.artifact],
    },
  ]);
  assert.deepEqual((resolverCalls[0] as { planInput: Record<string, unknown> }).planInput, {
    tenantScope,
    inputArtifactVersionId: ids.artifact,
    schemaVersionId: ids.schema,
    clientOnly: 'must-not-be-persisted',
  });
  assert.deepEqual(result.value.planInput, canonicalPlanInput);
});

void test('[DDA-006][IAM-DDA] ETL acceptance reauthorization repeats the exact artifact authority', async () => {
  const iamCalls: unknown[] = [];
  let reauthorized: unknown;
  const adapter = new IamEtlProposalAuthorityAdapter(
    {
      authorize: (input) => {
        iamCalls.push(input);
        return Promise.resolve({ allowed: true });
      },
    },
    {
      resolve: () =>
        Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' as const }),
      reauthorize: (input) => {
        reauthorized = input;
        return Promise.resolve({ accepted: true });
      },
    },
  );

  const plan = canonicalPlanInput as unknown as DdaEtlPlanV1;
  assert.deepEqual(
    await adapter.reauthorize({
      context,
      proposalId: ids.proposal,
      proposalRevision: 2,
      plan,
    }),
    { accepted: true },
  );
  assert.deepEqual((iamCalls[0] as { action: string; resourceIds: string[] }).resourceIds, [
    ids.artifact,
  ]);
  assert.equal((iamCalls[0] as { action: string }).action, PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE);
  assert.equal((reauthorized as { proposalId: string }).proposalId, ids.proposal);
  assert.equal((reauthorized as { proposalRevision: number }).proposalRevision, 2);
  assert.equal((reauthorized as { plan: DdaEtlPlanV1 }).plan, plan);
});
