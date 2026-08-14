import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('[JRA-032/BUA-023] migration rejects legacy descriptors before requiring opaque settlement authority', async () => {
  const migration = await readFile(
    resolve(
      process.cwd(),
      'prisma/migrations/20260814110100_jra_worker_result_finalization/migration.sql',
    ),
    'utf8',
  );
  const preflight = migration.indexOf('JRA_RESULT_USAGE_SETTLEMENT_BINDING_REPAIR_REQUIRED');
  const alteration = migration.indexOf(
    'ADD COLUMN "result_usage_settlement_binding_id" UUID NOT NULL',
  );

  assert.ok(preflight >= 0, 'migration must name the governed repair requirement');
  assert.ok(alteration > preflight, 'preflight must execute before the NOT NULL alteration');
  assert.match(migration, /IF EXISTS\s*\(\s*SELECT 1\s+FROM "jra"\."execution_request_descriptors"/u);
  assert.doesNotMatch(migration, /gen_random_uuid|uuid_generate|UPDATE\s+"jra"\."execution_request_descriptors"/iu);
});
