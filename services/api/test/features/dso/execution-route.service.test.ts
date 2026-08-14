import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDataModePolicyVersionV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';

import { InMemoryExecutionRouteRepositoryAdapter } from '../../../src/features/dso/adapter/in-memory-execution-route-repository.adapter.js';
import {
  ExecutionRouteService,
  type ExecutionRouteClockPortV1,
} from '../../../src/features/dso/application/execution-route.service.js';
import type { ExecutionRouteWorkspacePolicyAuthorityPortV1 } from '../../../src/features/dso/application/execution-route-policy-authority.port.js';
import type { ExecutionRouteSubjectInputV1 } from '../../../src/features/dso/application/execution-route-decision.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = Object.freeze({
  organization: '10000000-0000-4000-8000-000000000001',
  workspace: '10000000-0000-4000-8000-000000000002',
  siblingWorkspace: '10000000-0000-4000-8000-000000000003',
  project: '10000000-0000-4000-8000-000000000004',
  actor: '10000000-0000-4000-8000-000000000005',
  correlation: '10000000-0000-4000-8000-000000000006',
  route: '10000000-0000-4000-8000-000000000007',
  decision: '10000000-0000-4000-8000-000000000008',
  artifactVersion: '10000000-0000-4000-8000-000000000009',
  placement: '10000000-0000-4000-8000-000000000010',
  policy: '10000000-0000-4000-8000-000000000011',
  policyVersion: '10000000-0000-4000-8000-000000000012',
  constraint: '10000000-0000-4000-8000-000000000013',
  device: '10000000-0000-4000-8000-000000000014',
});

const now = '2026-08-14T08:00:00.000Z';
const expiry = '2026-08-14T08:15:00.000Z';

function context(workspaceId: string = ids.workspace, authorizationEpoch = 7) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'project',
      organizationId: ids.organization,
      workspaceId,
      projectId: ids.project,
    },
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey: `route-${workspaceId}-${authorizationEpoch}`,
    authorizationEpoch,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context fixture');
  return result.value;
}

