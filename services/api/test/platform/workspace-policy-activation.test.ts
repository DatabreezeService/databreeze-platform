import assert from 'node:assert/strict';
import test from 'node:test';

/* eslint-disable @typescript-eslint/require-await -- deterministic transaction participant doubles. */

import { createDataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';
import { createIamTenantContextV1 } from '../../src/features/iam/application/tenant-context.js';
import {
  WorkspaceDataModePolicyActivationService,
  type WorkspacePolicyActivationParticipantsV1,
} from '../../src/platform/dso-workspace-policy.composition.js';

const activationAuthorization = {
  authorize: async () => ({
    allowed: true as const,
    authorizationDecisionId: 'admin-decision',
    recentMfaAssertionId: 'recent-mfa',
    transitionProofId: 'safe-transition',
  }),
};
const effects = {
  audit: { appendActivation: async () => undefined },
  outbox: { appendPolicyChanged: async () => undefined },
};

const ids = {
  organization: '00000000-0000-4000-8000-000000000301',
  workspace: '00000000-0000-4000-8000-000000000302',
  otherWorkspace: '00000000-0000-4000-8000-000000000303',
  actor: '00000000-0000-4000-8000-000000000304',
  policy: '00000000-0000-4000-8000-000000000305',
  version: '00000000-0000-4000-8000-000000000306',
} as const;

function context() {
  const parsed = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
    },
    actorId: ids.actor,
    correlationId: '00000000-0000-4000-8000-000000000307',
    idempotencyKey: 'policy-activation-key',
    authorizationEpoch: 7,
  });
  if (!parsed.accepted) throw new Error('invalid context');
  return parsed.value;
}

function policy(workspaceId: string = ids.workspace) {
  const parsed = createDataModePolicyVersionV1({
    policyId: ids.policy,
    policyVersionId: ids.version,
    organizationId: ids.organization,
    workspaceId,
    revision: 1,
    mode: 'LOCAL',
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA'],
      INTERNAL: ['CONTROL_METADATA'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: ['CONTROL_METADATA'],
    },
    allowedPlacementKinds: ['LOCAL'],
    allowedExecutorClasses: ['DESKTOP'],
    allowedDestinationClasses: ['DESKTOP'],
    canonicalHash: 'c'.repeat(64),
    publishedAt: '2026-08-13T00:00:00.000Z',
  });
  if (!parsed.accepted) throw new Error('invalid policy');
  return parsed.value;
}

function input() {
  return {
    policy: policy(),
    expectedAggregateRevision: 0,
    expectedAuthorizationEpoch: 7,
  } as const;
}

void test('[DSO-018/026/027][IAM-019] activation advances DSO and IAM once in one transaction', async () => {
  let iamCalls = 0;
  const participants: WorkspacePolicyActivationParticipantsV1 = {
    dso: {
      apply: async (request) => ({
        replayed: false,
        policy: request.policy,
        aggregateRevision: 1,
        authorizationEpoch: 8,
        requestHash: request.requestHash,
      }),
    },
    iam: {
      compareAndSet: async () => {
        iamCalls += 1;
        return 8;
      },
    },
    ...effects,
  };
  const service = new WorkspaceDataModePolicyActivationService(
    {
      run: (work) => work(participants),
    },
    activationAuthorization,
  );

  const result = await service.activate(context(), input());

  assert.equal(result.accepted, true);
  if (result.accepted) {
    assert.equal(result.value.authorizationEpoch, 8);
    assert.equal(result.value.aggregateRevision, 1);
    assert.equal(result.value.replayed, false);
  }
  assert.equal(iamCalls, 1);
});

void test('[DSO-027] exact idempotent replay returns the binding without incrementing IAM twice', async () => {
  const service = new WorkspaceDataModePolicyActivationService(
    {
      run: (work) =>
        work({
          dso: {
            apply: async (request) => ({
              replayed: true,
              policy: request.policy,
              aggregateRevision: 1,
              authorizationEpoch: 8,
              requestHash: request.requestHash,
            }),
          },
          iam: {
            compareAndSet: async () => {
              throw new Error('IAM must not run for an exact replay');
            },
          },
          ...effects,
        }),
    },
    activationAuthorization,
  );

  const result = await service.activate(context(), input());
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(result.value.replayed, true);
});

void test('[DSO-026][IAM-003/019] activation rejects cross-tenant policy before transaction', async () => {
  let transactionCalls = 0;
  const service = new WorkspaceDataModePolicyActivationService(
    {
      run: async () => {
        transactionCalls += 1;
        throw new Error('must not run');
      },
    },
    activationAuthorization,
  );

  const result = await service.activate(context(), {
    ...input(),
    policy: policy(ids.otherWorkspace),
  });
  assert.deepEqual(result, { accepted: false, code: 'SCOPE_MISMATCH' });
  assert.equal(transactionCalls, 0);
});

void test('[DSO-018] activation is unavailable without the Admin/MFA/transition authority', async () => {
  let transactionCalls = 0;
  const service = new WorkspaceDataModePolicyActivationService({
    run: async () => {
      transactionCalls += 1;
      throw new Error('must not run');
    },
  });

  assert.deepEqual(await service.activate(context(), input()), {
    accepted: false,
    code: 'ACTIVATION_GUARDS_UNAVAILABLE',
  });
  assert.equal(transactionCalls, 0);
});

void test('[DSO-026] stale CAS fails closed with no partial success', async () => {
  const service = new WorkspaceDataModePolicyActivationService(
    {
      run: (work) =>
        work({
          dso: { apply: async () => Promise.reject(new Error('DSO_ACTIVATION_STALE')) },
          iam: { compareAndSet: async () => 8 },
          ...effects,
        }),
    },
    activationAuthorization,
  );
  assert.deepEqual(await service.activate(context(), input()), {
    accepted: false,
    code: 'ACTIVATION_STALE',
  });
});
