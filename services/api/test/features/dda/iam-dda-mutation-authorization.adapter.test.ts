import assert from 'node:assert/strict';
import test from 'node:test';

import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import {
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { IamEtlAcceptanceAuthorizationAdapter } from '../../../src/features/dda/etl/adapter/iam-etl-acceptance-authorization.adapter.js';
import { IamReceiptMutationAuthorizationAdapter } from '../../../src/features/dda/receipt/adapter/iam-receipt-mutation-authorization.adapter.js';
import type {
  IamDdaMutationAuthorizationDecisionV1,
  IamDdaMutationAuthorizationSourceV1,
} from '../../../src/features/dda/adapter/iam-dda-mutation-authorization.source.js';
import {
  createIamTenantContextV1,
  type IamTenantContextV1,
} from '../../../src/features/iam/application/tenant-context.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-00000000e101',
  workspaceId: '00000000-0000-4000-8000-00000000e102',
  projectId: '00000000-0000-4000-8000-00000000e103',
});
if (!scopeResult.accepted) throw new Error('valid DDA IAM scope fixture was rejected');
const scope = scopeResult.value;

const foreignScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-00000000e101',
  workspaceId: '00000000-0000-4000-8000-00000000e102',
  projectId: '00000000-0000-4000-8000-00000000e109',
});
if (!foreignScopeResult.accepted) throw new Error('foreign DDA IAM scope fixture was rejected');
const foreignScope = foreignScopeResult.value;

const ACTOR_ID = '00000000-0000-4000-8000-00000000e104';
const CORRELATION_ID = '00000000-0000-4000-8000-00000000e105';
const ARTIFACT_VERSION_ID = '00000000-0000-4000-8000-00000000e106';
const CANDIDATE_ID = '00000000-0000-4000-8000-00000000e107';
const PROPOSAL_ID = '00000000-0000-4000-8000-00000000e108';

function contextFor(
  tenantScope: TenantScopeV1 = scope,
  overrides: Readonly<{
    readonly actorId?: string;
    readonly authorizationEpoch?: number;
    readonly workspaceAuthorizationEpoch?: number;
  }> = {},
): IamTenantContextV1 {
  const result = createIamTenantContextV1({
    tenantScope,
    actorId: overrides.actorId ?? ACTOR_ID,
    correlationId: CORRELATION_ID,
    idempotencyKey: 'dda-iam-mutation-test',
    authorizationEpoch: overrides.authorizationEpoch ?? 3,
    workspaceAuthorizationEpoch: overrides.workspaceAuthorizationEpoch ?? 7,
    mfaReenrollmentRequired: false,
  });
  if (!result.accepted) throw new Error('valid DDA IAM context fixture was rejected');
  return result.value;
}

type CanonicalRoleV1 = 'OWNER' | 'EDITOR' | 'VIEWER';

interface CanonicalIamStateV1 {
  readonly scope: TenantScopeV1;
  readonly actorId: string;
  readonly authorizationEpoch: number;
  readonly workspaceAuthorizationEpoch: number;
  readonly role: CanonicalRoleV1;
  readonly currentMember: boolean;
}

function canonicalIamSource(state: CanonicalIamStateV1): {
  readonly source: IamDdaMutationAuthorizationSourceV1;
  readonly calls: Array<Parameters<IamDdaMutationAuthorizationSourceV1['authorize']>[0]>;
} {
  const calls: Array<Parameters<IamDdaMutationAuthorizationSourceV1['authorize']>[0]> = [];
  const source: IamDdaMutationAuthorizationSourceV1 = {
    authorize(input) {
      calls.push(input);
      let decision: IamDdaMutationAuthorizationDecisionV1;
      if (
        input.context.actorId !== state.actorId ||
        !tenantScopesEqualV1(input.context.tenantScope, state.scope)
      ) {
        decision = { allowed: false, code: 'FORBIDDEN' };
      } else if (
        input.context.authorizationEpoch !== state.authorizationEpoch ||
        input.context.workspaceAuthorizationEpoch !== state.workspaceAuthorizationEpoch
      ) {
        decision = { allowed: false, code: 'STALE_AUTHORIZATION' };
      } else if (!state.currentMember || state.role === 'VIEWER') {
        decision = { allowed: false, code: 'FORBIDDEN' };
      } else {
        decision = { allowed: true };
      }
      return Promise.resolve(Object.freeze(decision));
    },
  };
  return { source, calls };
}

