import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const apiDirectory =
  path.basename(process.cwd()) === 'api'
    ? process.cwd()
    : path.join(process.cwd(), 'services', 'api');

void test('[DSO-026/027][IAM-019] migration adds full-scope current authority and atomic CAS support', async () => {
  const sql = await readFile(
    path.join(
      apiDirectory,
      'prisma',
      'migrations',
      '20260814090000_dso_workspace_policy_authority',
      'migration.sql',
    ),
    'utf8',
  );

  for (const statement of [
    'CREATE TABLE "dso"."workspace_data_mode_policies"',
    'workspace_data_mode_policies_workspace_key',
    'workspace_data_mode_policies_scope_id_key',
    'device_data_mode_policies_scope_version_key',
    'FOREIGN KEY ("organization_id", "workspace_id", "id", "current_version_id")',
    'ADD COLUMN "data_mode_policy_id" UUID',
    'ADD COLUMN "current_data_mode_policy_version_id" UUID',
    'ADD COLUMN "data_mode_projection" VARCHAR(16)',
    "CHECK (\"data_mode_projection\" IN ('LOCAL', 'HYBRID', 'CLOUD'))",
  ]) {
    assert.ok(sql.includes(statement), statement);
  }
  assert.doesNotMatch(sql, /ORDER BY[^;]*revision[^;]*DESC/iu);
  assert.match(sql, /HAVING COUNT\(\*\) = 1/iu);
  assert.match(sql, /assert_workspace_data_mode_policy_binding_ready/iu);
  assert.match(sql, /authorization_epoch" = workspace\."authorization_epoch" \+ 1/iu);
});

void test('[DSO-026/027][IAM-019] contract migration executes preflight before requiring IAM bindings', async () => {
  const sql = await readFile(
    path.join(
      apiDirectory,
      'prisma',
      'migrations',
      '20260814090100_dso_workspace_policy_authority_contract',
      'migration.sql',
    ),
    'utf8',
  );

  const preflight = sql.indexOf('assert_workspace_data_mode_policy_binding_ready');
  const notNull = sql.indexOf('ALTER COLUMN "data_mode_policy_id" SET NOT NULL');
  assert.ok(preflight >= 0);
  assert.ok(notNull > preflight);
  assert.match(sql, /ALTER COLUMN "current_data_mode_policy_version_id" SET NOT NULL/iu);
  assert.match(sql, /ALTER COLUMN "data_mode_projection" SET NOT NULL/iu);
});