function policy(overrides: Partial<DataModePolicyVersionV1> = {}): DataModePolicyVersionV1 {
  const result = createDataModePolicyVersionV1({
    policyId: ids.policy,
    policyVersionId: ids.policyVersion,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    revision: 4,
    mode: 'HYBRID',
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA', 'ORIGINAL_CONTENT'],
      INTERNAL: ['CONTROL_METADATA', 'ORIGINAL_CONTENT'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: [],
    },
    allowedPlacementKinds: ['LOCAL', 'CLOUD'],
    allowedExecutorClasses: ['DESKTOP', 'CLOUD'],
    allowedDestinationClasses: ['WEB', 'DESKTOP'],
    canonicalHash: 'a'.repeat(64),
    publishedAt: '2026-08-14T07:00:00.000Z',
    ...overrides,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid policy fixture');
  return result.value;
}

class MutablePolicyAuthority implements ExecutionRouteWorkspacePolicyAuthorityPortV1 {
  public current: DataModePolicyVersionV1 | undefined = policy();
  public authorizationEpoch = 7;

  public resolveCurrentWorkspacePolicy() {
    return Promise.resolve(
      this.current === undefined
        ? undefined
        : { policy: this.current, authorizationEpoch: this.authorizationEpoch },
    );
  }
}

class MutableClock implements ExecutionRouteClockPortV1 {
  public value = now;
  public now() {
    return this.value;
  }
}

function subject(
  overrides: Partial<ExecutionRouteSubjectInputV1> = {},
): ExecutionRouteSubjectInputV1 {
  return {
    tenantScope: context().tenantScope,
    input: {
      artifactVersionId: ids.artifactVersion,
      artifactVersionHash: 'b'.repeat(64),
      placementId: ids.placement,
      placementHash: 'c'.repeat(64),
      dataMode: 'Hybrid',
      classification: 'INTERNAL',
      payloadClass: 'ORIGINAL_CONTENT',
      placementKind: 'CLOUD',
      placementAvailable: true,
    },
    action: {
      type: 'spreadsheet.audit',
      version: 2,
      requiredCapabilities: ['artifact.read', 'spreadsheet.audit'],
    },
    target: {
      target: 'CLOUD',
      executorClass: 'CLOUD',
      grantedCapabilities: ['spreadsheet.audit', 'artifact.read'],
    },
    narrowingConstraints: [
      {
        constraintId: ids.constraint,
        constraintHash: 'd'.repeat(64),
        allowedClassifications: ['INTERNAL'],
        allowedPayloadClasses: ['ORIGINAL_CONTENT'],
        allowedPlacementKinds: ['CLOUD'],
        allowedExecutorClasses: ['CLOUD'],
      },
    ],
    authorizationEpoch: 7,
    ...overrides,
  };
}

function service() {
  const repository = new InMemoryExecutionRouteRepositoryAdapter();
  const policies = new MutablePolicyAuthority();
  const clock = new MutableClock();
  return {
    service: new ExecutionRouteService(repository, policies, clock),
    repository,
    policies,
    clock,
  };
}

void test('[DSO-024/026/027] persists and authorizes one exact cloud route against the current policy intersection', async () => {
  const fixture = service();
  const created = await fixture.service.createDecision(context(), {
    routeId: ids.route,
    decisionId: ids.decision,
    revision: 1,
    subject: subject(),
    expiresAt: expiry,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.target.target, 'CLOUD');
  assert.equal(created.value.dataModePolicyVersionId, ids.policyVersion);
  assert.equal(created.value.dataModePolicyHash, 'a'.repeat(64));
  assert.match(created.value.decisionSubjectHash, /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    await fixture.service.authorize({
      tenantScope: context().tenantScope,
      decisionId: ids.decision,
      subject: subject(),
      expectedDecisionSubjectHash: created.value.decisionSubjectHash,
      currentAuthorizationEpoch: 7,
    }),
    { accepted: true, value: created.value },
  );
});

void test('[DSO-024/026] cloud routing fails closed when any independent policy dimension denies it', async () => {
  const deniedSubjects: readonly ExecutionRouteSubjectInputV1[] = [
    subject({ input: { ...subject().input, dataMode: 'Local' } }),
    subject({ input: { ...subject().input, placementKind: 'LOCAL' } }),
    subject({ input: { ...subject().input, placementAvailable: false } }),
    subject({ input: { ...subject().input, classification: 'CONFIDENTIAL' } }),
    subject({
      target: {
        target: 'CLOUD',
        executorClass: 'CLOUD',
        grantedCapabilities: ['artifact.read'],
      },
    }),
    subject({
      narrowingConstraints: [
        {
          ...subject().narrowingConstraints[0]!,
          allowedExecutorClasses: ['DESKTOP'],
        },
      ],
    }),
  ];
  for (const [index, candidate] of deniedSubjects.entries()) {
    const fixture = service();
    assert.deepEqual(
      await fixture.service.createDecision(context(), {
        routeId: ids.route,
        decisionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        revision: 1,
        subject: candidate,
        expiresAt: expiry,
      }),
      { accepted: false, code: 'ROUTE_NOT_ALLOWED' },
    );
  }
});

void test('[DSO-024/026/027] authorization rejects expiry, subject drift, policy drift, epoch drift, and sibling scope', async () => {
  const fixture = service();
  const created = await fixture.service.createDecision(context(), {
    routeId: ids.route,
    decisionId: ids.decision,
    revision: 1,
    subject: subject(),
    expiresAt: expiry,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const base = {
    tenantScope: context().tenantScope,
    decisionId: ids.decision,
    subject: subject(),
    expectedDecisionSubjectHash: created.value.decisionSubjectHash,
    currentAuthorizationEpoch: 7,
  } as const;

  assert.deepEqual(
    await fixture.service.authorize({
      ...base,
      subject: subject({ action: { ...subject().action, version: 3 } }),
    }),
    { accepted: false, code: 'ROUTE_SUBJECT_MISMATCH' },
  );
  assert.deepEqual(await fixture.service.authorize({ ...base, currentAuthorizationEpoch: 8 }), {
    accepted: false,
    code: 'AUTHORIZATION_EPOCH_STALE',
  });
  assert.deepEqual(
    await fixture.service.authorize({
      ...base,
      tenantScope: context(ids.siblingWorkspace).tenantScope,
    }),
    { accepted: false, code: 'ROUTE_NOT_FOUND' },
  );

  fixture.policies.current = policy({
    policyVersionId: '30000000-0000-4000-8000-000000000001' as never,
    revision: 5,
    canonicalHash: 'e'.repeat(64),
  });
  assert.deepEqual(await fixture.service.authorize(base), {
    accepted: false,
    code: 'DATA_MODE_POLICY_STALE',
  });

  fixture.policies.current = policy();
  fixture.clock.value = expiry;
  assert.deepEqual(await fixture.service.authorize(base), {
    accepted: false,
    code: 'ROUTE_EXPIRED',
  });
});

void test('[DSO-024/026] device routes bind the exact target Device and granted capabilities', async () => {
  const fixture = service();
  const deviceSubject = subject({
    input: { ...subject().input, placementKind: 'LOCAL' },
    target: {
      target: 'DEVICE',
      targetDeviceId: ids.device,
      executorClass: 'DESKTOP',
      grantedCapabilities: ['artifact.read', 'spreadsheet.audit'],
    },
    narrowingConstraints: [
      {
        ...subject().narrowingConstraints[0]!,
        allowedPlacementKinds: ['LOCAL'],
        allowedExecutorClasses: ['DESKTOP'],
      },
    ],
  });
  const created = await fixture.service.createDecision(context(), {
    routeId: ids.route,
    decisionId: ids.decision,
    revision: 1,
    subject: deviceSubject,
    expiresAt: expiry,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.target.target, 'DEVICE');
  if (created.value.target.target !== 'DEVICE') return;
  assert.equal(created.value.target.targetDeviceId, ids.device);
  assert.deepEqual(
    await fixture.service.authorize({
      tenantScope: context().tenantScope,
      decisionId: ids.decision,
      subject: {
        ...deviceSubject,
        target: {
          target: 'DEVICE',
          executorClass: 'DESKTOP',
          grantedCapabilities: ['artifact.read', 'spreadsheet.audit'],
          targetDeviceId: '30000000-0000-4000-8000-000000000002',
        },
      },
      expectedDecisionSubjectHash: created.value.decisionSubjectHash,
      currentAuthorizationEpoch: 7,
    }),
    { accepted: false, code: 'ROUTE_SUBJECT_MISMATCH' },
  );
});
