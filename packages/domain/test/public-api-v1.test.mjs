import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('[IAM-001, IAM-002, IAM-003, IAM-004, IAM-009, IAM-019 partial] publishes only stable versioned entry points', async () => {
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.exports), [
    './v1',
    './permissions/v1',
    './tenant-scope/v1',
    './authorization/v1',
    './audit/v1',
    './identity/v1',
    './service-account/v1',
    './entitlements/v1',
    './mfa/v1',
    './invitation/v1',
    './recovery/v1',
    './device-authorization/v1',
    './device-sync/v1',
    './device-capability/v1',
    './data-mode/v1',
    './pkce/v1',
    './csrf/v1',
    './artifact/v1',
    './artifact-intake/v1',
    './artifact-governance/v1',
    './artifact-retention/v1',
    './artifact-export/v1',
    './artifact-upload/v1',
    './artifact-processing-content/v1',
    './protected-document/v1',
    './dataset/v1',
    './dataset-governance/v1',
    './dataset-quality/v1',
    './dataset-profile/v1',
    './dataset-export/v1',
    './spreadsheet-audit/v1',
    './module-catalog/v1',
    './folder-autopilot/v1',
    './data-quality-guard/v1',
    './client-report-factory/v1',
    './quote-intelligence/v1',
    './invoice-leak-detector/v1',
    './operations-capture/v1',
    './embedded-importer/v1',
    './private-data-analyst/v1',
    './data-to-dashboard/v1',
    './data-to-dashboard/policy-v1',
    './migration-ready/v1',
    './jobs/v1',
    './approval/v1',
    './execution-attempt/v1',
    './result-manifest/v1',
    './dispatch/v1',
    './recipe/v1',
    './finding/v1',
    './reference-entity/v1',
    './mapping/v1',
    './rule-set/v1',
    './evidence-grant/v1',
    './dda-receipt-openai/v1',
  ]);

  for (const entry of Object.values(manifest.exports)) {
    assert.ok(existsSync(path.resolve(packageDirectory, entry.types)));
    assert.match(entry.import, /^\.\/dist\/.+\.js$/);
  }

  let aggregate;
  try {
    aggregate = await import('../dist/v1.js');
  } catch {
    aggregate = undefined;
  }
  assert.ok(aggregate, 'the source v1 aggregate must exist');
  assert.equal(aggregate.PERMISSION_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.AUTHORIZATION_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.IDENTITY_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.SERVICE_ACCOUNT_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.ENTITLEMENT_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.MFA_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.INVITATION_TOKEN_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.PKCE_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.CSRF_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DEVICE_AUTHORIZATION_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.AUDIT_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DATASET_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DATASET_QUALITY_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DATASET_PROFILE_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DATASET_EXPORT_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.SPREADSHEET_AUDIT_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.MODULE_CATALOG_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.FOLDER_AUTOPILOT_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DATA_QUALITY_GUARD_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.CLIENT_REPORT_FACTORY_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.QUOTE_INTELLIGENCE_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.INVOICE_LEAK_DETECTOR_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.OPERATIONS_CAPTURE_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.EMBEDDED_IMPORTER_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.PRIVATE_DATA_ANALYST_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DDA_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DDA_POLICY_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.MIGRATION_READY_SCHEMA_VERSION_V1, 1);
  assert.equal(typeof aggregate.parseTenantScopeV1, 'function');
  assert.equal(aggregate.ARTIFACT_UPLOAD_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.PROTECTED_DOCUMENT_SCHEMA_VERSION_V1, 1);
  assert.equal(typeof aggregate.createScopedAuthorizationEvaluatorV1, 'function');
  assert.equal(aggregate.MAPPING_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.RULE_SET_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.EVIDENCE_GRANT_SCHEMA_VERSION_V1, 1);
});

test('[IAM-004] does not expose an unversioned package root', async () => {
  await assert.rejects(import('@databreeze/domain'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
