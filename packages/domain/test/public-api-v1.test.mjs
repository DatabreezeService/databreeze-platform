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
    './entitlements/v1',
    './mfa/v1',
    './device-authorization/v1',
    './data-mode/v1',
    './artifact/v1',
    './dataset/v1',
    './jobs/v1',
    './approval/v1',
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
  assert.equal(aggregate.ENTITLEMENT_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.MFA_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DEVICE_AUTHORIZATION_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.AUDIT_SCHEMA_VERSION_V1, 1);
  assert.equal(aggregate.DATASET_SCHEMA_VERSION_V1, 1);
  assert.equal(typeof aggregate.parseTenantScopeV1, 'function');
  assert.equal(typeof aggregate.createScopedAuthorizationEvaluatorV1, 'function');
});

test('[IAM-004] does not expose an unversioned package root', async () => {
  await assert.rejects(import('@databreeze/domain'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