void test('[IAM-DDA] receipt extract and correct map to derived-create with exact artifact resource', async () => {
  for (const action of ['RECEIPT_EXTRACT', 'RECEIPT_CORRECT'] as const) {
    const context = contextFor();
    const { source, calls } = canonicalIamSource({
      scope,
      actorId: context.actorId,
      authorizationEpoch: context.authorizationEpoch,
      workspaceAuthorizationEpoch: context.workspaceAuthorizationEpoch ?? 0,
      role: 'EDITOR',
      currentMember: true,
    });
    const adapter = new IamReceiptMutationAuthorizationAdapter(source);

    const result =
      action === 'RECEIPT_CORRECT'
        ? await adapter.authorize({
            context,
            action,
            artifactVersionId: ARTIFACT_VERSION_ID,
            candidateId: CANDIDATE_ID,
          })
        : await adapter.authorize({
            context,
            action,
            artifactVersionId: ARTIFACT_VERSION_ID,
          });

    assert.deepEqual(result, { accepted: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      context,
      action: PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE,
      resourceIds: [ARTIFACT_VERSION_ID],
    });
  }
});

void test('[IAM-DDA] ETL acceptance requires canonical execution create and run for the exact proposal', async () => {
  const context = contextFor();
  const { source, calls } = canonicalIamSource({
    scope,
    actorId: context.actorId,
    authorizationEpoch: context.authorizationEpoch,
    workspaceAuthorizationEpoch: context.workspaceAuthorizationEpoch ?? 0,
    role: 'OWNER',
    currentMember: true,
  });
  const adapter = new IamEtlAcceptanceAuthorizationAdapter(source);

  const result = await adapter.authorize({
    context,
    action: 'ETL_ACCEPT',
    proposalId: PROPOSAL_ID,
  });

  assert.deepEqual(result, { accepted: true });
  assert.deepEqual(
    calls.map((call) => ({ action: call.action, resourceIds: call.resourceIds })),
    [
      { action: PERMISSIONS_V1.JOB_EXECUTION_CREATE, resourceIds: [PROPOSAL_ID] },
      { action: PERMISSIONS_V1.JOB_EXECUTION_RUN, resourceIds: [PROPOSAL_ID] },
    ],
  );
  assert.deepEqual(
    calls.map((call) => call.context),
    [context, context],
  );
});

void test('[IAM-DDA] Owner and Editor decisions pass while Viewer is denied without adapter-side role authorization', async () => {
  for (const role of ['OWNER', 'EDITOR', 'VIEWER'] as const) {
    const context = contextFor();
    const { source } = canonicalIamSource({
      scope,
      actorId: context.actorId,
      authorizationEpoch: context.authorizationEpoch,
      workspaceAuthorizationEpoch: context.workspaceAuthorizationEpoch ?? 0,
      role,
      currentMember: true,
    });
    const receipt = await new IamReceiptMutationAuthorizationAdapter(source).authorize({
      context,
      action: 'RECEIPT_EXTRACT',
      artifactVersionId: ARTIFACT_VERSION_ID,
    });
    const etl = await new IamEtlAcceptanceAuthorizationAdapter(source).authorize({
      context,
      action: 'ETL_ACCEPT',
      proposalId: PROPOSAL_ID,
    });

    if (role === 'VIEWER') {
      assert.deepEqual(receipt, { accepted: false, code: 'FORBIDDEN' });
      assert.deepEqual(etl, { accepted: false, code: 'FORBIDDEN' });
    } else {
      assert.deepEqual(receipt, { accepted: true });
      assert.deepEqual(etl, { accepted: true });
    }
  }
});

void test('[IAM-DDA] inactive or revoked current membership and foreign scope fail closed', async () => {
  const context = contextFor();
  const inactive = canonicalIamSource({
    scope,
    actorId: context.actorId,
    authorizationEpoch: context.authorizationEpoch,
    workspaceAuthorizationEpoch: context.workspaceAuthorizationEpoch ?? 0,
    role: 'EDITOR',
    currentMember: false,
  });
  const inactiveResult = await new IamReceiptMutationAuthorizationAdapter(
    inactive.source,
  ).authorize({
    context,
    action: 'RECEIPT_EXTRACT',
    artifactVersionId: ARTIFACT_VERSION_ID,
  });
  assert.deepEqual(inactiveResult, { accepted: false, code: 'FORBIDDEN' });

  const foreignResult = await new IamReceiptMutationAuthorizationAdapter(
    canonicalIamSource({
      scope,
      actorId: context.actorId,
      authorizationEpoch: context.authorizationEpoch,
      workspaceAuthorizationEpoch: context.workspaceAuthorizationEpoch ?? 0,
      role: 'EDITOR',
      currentMember: true,
    }).source,
  ).authorize({
    context: contextFor(foreignScope),
    action: 'RECEIPT_EXTRACT',
    artifactVersionId: ARTIFACT_VERSION_ID,
  });
  assert.deepEqual(foreignResult, { accepted: false, code: 'FORBIDDEN' });
});

