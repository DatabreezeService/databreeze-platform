import assert from 'node:assert/strict';

const [aggregate, permissions, tenantScope, authorization, artifact, dataset] = await Promise.all([
  import('@databreeze/domain/v1'),
  import('@databreeze/domain/permissions/v1'),
  import('@databreeze/domain/tenant-scope/v1'),
  import('@databreeze/domain/authorization/v1'),
  import('@databreeze/domain/artifact/v1'),
  import('@databreeze/domain/dataset/v1'),
]);

assert.equal(aggregate.PERMISSION_SCHEMA_VERSION_V1, 1);
assert.equal(aggregate.AUTHORIZATION_SCHEMA_VERSION_V1, 1);
assert.equal(permissions.PERMISSION_SCHEMA_VERSION_V1, 1);
assert.equal(typeof tenantScope.parseTenantScopeV1, 'function');
assert.equal(typeof authorization.createScopedAuthorizationEvaluatorV1, 'function');
assert.equal(artifact.ARTIFACT_SCHEMA_VERSION_V1, 1);
assert.equal(dataset.DATASET_SCHEMA_VERSION_V1, 1);
await assert.rejects(import('@databreeze/domain'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
