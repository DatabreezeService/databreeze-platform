import assert from 'node:assert/strict';

const [
  aggregate,
  permissions,
  tenantScope,
  authorization,
  artifact,
  artifactIntake,
  artifactGovernance,
  artifactRetention,
  artifactExport,
  artifactUpload,
  protectedDocument,
  dataset,
  datasetGovernance,
  datasetQuality,
  datasetProfile,
  datasetExport,
  spreadsheetAudit,
  dataMode,
  jobs,
  approval,
  executionAttempt,
  resultManifest,
  dispatch,
  recipe,
  finding,
  referenceEntity,
  mapping,
  ruleSet,
  evidenceGrant,
] = await Promise.all([
  import('@databreeze/domain/v1'),
  import('@databreeze/domain/permissions/v1'),
  import('@databreeze/domain/tenant-scope/v1'),
  import('@databreeze/domain/authorization/v1'),
  import('@databreeze/domain/artifact/v1'),
  import('@databreeze/domain/artifact-intake/v1'),
  import('@databreeze/domain/artifact-governance/v1'),
  import('@databreeze/domain/artifact-retention/v1'),
  import('@databreeze/domain/artifact-export/v1'),
  import('@databreeze/domain/artifact-upload/v1'),
  import('@databreeze/domain/protected-document/v1'),
  import('@databreeze/domain/dataset/v1'),
  import('@databreeze/domain/dataset-governance/v1'),
  import('@databreeze/domain/dataset-quality/v1'),
  import('@databreeze/domain/dataset-profile/v1'),
  import('@databreeze/domain/dataset-export/v1'),
  import('@databreeze/domain/spreadsheet-audit/v1'),
  import('@databreeze/domain/data-mode/v1'),
  import('@databreeze/domain/jobs/v1'),
  import('@databreeze/domain/approval/v1'),
  import('@databreeze/domain/execution-attempt/v1'),
  import('@databreeze/domain/result-manifest/v1'),
  import('@databreeze/domain/dispatch/v1'),
  import('@databreeze/domain/recipe/v1'),
  import('@databreeze/domain/finding/v1'),
  import('@databreeze/domain/reference-entity/v1'),
  import('@databreeze/domain/mapping/v1'),
  import('@databreeze/domain/rule-set/v1'),
  import('@databreeze/domain/evidence-grant/v1'),
]);

assert.equal(aggregate.PERMISSION_SCHEMA_VERSION_V1, 1);
assert.equal(aggregate.AUTHORIZATION_SCHEMA_VERSION_V1, 1);
assert.equal(permissions.PERMISSION_SCHEMA_VERSION_V1, 1);
assert.equal(typeof tenantScope.parseTenantScopeV1, 'function');
assert.equal(typeof authorization.createScopedAuthorizationEvaluatorV1, 'function');
assert.equal(artifact.ARTIFACT_SCHEMA_VERSION_V1, 1);
assert.equal(artifactIntake.ARTIFACT_INTAKE_SCHEMA_VERSION_V1, 1);
assert.equal(artifactGovernance.ARTIFACT_GOVERNANCE_SCHEMA_VERSION_V1, 1);
assert.equal(artifactRetention.ARTIFACT_RETENTION_SCHEMA_VERSION_V1, 1);
assert.equal(artifactExport.ARTIFACT_EXPORT_SCHEMA_VERSION_V1, 1);
assert.equal(artifactUpload.ARTIFACT_UPLOAD_SCHEMA_VERSION_V1, 1);
assert.equal(protectedDocument.PROTECTED_DOCUMENT_SCHEMA_VERSION_V1, 1);
assert.equal(dataset.DATASET_SCHEMA_VERSION_V1, 1);
assert.equal(datasetGovernance.DATASET_GOVERNANCE_SCHEMA_VERSION_V1, 1);
assert.equal(datasetQuality.DATASET_QUALITY_SCHEMA_VERSION_V1, 1);
assert.equal(datasetProfile.DATASET_PROFILE_SCHEMA_VERSION_V1, 1);
assert.equal(datasetExport.DATASET_EXPORT_SCHEMA_VERSION_V1, 1);
assert.equal(spreadsheetAudit.SPREADSHEET_AUDIT_SCHEMA_VERSION_V1, 1);
assert.equal(dataMode.DATA_MODE_POLICY_SCHEMA_VERSION_V1, 1);
assert.equal(jobs.JOB_SCHEMA_VERSION_V1, 1);
assert.equal(approval.APPROVAL_SCHEMA_VERSION_V1, 1);
assert.equal(executionAttempt.EXECUTION_ATTEMPT_SCHEMA_VERSION_V1, 1);
assert.equal(resultManifest.RESULT_MANIFEST_SCHEMA_VERSION_V1, 1);
assert.equal(dispatch.DISPATCH_SCHEMA_VERSION_V1, 1);
assert.equal(recipe.RECIPE_SCHEMA_VERSION_V1, 1);
assert.equal(finding.FINDING_SCHEMA_VERSION_V1, 1);
assert.equal(referenceEntity.REFERENCE_ENTITY_SCHEMA_VERSION_V1, 1);
assert.equal(mapping.MAPPING_SCHEMA_VERSION_V1, 1);
assert.equal(ruleSet.RULE_SET_SCHEMA_VERSION_V1, 1);
assert.equal(evidenceGrant.EVIDENCE_GRANT_SCHEMA_VERSION_V1, 1);
await assert.rejects(import('@databreeze/domain'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
