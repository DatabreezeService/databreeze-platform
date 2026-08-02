import assert from 'node:assert/strict';

const [
  aggregate,
  permissions,
  tenantScope,
  authorization,
  artifact,
  dataset,
  dataMode,
  jobs,
  approval,
  executionAttempt,
  resultManifest,
  dispatch,
  recipe,
  finding,
] = await Promise.all([
  import('@databreeze/domain/v1'),
  import('@databreeze/domain/permissions/v1'),
  import('@databreeze/domain/tenant-scope/v1'),
  import('@databreeze/domain/authorization/v1'),
  import('@databreeze/domain/artifact/v1'),
  import('@databreeze/domain/dataset/v1'),
  import('@databreeze/domain/data-mode/v1'),
  import('@databreeze/domain/jobs/v1'),
  import('@databreeze/domain/approval/v1'),
  import('@databreeze/domain/execution-attempt/v1'),
  import('@databreeze/domain/result-manifest/v1'),
  import('@databreeze/domain/dispatch/v1'),
  import('@databreeze/domain/recipe/v1'),
  import('@databreeze/domain/finding/v1'),
]);

assert.equal(aggregate.PERMISSION_SCHEMA_VERSION_V1, 1);
assert.equal(aggregate.AUTHORIZATION_SCHEMA_VERSION_V1, 1);
assert.equal(permissions.PERMISSION_SCHEMA_VERSION_V1, 1);
assert.equal(typeof tenantScope.parseTenantScopeV1, 'function');
assert.equal(typeof authorization.createScopedAuthorizationEvaluatorV1, 'function');
assert.equal(artifact.ARTIFACT_SCHEMA_VERSION_V1, 1);
assert.equal(dataset.DATASET_SCHEMA_VERSION_V1, 1);
assert.equal(dataMode.DATA_MODE_POLICY_SCHEMA_VERSION_V1, 1);
assert.equal(jobs.JOB_SCHEMA_VERSION_V1, 1);
assert.equal(approval.APPROVAL_SCHEMA_VERSION_V1, 1);
assert.equal(executionAttempt.EXECUTION_ATTEMPT_SCHEMA_VERSION_V1, 1);
assert.equal(resultManifest.RESULT_MANIFEST_SCHEMA_VERSION_V1, 1);
assert.equal(dispatch.DISPATCH_SCHEMA_VERSION_V1, 1);
assert.equal(recipe.RECIPE_SCHEMA_VERSION_V1, 1);
assert.equal(finding.FINDING_SCHEMA_VERSION_V1, 1);
await assert.rejects(import('@databreeze/domain'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
