import assert from 'node:assert/strict';
import test from 'node:test';

import { createScopedAuthorizationEvaluatorV1 } from '../src/authorization/v1.ts';

const ids = Object.freeze({
  principal: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationA: '018f0f8c-7b77-7abc-8def-0123456789ab',
  organizationB: '018f0f8c-7b77-7abc-9def-0123456789ac',
  workspaceA: '11111111-1111-4111-8111-111111111111',
  workspaceB: '11111111-1111-4111-8111-111111111112',
  projectA: '22222222-2222-4222-8222-222222222222',
  projectB: '33333333-3333-4333-8333-333333333333',
  resourceA: '44444444-4444-4444-8444-444444444444',
  resourceB: '55555555-5555-4555-8555-555555555555',
});

const organizationA = Object.freeze({
  scopeType: 'organization',
  organizationId: ids.organizationA,
});
const organizationB = Object.freeze({
  scopeType: 'organization',
  organizationId: ids.organizationB,
});
const workspaceA = Object.freeze({
  scopeType: 'workspace',
  organizationId: ids.organizationA,
  workspaceId: ids.workspaceA,
});
const workspaceB = Object.freeze({
  scopeType: 'workspace',
  organizationId: ids.organizationA,
  workspaceId: ids.workspaceB,
});
const projectA = Object.freeze({
  scopeType: 'project',
  organizationId: ids.organizationA,
  workspaceId: ids.workspaceA,
  projectId: ids.projectA,
});
const projectB = Object.freeze({
  scopeType: 'project',
  organizationId: ids.organizationA,
  workspaceId: ids.workspaceA,
  projectId: ids.projectB,
});

function resourceFor(resourceType, overrides = {}) {
  const defaults = {
    organization: {
      resourceType: 'organization',
      resourceId: ids.organizationA,
      tenantScope: organizationA,
    },
    workspace: {
      resourceType: 'workspace',
      resourceId: ids.workspaceA,
      tenantScope: workspaceA,
    },
    project: {
      resourceType: 'project',
      resourceId: ids.projectA,
      tenantScope: projectA,
    },
    artifact: {
      resourceType: 'artifact',
      resourceId: ids.resourceA,
      tenantScope: projectA,
    },
    job: {
      resourceType: 'job',
      resourceId: ids.resourceA,
      tenantScope: workspaceA,
    },
    'approval-request': {
      resourceType: 'approval-request',
      resourceId: ids.resourceA,
      tenantScope: projectA,
    },
    'billing-account': {
      resourceType: 'billing-account',
      resourceId: ids.resourceA,
      tenantScope: organizationA,
    },
    device: {
      resourceType: 'device',
      resourceId: ids.resourceA,
      tenantScope: organizationA,
    },
  };
  return Object.freeze({ ...defaults[resourceType], ...overrides });
}

function requestFor(permission, channel, resource, overrides = {}) {
  return {
    permission,
    channel,
    tenantFilter: resource.tenantScope,
    resource: {
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
    },
    ...overrides,
  };
}

function authorityProvider({
  principalId = ids.principal,
  resource = resourceFor('artifact'),
  roleId = 'viewer',
  membershipScope = resource.tenantScope,
  membershipActive = true,
  policyConditionsSatisfied = true,
  principalResult,
  membershipResult,
  policyResult,
  hangFrom,
  throwFrom,
} = {}) {
  const calls = {
    principal: 0,
    lookup: 0,
    membership: 0,
    policy: 0,
    lookupQuery: undefined,
  };

  const provider = Object.freeze({
    async resolveAuthenticatedPrincipalV1() {
      calls.principal += 1;
      if (hangFrom === 'principal') return new Promise(() => {});
      if (throwFrom === 'principal') throw new Error('principal unavailable');
      return principalResult ?? { principalId };
    },
    async lookupResourceV1(query) {
      calls.lookup += 1;
      calls.lookupQuery = query;
      if (hangFrom === 'lookup') return new Promise(() => {});
      if (throwFrom === 'lookup') throw new Error('lookup unavailable');
      return resource;
    },
    async resolveMembershipV1() {
      calls.membership += 1;
      if (hangFrom === 'membership') return new Promise(() => {});
      if (throwFrom === 'membership') throw new Error('membership unavailable');
      return membershipResult ?? { roleId, membershipScope, membershipActive };
    },
    async evaluatePolicyV1() {
      calls.policy += 1;
      if (hangFrom === 'policy') return new Promise(() => {});
      if (throwFrom === 'policy') throw new Error('policy unavailable');
      return policyResult ?? { satisfied: policyConditionsSatisfied };
    },
  });

  return { provider, calls };
}

