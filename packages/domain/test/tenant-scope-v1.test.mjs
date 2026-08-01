import assert from 'node:assert/strict';
import test from 'node:test';

async function loadTenantScope() {
  try {
    return await import('../src/tenant-scope/v1.ts');
  } catch {
    return undefined;
  }
}

const ids = Object.freeze({
  organizationA: '018f0f8c-7b77-7abc-8def-0123456789ab',
  organizationB: '018f0f8c-7b77-7abc-9def-0123456789ac',
  workspaceA: '11111111-1111-4111-8111-111111111111',
  workspaceB: '11111111-1111-4111-8111-111111111112',
  projectA: '22222222-2222-4222-8222-222222222222',
  projectB: '33333333-3333-4333-8333-333333333333',
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

test('[IAM-001] accepts only non-guessable UUIDv4/v7 identifiers and strict UTC timestamps', async () => {
  const api = await loadTenantScope();
  assert.ok(api, 'the tenant-scope/v1 module must exist');

  assert.equal(api.parseStableIdentifierV1(ids.organizationA).accepted, true);
  assert.equal(api.parseStableIdentifierV1(ids.workspaceA).accepted, true);
  assert.deepEqual(api.parseStableIdentifierV1('00000000-0000-0000-0000-000000000000'), {
    accepted: false,
    code: 'INVALID_IDENTIFIER',
  });
  assert.deepEqual(api.parseStableIdentifierV1('6ba7b810-9dad-11d1-80b4-00c04fd430c8'), {
    accepted: false,
    code: 'INVALID_IDENTIFIER',
  });
  assert.deepEqual(api.parseStableIdentifierV1(123), {
    accepted: false,
    code: 'INVALID_IDENTIFIER',
  });

  assert.equal(api.parseStrictUtcTimestampV1('2026-08-01T12:34:56.123Z').accepted, true);
  assert.deepEqual(api.parseStrictUtcTimestampV1('2026-08-01T19:34:56+07:00'), {
    accepted: false,
    code: 'INVALID_UTC_TIMESTAMP',
  });
  assert.deepEqual(api.parseStrictUtcTimestampV1('2026-08-01T12:34:56z'), {
    accepted: false,
    code: 'INVALID_UTC_TIMESTAMP',
  });
});

test('[IAM-001, IAM-019] canonicalizes mixed-case UUID identities to lowercase', async () => {
  const api = await loadTenantScope();
  assert.ok(api);

  assert.deepEqual(api.parseStableIdentifierV1(ids.organizationA.toUpperCase()), {
    accepted: true,
    value: ids.organizationA,
  });

  const mixedCaseProject = {
    scopeType: 'project',
    organizationId: ids.organizationA.toUpperCase(),
    workspaceId: ids.workspaceA.toUpperCase(),
    projectId: ids.projectA.toUpperCase(),
  };
  const parsed = expectAccepted(api.parseTenantScopeV1(mixedCaseProject));
  assert.deepEqual(parsed, projectA);
  assert.equal(
    api.tenantScopesEqualV1(parsed, expectAccepted(api.parseTenantScopeV1(projectA))),
    true,
  );
});

test('[IAM-019] parses only complete closed tenant ancestry', async () => {
  const api = await loadTenantScope();
  assert.ok(api);

  for (const scope of [organizationA, workspaceA, projectA]) {
    const parsed = expectAccepted(api.parseTenantScopeV1(scope));
    assert.deepEqual(parsed, scope);
    assert.ok(Object.isFrozen(parsed));
  }

  for (const scope of [
    undefined,
    { scopeType: 'workspace', workspaceId: ids.workspaceA },
    {
      scopeType: 'project',
      organizationId: ids.organizationA,
      workspaceId: ids.workspaceA,
    },
    { ...workspaceA, projectId: ids.projectA },
  ]) {
    assert.deepEqual(api.parseTenantScopeV1(scope), {
      accepted: false,
      code: 'INVALID_TENANT_SCOPE',
    });
  }
});

test('[IAM-019] equality and containment require complete matching ancestry', async () => {
  const api = await loadTenantScope();
  assert.ok(api);
  const orgA = expectAccepted(api.parseTenantScopeV1(organizationA));
  const orgB = expectAccepted(api.parseTenantScopeV1(organizationB));
  const wsA = expectAccepted(api.parseTenantScopeV1(workspaceA));
  const wsB = expectAccepted(api.parseTenantScopeV1(workspaceB));
  const projA = expectAccepted(api.parseTenantScopeV1(projectA));
  const projB = expectAccepted(api.parseTenantScopeV1(projectB));

  assert.equal(api.tenantScopesEqualV1(wsA, wsA), true);
  assert.equal(api.tenantScopesEqualV1(wsA, wsB), false);
  assert.equal(api.tenantScopeContainsV1(orgA, wsA), true);
  assert.equal(api.tenantScopeContainsV1(orgA, projA), true);
  assert.equal(api.tenantScopeContainsV1(orgB, wsA), false);
  assert.equal(api.tenantScopeContainsV1(wsA, projA), true);
  assert.equal(api.tenantScopeContainsV1(wsA, projB), true);
  assert.equal(api.tenantScopeContainsV1(wsA, wsB), false);
  assert.equal(api.tenantScopeContainsV1(projA, projB), false);
  assert.equal(api.tenantScopeContainsV1(projA, wsA), false);
});

test('[IAM-019] narrowing permits descendants but never parents or siblings', async () => {
  const api = await loadTenantScope();
  assert.ok(api);
  const orgA = expectAccepted(api.parseTenantScopeV1(organizationA));
  const wsA = expectAccepted(api.parseTenantScopeV1(workspaceA));
  const wsB = expectAccepted(api.parseTenantScopeV1(workspaceB));
  const projA = expectAccepted(api.parseTenantScopeV1(projectA));
  const projB = expectAccepted(api.parseTenantScopeV1(projectB));

  assert.equal(api.narrowTenantScopeV1(orgA, wsA), wsA);
  assert.equal(api.narrowTenantScopeV1(orgA, projA), projA);
  assert.equal(api.narrowTenantScopeV1(wsA, projA), projA);
  assert.equal(api.narrowTenantScopeV1(projA, projA), projA);
  assert.equal(api.narrowTenantScopeV1(wsA, orgA), undefined);
  assert.equal(api.narrowTenantScopeV1(wsA, wsB), undefined);
  assert.equal(api.narrowTenantScopeV1(projA, projB), undefined);
});

test('[IAM-019] property: successful narrowing cannot broaden a scope', async () => {
  const api = await loadTenantScope();
  assert.ok(api);

  const rawScopes = [];
  for (let index = 1; index <= 16; index += 1) {
    const organizationId = `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`;
    const workspaceId = `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000002`;
    const projectId = `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000003`;
    rawScopes.push(
      { scopeType: 'organization', organizationId },
      { scopeType: 'workspace', organizationId, workspaceId },
      { scopeType: 'project', organizationId, workspaceId, projectId },
    );
  }
  const scopes = rawScopes.map((scope) => expectAccepted(api.parseTenantScopeV1(scope)));

  for (const current of scopes) {
    for (const candidate of scopes) {
      const narrowed = api.narrowTenantScopeV1(current, candidate);
      assert.equal(narrowed !== undefined, api.tenantScopeContainsV1(current, candidate));
      if (narrowed !== undefined) {
        assert.equal(api.tenantScopesEqualV1(narrowed, candidate), true);
        assert.equal(api.tenantScopeContainsV1(current, narrowed), true);
      }
    }
  }
});