void test('[IAM-DDA] security and workspace epoch changes are unavailable, not stale-authorized', async () => {
  const context = contextFor(undefined, { authorizationEpoch: 4 });
  const { source } = canonicalIamSource({
    scope,
    actorId: context.actorId,
    authorizationEpoch: 3,
    workspaceAuthorizationEpoch: 7,
    role: 'EDITOR',
    currentMember: true,
  });
  const securityStale = await new IamReceiptMutationAuthorizationAdapter(source).authorize({
    context,
    action: 'RECEIPT_EXTRACT',
    artifactVersionId: ARTIFACT_VERSION_ID,
  });
  assert.deepEqual(securityStale, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });

  const workspaceContext = contextFor(undefined, { workspaceAuthorizationEpoch: 8 });
  const workspaceStale = await new IamEtlAcceptanceAuthorizationAdapter(source).authorize({
    context: workspaceContext,
    action: 'ETL_ACCEPT',
    proposalId: PROPOSAL_ID,
  });
  assert.deepEqual(workspaceStale, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
});

void test('[IAM-DDA] malformed source decisions, unavailable source, context, and browser actions fail closed', async () => {
  const context = contextFor();
  const malformedSource: IamDdaMutationAuthorizationSourceV1 = {
    authorize() {
      return Promise.resolve({ allowed: 'yes' } as never);
    },
  };
  const malformedDecision = await new IamReceiptMutationAuthorizationAdapter(
    malformedSource,
  ).authorize({
    context,
    action: 'RECEIPT_EXTRACT',
    artifactVersionId: ARTIFACT_VERSION_ID,
  });
  assert.deepEqual(malformedDecision, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });

  const unavailableSource: IamDdaMutationAuthorizationSourceV1 = {
    authorize() {
      return Promise.reject(new Error('IAM unavailable'));
    },
  };
  const unavailable = await new IamEtlAcceptanceAuthorizationAdapter(unavailableSource).authorize({
    context,
    action: 'ETL_ACCEPT',
    proposalId: PROPOSAL_ID,
  });
  assert.deepEqual(unavailable, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });

  const malformedContext = { ...context, actorId: context.actorId.toUpperCase() } as never;
  const malformedContextResult = await new IamReceiptMutationAuthorizationAdapter(
    malformedSource,
  ).authorize({
    context: malformedContext,
    action: 'RECEIPT_EXTRACT',
    artifactVersionId: ARTIFACT_VERSION_ID,
  });
  assert.deepEqual(malformedContextResult, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });

  const browserReceiptAction = await new IamReceiptMutationAuthorizationAdapter(
    malformedSource,
  ).authorize({
    context,
    action: 'artifact.derived.create' as never,
    artifactVersionId: ARTIFACT_VERSION_ID,
  });
  assert.deepEqual(browserReceiptAction, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });

  const browserEtlAction = await new IamEtlAcceptanceAuthorizationAdapter(
    malformedSource,
  ).authorize({
    context,
    action: PERMISSIONS_V1.JOB_EXECUTION_RUN as never,
    proposalId: PROPOSAL_ID,
  });
  assert.deepEqual(browserEtlAction, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
});

void test('[IAM-DDA] exact identifier validation rejects malformed artifact, candidate, and proposal IDs', async () => {
  const context = contextFor();
  const { source } = canonicalIamSource({
    scope,
    actorId: context.actorId,
    authorizationEpoch: context.authorizationEpoch,
    workspaceAuthorizationEpoch: context.workspaceAuthorizationEpoch ?? 0,
    role: 'EDITOR',
    currentMember: true,
  });
  const receipt = new IamReceiptMutationAuthorizationAdapter(source);
  const badArtifact = await receipt.authorize({
    context,
    action: 'RECEIPT_EXTRACT',
    artifactVersionId: ARTIFACT_VERSION_ID.toUpperCase(),
  });
  assert.deepEqual(badArtifact, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });

  const badCandidate = await receipt.authorize({
    context,
    action: 'RECEIPT_CORRECT',
    artifactVersionId: ARTIFACT_VERSION_ID,
    candidateId: 'not-an-id',
  });
  assert.deepEqual(badCandidate, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });

  const badProposal = await new IamEtlAcceptanceAuthorizationAdapter(source).authorize({
    context,
    action: 'ETL_ACCEPT',
    proposalId: 'not-an-id',
  });
  assert.deepEqual(badProposal, { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
});