async function settleWithin(promise, timeoutMs) {
  let guard;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        guard = globalThis.setTimeout(
          () => reject(new Error('authorization did not settle')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    globalThis.clearTimeout(guard);
  }
}

test('[IAM-002, IAM-003] evaluator owns authority and exposes no caller minting API', async () => {
  const billing = resourceFor('billing-account');
  const { provider, calls } = authorityProvider({ resource: billing, roleId: 'owner' });
  const evaluator = createScopedAuthorizationEvaluatorV1(provider);

  assert.deepEqual(Object.keys(evaluator), ['authorizeV1']);
  assert.deepEqual(
    await evaluator.authorizeV1(requestFor('billing.account.manage', 'web', billing)),
    {
      allowed: true,
      permission: 'billing.account.manage',
      tenantScope: organizationA,
    },
  );

  const callsBeforeExploit = { ...calls };
  const fabricatedOwnerRequest = requestFor('billing.account.manage', 'web', billing, {
    roleId: 'owner',
    membershipActive: true,
    membershipScope: organizationA,
    policyConditionsSatisfied: true,
    resourceOwnership: billing,
  });
  assert.deepEqual(await evaluator.authorizeV1(fabricatedOwnerRequest), {
    allowed: false,
    code: 'INVALID_AUTHORIZATION_REQUEST',
  });
  assert.deepEqual(calls, callsBeforeExploit);
});

test('[IAM-002, IAM-003] provider facts cannot be overridden by request claims', async () => {
  const billing = resourceFor('billing-account');
  const viewerAuthority = authorityProvider({ resource: billing, roleId: 'viewer' });
  const viewerEvaluator = createScopedAuthorizationEvaluatorV1(viewerAuthority.provider);
  assert.deepEqual(
    await viewerEvaluator.authorizeV1(requestFor('billing.account.manage', 'web', billing)),
    { allowed: false, code: 'ROLE_PERMISSION_MISSING' },
  );

  const blockedOwnerAuthority = authorityProvider({
    resource: billing,
    roleId: 'owner',
    policyConditionsSatisfied: false,
  });
  const blockedOwnerEvaluator = createScopedAuthorizationEvaluatorV1(
    blockedOwnerAuthority.provider,
  );
  assert.deepEqual(
    await blockedOwnerEvaluator.authorizeV1(requestFor('billing.account.manage', 'web', billing)),
    { allowed: false, code: 'POLICY_CONDITIONS_REQUIRED' },
  );
});

test('[IAM-009, IAM-019] exact tenant filters are enforced before authoritative lookup', async () => {
  const artifact = resourceFor('artifact');
  const { provider, calls } = authorityProvider({ resource: artifact });
  const evaluator = createScopedAuthorizationEvaluatorV1(provider);

  const missingFilter = requestFor('artifact.record.read', 'web', artifact);
  delete missingFilter.tenantFilter;
  assert.deepEqual(await evaluator.authorizeV1(missingFilter), {
    allowed: false,
    code: 'TENANT_FILTER_REQUIRED',
  });
  assert.equal(calls.lookup, 0);

  assert.deepEqual(
    await evaluator.authorizeV1(
      requestFor('artifact.record.read', 'web', artifact, {
        tenantFilter: { ...projectA, optionalWorkspaceId: undefined },
      }),
    ),
    { allowed: false, code: 'TENANT_FILTER_INVALID' },
  );
  assert.equal(calls.lookup, 0);

  assert.deepEqual(
    await evaluator.authorizeV1(
      requestFor('artifact.record.read', 'web', artifact, { tenantFilter: projectB }),
    ),
    { allowed: false, code: 'RESOURCE_OWNERSHIP_MISMATCH' },
  );
  assert.equal(calls.lookup, 1);
  assert.ok(Object.isFrozen(calls.lookupQuery));
  assert.deepEqual(calls.lookupQuery.tenantScope, projectB);
});

test('[IAM-009, IAM-019] organization, workspace, and project identities match their ancestry', async () => {
  const cases = [
    resourceFor('organization', { resourceId: ids.resourceB }),
    resourceFor('workspace', { resourceId: ids.resourceB }),
    resourceFor('project', { resourceId: ids.resourceB }),
  ];

  for (const resource of cases) {
    const { provider } = authorityProvider({ resource, roleId: 'viewer' });
    const evaluator = createScopedAuthorizationEvaluatorV1(provider);
    const permission = {
      organization: 'organization.profile.read',
      workspace: 'workspace.settings.read',
      project: 'project.record.read',
    }[resource.resourceType];
    assert.deepEqual(await evaluator.authorizeV1(requestFor(permission, 'web', resource)), {
      allowed: false,
      code: 'RESOURCE_IDENTITY_MISMATCH',
    });
  }
});

test('[IAM-002, IAM-003] unknown and inactive authoritative facts deny by default', async () => {
  const artifact = resourceFor('artifact');
  const cases = [
    [{ roleId: 'custom-admin' }, 'artifact.record.read', 'web', 'UNKNOWN_ROLE'],
    [{}, 'future.resource.read', 'web', 'UNKNOWN_PERMISSION'],
    [{}, 'artifact.record.read', 'carrier-pigeon', 'UNKNOWN_CHANNEL'],
    [{ membershipActive: false }, 'artifact.record.read', 'web', 'INACTIVE_MEMBERSHIP'],
  ];

  for (const [authorityOverrides, permission, channel, code] of cases) {
    const { provider } = authorityProvider({ resource: artifact, ...authorityOverrides });
    const evaluator = createScopedAuthorizationEvaluatorV1(provider);
    assert.deepEqual(await evaluator.authorizeV1(requestFor(permission, channel, artifact)), {
      allowed: false,
      code,
    });
  }
});

test('[IAM-002, IAM-003] every permission is restricted to its explicit channels', async () => {
  const cases = {
    'organization.profile.read': ['viewer', 'organization', ['api', 'web', 'desktop', 'android']],
    'organization.settings.manage': ['admin', 'organization', ['api', 'web']],
    'organization.ownership.transfer': ['owner', 'organization', ['api', 'web']],
    'workspace.settings.read': [
      'viewer',
      'workspace',
      ['api', 'web', 'desktop', 'android', 'worker'],
    ],
    'workspace.settings.manage': ['admin', 'workspace', ['api', 'web']],
    'project.record.read': [
      'viewer',
      'project',
      ['api', 'web', 'desktop', 'android', 'worker', 'sync'],
    ],
    'project.record.manage': ['admin', 'project', ['api', 'web']],
    'artifact.record.read': [
      'viewer',
      'artifact',
      ['api', 'web', 'desktop', 'android', 'worker', 'sync', 'shared-link'],
    ],
    'artifact.original.download': ['analyst', 'artifact', ['api', 'web', 'desktop', 'android']],
    'artifact.derived.create': ['analyst', 'artifact', ['api', 'web', 'desktop', 'worker']],
    'job.execution.read': [
      'viewer',
      'job',
      ['api', 'web', 'desktop', 'android', 'worker', 'sync', 'stream'],
    ],
    'job.execution.create': ['analyst', 'job', ['api', 'web', 'desktop', 'worker']],
    'job.execution.run': ['operator', 'job', ['api', 'web', 'desktop', 'worker']],
    'job.execution.cancel': ['analyst', 'job', ['api', 'web', 'desktop']],
    'approval.request.read': ['approver', 'approval-request', ['api', 'web', 'desktop', 'android']],
    'approval.decision.create': ['approver', 'approval-request', ['api', 'web', 'android']],
    'billing.account.read': ['owner', 'billing-account', ['api', 'web']],
    'billing.account.manage': ['owner', 'billing-account', ['api', 'web']],
    'device.identity.read': ['admin', 'device', ['api', 'web']],
    'device.identity.revoke': ['admin', 'device', ['api', 'web']],
  };
  const allChannels = [
    'api',
    'web',
    'desktop',
    'android',
    'worker',
    'sync',
    'stream',
    'shared-link',
  ];

  for (const [permission, [roleId, resourceType, allowedChannels]] of Object.entries(cases)) {
    for (const channel of allChannels) {
      const resource = resourceFor(resourceType);
      const { provider } = authorityProvider({
        resource,
        roleId,
        membershipScope: organizationA,
      });
      const evaluator = createScopedAuthorizationEvaluatorV1(provider);
      const decision = await evaluator.authorizeV1(requestFor(permission, channel, resource));

      if (allowedChannels.includes(channel)) {
        assert.deepEqual(decision, {
          allowed: true,
          permission,
          tenantScope: resource.tenantScope,
        });
      } else {
        assert.deepEqual(decision, { allowed: false, code: 'CHANNEL_NOT_ALLOWED' });
      }
    }
  }
});

test('[IAM-002, IAM-003, IAM-004] representative actions use the six authoritative roles', async () => {
  const cases = [
    ['owner', 'organization', 'organization.settings.manage'],
    ['owner', 'billing-account', 'billing.account.manage'],
    ['owner', 'device', 'device.identity.revoke'],
    ['admin', 'workspace', 'workspace.settings.manage'],
    ['admin', 'project', 'project.record.manage'],
    ['analyst', 'artifact', 'artifact.original.download'],
    ['analyst', 'job', 'job.execution.create'],
    ['operator', 'job', 'job.execution.run'],
    ['approver', 'approval-request', 'approval.decision.create'],
    ['viewer', 'artifact', 'artifact.record.read'],
  ];

  for (const [roleId, resourceType, permission] of cases) {
    const resource = resourceFor(resourceType);
    const { provider } = authorityProvider({
      resource,
      roleId,
      membershipScope: organizationA,
    });
    const evaluator = createScopedAuthorizationEvaluatorV1(provider);
    assert.deepEqual(await evaluator.authorizeV1(requestFor(permission, 'web', resource)), {
      allowed: true,
      permission,
      tenantScope: resource.tenantScope,
    });
  }
});

test('[IAM-002, IAM-009, IAM-019] authoritative memberships cannot expand tenant scope', async () => {
  const artifact = resourceFor('artifact');
  const deniedScopes = [organizationB, workspaceB, projectB];
  for (const membershipScope of deniedScopes) {
    const { provider } = authorityProvider({ resource: artifact, membershipScope });
    const evaluator = createScopedAuthorizationEvaluatorV1(provider);
    assert.deepEqual(
      await evaluator.authorizeV1(requestFor('artifact.record.read', 'web', artifact)),
      { allowed: false, code: 'TENANT_SCOPE_MISMATCH' },
    );
  }

  for (const membershipScope of [organizationA, workspaceA, projectA]) {
    const { provider } = authorityProvider({ resource: artifact, membershipScope });
    const evaluator = createScopedAuthorizationEvaluatorV1(provider);
    assert.equal(
      (await evaluator.authorizeV1(requestFor('artifact.record.read', 'web', artifact))).allowed,
      true,
    );
  }
});

test('[IAM-002, IAM-003] authority failures and malformed results fail closed', async () => {
  const artifact = resourceFor('artifact');
  for (const throwFrom of ['principal', 'lookup', 'membership', 'policy']) {
    const { provider } = authorityProvider({ resource: artifact, throwFrom });
    const evaluator = createScopedAuthorizationEvaluatorV1(provider);
    assert.deepEqual(
      await evaluator.authorizeV1(requestFor('artifact.record.read', 'web', artifact)),
      { allowed: false, code: 'AUTHORITY_UNAVAILABLE' },
    );
  }

  const malformedAuthorities = [
    { principalResult: { principalId: 'request-user' } },
    { resource: { ...artifact, clientSuppliedOwner: true } },
    { membershipResult: { roleId: 'viewer', membershipScope: projectA } },
    { policyResult: { satisfied: 'yes' } },
  ];
  for (const overrides of malformedAuthorities) {
    const { provider } = authorityProvider({ ...overrides, roleId: 'viewer' });
    const evaluator = createScopedAuthorizationEvaluatorV1(provider);
    assert.deepEqual(
      await evaluator.authorizeV1(requestFor('artifact.record.read', 'web', artifact)),
      { allowed: false, code: 'AUTHORITY_INVALID' },
    );
  }
});

for (const [hangFrom, expectedCalls] of [
  ['principal', { principal: 1, lookup: 0, membership: 0, policy: 0 }],
  ['lookup', { principal: 1, lookup: 1, membership: 0, policy: 0 }],
  ['membership', { principal: 1, lookup: 1, membership: 1, policy: 0 }],
  ['policy', { principal: 1, lookup: 1, membership: 1, policy: 1 }],
]) {
  test(`[IAM-002, IAM-003] ${hangFrom} authority timeout fails closed`, async () => {
    const artifact = resourceFor('artifact');
    const { provider, calls } = authorityProvider({ resource: artifact, hangFrom });
    const evaluator = createScopedAuthorizationEvaluatorV1(provider, {
      providerCallTimeoutMs: 10,
    });

    assert.deepEqual(
      await settleWithin(
        evaluator.authorizeV1(requestFor('artifact.record.read', 'web', artifact)),
        250,
      ),
      { allowed: false, code: 'AUTHORITY_UNAVAILABLE' },
    );
    assert.deepEqual(
      {
        principal: calls.principal,
        lookup: calls.lookup,
        membership: calls.membership,
        policy: calls.policy,
      },
      expectedCalls,
    );
  });
}

test('[IAM-002, IAM-003] authority deadline timers are cleared after settle', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set();
  let scheduled = 0;
  let cleared = 0;

  globalThis.setTimeout = (callback, delay, ...arguments_) => {
    scheduled += 1;
    const handle = nativeSetTimeout(() => {
      activeTimers.delete(handle);
      callback(...arguments_);
    }, delay);
    activeTimers.add(handle);
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    cleared += 1;
    activeTimers.delete(handle);
    return nativeClearTimeout(handle);
  };

  try {
    const artifact = resourceFor('artifact');
    for (const [throwFrom, expectedDecision] of [
      [undefined, { allowed: true, permission: 'artifact.record.read', tenantScope: projectA }],
      ['membership', { allowed: false, code: 'AUTHORITY_UNAVAILABLE' }],
    ]) {
      const { provider } = authorityProvider({ resource: artifact, throwFrom });
      const evaluator = createScopedAuthorizationEvaluatorV1(provider, {
        providerCallTimeoutMs: 1_000,
      });
      assert.deepEqual(
        await evaluator.authorizeV1(requestFor('artifact.record.read', 'web', artifact)),
        expectedDecision,
      );
    }

    assert.equal(scheduled, 7);
    assert.equal(cleared, 7);
    assert.equal(activeTimers.size, 0);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
    for (const handle of activeTimers) nativeClearTimeout(handle);
  }
});

test('[IAM-002, IAM-003] unsafe authority timeout configuration fails at composition', () => {
  const { provider } = authorityProvider();
  for (const options of [
    {},
    { providerCallTimeoutMs: 0 },
    { providerCallTimeoutMs: 1.5 },
    { providerCallTimeoutMs: 60_001 },
    { providerCallTimeoutMs: 1_000, extra: true },
  ]) {
    assert.throws(() => createScopedAuthorizationEvaluatorV1(provider, options), TypeError);
  }
});
