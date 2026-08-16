import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// The test is executed from the API package both before and after TypeScript
// compilation. Resolving from import.meta.url would point into build/test after
// compilation, where Prisma migrations are intentionally not copied.
const currentDirectory = process.cwd();
const apiDirectory =
  path.basename(currentDirectory) === 'api' &&
  path.basename(path.dirname(currentDirectory)) === 'services'
    ? currentDirectory
    : path.join(currentDirectory, 'services', 'api');

void test('[DSO-024/026] migration creates immutable full-scope execution route decisions', async () => {
  const sql = await readFile(
    path.join(
      apiDirectory,
      'prisma',
      'migrations',
      '20260814080000_dso_execution_route_decisions',
      'migration.sql',
    ),
    'utf8',
  );
  for (const statement of [
    'CREATE TABLE "dso"."execution_route_decisions"',
    'execution_route_decisions_scope_id_key',
    'execution_route_decisions_route_revision_key',
    'execution_route_decisions_policy_idx',
    'execution_route_decisions_immutable',
    'CREATE TRIGGER execution_route_decisions_immutable_trigger',
    'CHECK ("expires_at" > "created_at")',
    'CHECK ("expires_at" <= "created_at" + INTERVAL \'24 hours\')',
    '("target" = \'DEVICE\' AND "target_device_id" IS NOT NULL AND "executor_class" <> \'CLOUD\')',
  ]) {
    assert.match(sql, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.doesNotMatch(sql, /path|url|credential|source_bytes|original_bytes/iu);
});
