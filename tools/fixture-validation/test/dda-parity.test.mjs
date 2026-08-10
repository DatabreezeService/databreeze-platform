import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { runDdaParity } from '../src/run-dda-parity.mjs';

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(toolRoot, '../..');

test('[DDA-038] local and cloud messy-sales ETL produce identical governed hashes', () => {
  const first = runDdaParity();
  const second = runDdaParity();
  assert.equal(first.rowCount, 4);
  assert.equal(first.rejectedCount, 1);
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.schemaHash, second.schemaHash);
  assert.match(first.contentHash, /^[0-9a-f]{64}$/u);
});

test('[DDA-051] V1 freshness enums exclude STREAMING', () => {
  const domain = readFileSync(
    resolve(repositoryRoot, 'packages/domain/src/data-to-dashboard/v1.ts'),
    'utf8',
  );
  assert.match(domain, /'ON_CHANGE' \| 'MANUAL' \| 'SCHEDULED'/u);
  assert.doesNotMatch(domain, /STREAMING/u);

  const schema = readFileSync(
    resolve(repositoryRoot, 'packages/contracts/schemas/v1/dda-dashboard-version.schema.json'),
    'utf8',
  );
  assert.match(schema, /ON_CHANGE\|MANUAL\|SCHEDULED/u);
  assert.doesNotMatch(schema, /STREAMING/u);

  const invalidStreaming = JSON.parse(
    readFileSync(
      resolve(
        repositoryRoot,
        'packages/test-fixtures/contracts/v1/payloads/dda-dashboard-version/invalid-streaming.json',
      ),
      'utf8',
    ),
  );
  assert.equal(invalidStreaming.freshnessPolicy, 'STREAMING');
});

test('[DDA-038] parity CLI exits zero', () => {
  const run = spawnSync(process.execPath, [resolve(toolRoot, 'src/run-dda-parity.mjs')], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, UV_NO_CACHE: process.env.UV_NO_CACHE ?? '1' },
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.requirementId, 'DDA-038');
});
