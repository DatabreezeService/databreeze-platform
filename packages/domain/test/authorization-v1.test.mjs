import assert from 'node:assert/strict';
import test from 'node:test';

async function loadAuthorization() {
  try {
    return await import('../src/authorization/v1.ts');
  } catch {
    return undefined;
  }
}

const ids = Object.freeze({
  principal: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationA: '018f0f8c-7b77-7abc-8def-0123456789ab',
  organizationB: '018f0f8c-7b77-7abc-9def-0123456789ac',
  workspaceA: '11111111-1111-4111-8111-111111111111',
  workspaceB: '11111111-1111-4111-8111-111111111112',
  projectA: '22222222-2222-4222-8222-222222222222',
  projectB: '33333333-3333-4333-8333-333333333333',
  resourceA: '44444444-4444-4444-8444-444444444444',
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

function expectAccepted(result) {
  assert.equal(result.accepted, true);
  return result.value;
}

function trustedResource(evaluator, tenantScope, resourceType) {
  const filter = expectAccepted(evaluator.verifyTenantFilterV1(tenantScope, tenantScope));
  return expectAccepted(
    evaluator.acceptTrustedResourceLookupV1(filter, {
      resourceType,
      resourceId: ids.resourceA,
      tenantScope,
    }),
  );
}

function evaluatedContext(
  evaluator,
  {
    roleId,
    membershipScope,
    resourceScope,
    resourceType,
    channel = 'api',
    membershipActive = true,
    policyConditionsSatisfied = true,
  },
) {
  return expectAccepted(
    evaluator.createEvaluatedContextV1({
      principalId: ids.principal,
      roleId,
      membershipScope,
      membershipActive,
      channel,
      policyConditionsSatisfied,
      evaluatedAt: '2026-08-01T12:34:56Z',
      resource: trustedResource(evaluator, resourceScope, resourceType),
    }),
  );
}

test('[IAM-009, IAM-019] exact required tenant filters gate trusted lookup results', async () => {
  const api = await loadAuthorization();
  assert.ok(api, 'the authorization/v1 module must exist');
  const evaluator = api.createScopedAuthorizationEvaluatorV1();

  assert.deepEqual(evaluator.verifyTenantFilterV1(projectA, undefined), {
    accepted: false,
    code: 'TENANT_FILTER_REQUIRED',
  });
  assert.deepEqual(evaluator.verifyTenantFilterV1(projectA, { ...projectA, extra: true }), {
    accepted: false,
    code: 'TENANT_FILTER_INVALID',
  });
  assert.deepEqual(evaluator.verifyTenantFilterV1(projectA, workspaceA), {
    accepted: false,
    code: 'TENANT_FILTER_MISMATCH',
  });
  assert.deepEqual(
    evaluator.verifyTenantFilterV1(projectA, { ...projectA, organizationId: ids.organizationB }),
    { accepted: false, code: 'TENANT_FILTER_MISMATCH' },
  );

  const verified = expectAccepted(evaluator.verifyTenantFilterV1(projectA, projectA));
  assert.ok(Object.isFrozen(verified));
  assert.deepEqual(
    evaluator.acceptTrustedResourceLookupV1(projectA, {
      resourceType: 'artifact',
      resourceId: ids.resourceA,
      tenantScope: projectA,
    }),
    { accepted: false, code: 'UNVERIFIED_TENANT_FILTER' },
  );

  const foreignEvaluator = api.createScopedAuthorizationEvaluatorV1();
  assert.deepEqual(
    foreignEvaluator.acceptTrustedResourceLookupV1(verified, {
      resourceType: 'artifact',
      resourceId: ids.resourceA,
      tenantScope: projectA,
    }),
    { accepted: false, code: 'UNVERIFIED_TENANT_FILTER' },
  );
});

test('[IAM-009, IAM-019] trusted lookup rejects cross-tenant and incomplete ownership', async () => {
  const api = await loadAuthorization();
  assert.ok(api);
  const evaluator = api.createScopedAuthorizationEvaluatorV1();
  const verified = expectAccepted(evaluator.verifyTenantFilterV1(projectA, projectA));

  for (const tenantScope of [organizationB, workspaceB, projectB]) {
    assert.deepEqual(
      evaluator.acceptTrustedResourceLookupV1(verified, {
        resourceType: 'artifact',
        resourceId: ids.resourceA,
        tenantScope,
      }),
      { accepted: false, code: 'RESOURCE_OWNERSHIP_MISMATCH' },
    );
  }

  assert.deepEqual(
    evaluator.acceptTrustedResourceLookupV1(verified, {
      resourceType: 'artifact',
      resourceId: ids.resourceA,
      tenantScope: {
        scopeType: 'project',
        organizationId: ids.organizationA,
        projectId: ids.projectA,
      },
    }),
    { accepted: false, code: 'INVALID_RESOURCE_OWNERSHIP' },
  );
});

test('[IAM-009, IAM-019] resource types require their complete applicable scope', async () => {
  const api = await loadAuthorization();
  assert.ok(api);

  const cases = [
    ['artifact', organizationA],
    ['job', organizationA],
    ['approval-request', organizationA],
    ['workspace', projectA],
    ['project', workspaceA],
    ['billing-account', workspaceA],
    ['device', workspaceA],
    ['future-resource', projectA],
  ];

  for (const [resourceType, tenantScope] of cases) {
    const evaluator = api.createScopedAuthorizationEvaluatorV1();
    const verified = expectAccepted(evaluator.verifyTenantFilterV1(tenantScope, tenantScope));
    assert.deepEqual(
      evaluator.acceptTrustedResourceLookupV1(verified, {
        resourceType,
        resourceId: ids.resourceA,
        tenantScope,
      }),
      { accepted: false, code: 'INVALID_RESOURCE_OWNERSHIP' },
    );
  }
});

test('[IAM-002, IAM-003] plain or foreign client claims never become authorization context', async () => {
  const api = await loadAuthorization();
  assert.ok(api);
  const evaluator = api.createScopedAuthorizationEvaluatorV1();
  const foreignEvaluator = api.createScopedAuthorizationEvaluatorV1();
  const rawResourceClaim = {
    resourceType: 'artifact',
    resourceId: ids.resourceA,
    tenantScope: projectA,
  };
  const contextInput = {
    principalId: ids.principal,
    roleId: 'owner',
    membershipScope: organizationA,
    membershipActive: true,
    channel: 'api',
    policyConditionsSatisfied: true,
    evaluatedAt: '2026-08-01T12:34:56Z',
    resource: rawResourceClaim,
  };

  assert.deepEqual(evaluator.createEvaluatedContextV1(contextInput), {
    accepted: false,
    code: 'UNTRUSTED_RESOURCE_OWNERSHIP',
  });
  assert.deepEqual(
    evaluator.createEvaluatedContextV1({
      ...contextInput,
      resource: trustedResource(evaluator, projectA, 'artifact'),
      clientTenantClaim: projectA,
    }),
    { accepted: false, code: 'INVALID_EVALUATED_CONTEXT' },
  );
  assert.deepEqual(evaluator.authorizeV1(contextInput, 'artifact.record.read'), {
    allowed: false,
    code: 'UNTRUSTED_CONTEXT',
  });

  const foreignResource = trustedResource(foreignEvaluator, projectA, 'artifact');
  assert.deepEqual(
    evaluator.createEvaluatedContextV1({ ...contextInput, resource: foreignResource }),
    {
      accepted: false,
      code: 'UNTRUSTED_RESOURCE_OWNERSHIP',
    },
  );
});

test('[IAM-002, IAM-003, IAM-004] authorizes the representative six-role matrix only in scope', async () => {
  const api = await loadAuthorization();
  assert.ok(api);

  const cases = [
    ['owner', organizationA, organizationA, 'organization', 'organization.settings.manage'],
    ['owner', organizationA, organizationA, 'billing-account', 'billing.account.manage'],
    ['owner', organizationA, organizationA, 'device', 'device.identity.revoke'],
    ['admin', organizationA, workspaceA, 'workspace', 'workspace.settings.manage'],
    ['admin', workspaceA, projectA, 'project', 'project.record.manage'],
    ['analyst', workspaceA, projectA, 'artifact', 'artifact.original.download'],
    ['analyst', workspaceA, workspaceA, 'job', 'job.execution.create'],
    ['operator', workspaceA, workspaceA, 'job', 'job.execution.run'],
    ['approver', workspaceA, projectA, 'approval-request', 'approval.decision.create'],
    ['viewer', workspaceA, projectA, 'artifact', 'artifact.record.read'],
  ];

  for (const [roleId, membershipScope, resourceScope, resourceType, permission] of cases) {
    const evaluator = api.createScopedAuthorizationEvaluatorV1();
    const context = evaluatedContext(evaluator, {
      roleId,
      membershipScope,
      resourceScope,
      resourceType,
    });
    assert.deepEqual(evaluator.authorizeV1(context, permission), {
      allowed: true,
      permission,
      tenantScope: resourceScope,
    });
  }
});

test('[IAM-002, IAM-003] deny-by-default covers role, action, channel, membership, and policy', async () => {
  const api = await loadAuthorization();
  assert.ok(api);

  const cases = [
    ['custom-admin', 'api', true, true, 'artifact.record.read', 'UNKNOWN_ROLE'],
    ['viewer', 'api', true, true, 'future.resource.read', 'UNKNOWN_PERMISSION'],
    ['viewer', 'carrier-pigeon', true, true, 'artifact.record.read', 'UNKNOWN_CHANNEL'],
    ['viewer', 'api', false, true, 'artifact.record.read', 'INACTIVE_MEMBERSHIP'],
    ['viewer', 'api', true, false, 'artifact.record.read', 'POLICY_CONDITIONS_REQUIRED'],
    ['viewer', 'api', true, true, 'artifact.original.download', 'ROLE_PERMISSION_MISSING'],
    ['owner', 'api', true, true, 'approval.decision.create', 'ROLE_PERMISSION_MISSING'],
  ];

  for (const [
    roleId,
    channel,
    membershipActive,
    policyConditionsSatisfied,
    permission,
    code,
  ] of cases) {
    const evaluator = api.createScopedAuthorizationEvaluatorV1();
    const context = evaluatedContext(evaluator, {
      roleId,
      membershipScope: workspaceA,
      resourceScope: projectA,
      resourceType: permission.startsWith('billing.') ? 'billing-account' : 'artifact',
      channel,
      membershipActive,
      policyConditionsSatisfied,
    });
    assert.deepEqual(evaluator.authorizeV1(context, permission), { allowed: false, code });
  }
});

test('[IAM-002, IAM-009, IAM-019] rejects cross-scope and wrong-resource authorization', async () => {
  const api = await loadAuthorization();
  assert.ok(api);

  const cases = [
    [organizationB, projectA, 'TENANT_SCOPE_MISMATCH'],
    [workspaceB, projectA, 'TENANT_SCOPE_MISMATCH'],
    [projectA, projectB, 'TENANT_SCOPE_MISMATCH'],
  ];
  for (const [membershipScope, resourceScope, code] of cases) {
    const evaluator = api.createScopedAuthorizationEvaluatorV1();
    const context = evaluatedContext(evaluator, {
      roleId: 'viewer',
      membershipScope,
      resourceScope,
      resourceType: 'artifact',
    });
    assert.deepEqual(evaluator.authorizeV1(context, 'artifact.record.read'), {
      allowed: false,
      code,
    });
  }

  for (const [membershipScope, resourceScope] of [
    [organizationA, workspaceB],
    [organizationA, projectB],
    [workspaceA, projectB],
  ]) {
    const evaluator = api.createScopedAuthorizationEvaluatorV1();
    const context = evaluatedContext(evaluator, {
      roleId: 'viewer',
      membershipScope,
      resourceScope,
      resourceType: 'artifact',
    });
    assert.deepEqual(evaluator.authorizeV1(context, 'artifact.record.read'), {
      allowed: true,
      permission: 'artifact.record.read',
      tenantScope: resourceScope,
    });
  }

  const evaluator = api.createScopedAuthorizationEvaluatorV1();
  const wrongResource = evaluatedContext(evaluator, {
    roleId: 'analyst',
    membershipScope: workspaceA,
    resourceScope: workspaceA,
    resourceType: 'job',
  });
  assert.deepEqual(evaluator.authorizeV1(wrongResource, 'artifact.record.read'), {
    allowed: false,
    code: 'RESOURCE_TYPE_MISMATCH',
  });
});

test('[IAM-002, IAM-003] known channels and evaluator surface are immutable', async () => {
  const api = await loadAuthorization();
  assert.ok(api);

  assert.deepEqual(api.AUTHORIZATION_CHANNELS_V1, [
    'api',
    'web',
    'desktop',
    'android',
    'worker',
    'sync',
    'stream',
    'shared-link',
  ]);
  assert.ok(Object.isFrozen(api.AUTHORIZATION_CHANNELS_V1));
  assert.ok(Object.isFrozen(api.createScopedAuthorizationEvaluatorV1()));
});
