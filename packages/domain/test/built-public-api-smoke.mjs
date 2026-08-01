import assert from 'node:assert/strict';

const [aggregate, permissions, tenantScope, authorization] = await Promise.all([
  import('@databreeze/domain/v1'),
  import('@databreeze/domain/permissions/v1'),
  import('@databreeze/domain/tenant-scope/v1'),
  import('@databreeze/domain/authorization/v1'),
]);

assert.equal(aggregate.PERMISSION_SCHEMA_VERSION_V1, 1);
assert.equal(aggregate.AUTHORIZATION_SCHEMA_VERSION_V1, 1);
assert.equal(permissions.PERMISSION_SCHEMA_VERSION_V1, 1);
assert.equal(typeof tenantScope.parseTenantScopeV1, 'function');
assert.equal(typeof authorization.createScopedAuthorizationEvaluatorV1, 'function');
await assert.rejects(import('@databreeze/domain'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
