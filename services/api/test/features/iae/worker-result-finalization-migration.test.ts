import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const apiDirectory =
  path.basename(process.cwd()) === 'api'
    ? process.cwd()
    : path.join(process.cwd(), 'services', 'api');

void test('[IAE-007/024] migration persists exact-scope immutable content-free attestations', async () => {
  const sql = await readFile(
    path.join(
      apiDirectory,
      'prisma',
      'migrations',
      '20260814110000_iae_worker_result_finalization',
      'migration.sql',
    ),
    'utf8',
  );

  for (const required of [
    'CREATE TABLE "iae"."worker_result_finalization_attestations"',
    'worker_result_attestations_scope_submission_key',
    'worker_result_attestations_scope_version_key',
    '"execution_descriptor_hash" CHAR(64) NOT NULL',
    '"source_lineage_hash" CHAR(64) NOT NULL',
    '"output_policy_hash" CHAR(64) NOT NULL',
    '"request_hash" CHAR(64) NOT NULL',
    'worker_result_attestations_immutable',
    'attested_artifact_versions_immutable',
    'attested_content_placements_immutable',
    'attested_artifact_lineage_immutable',
  ])
    assert.ok(sql.includes(required), required);

  assert.doesNotMatch(sql, /(?:bucket|storage_key|signed_url|credential|raw_bytes)/iu);
});
