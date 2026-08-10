import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(toolRoot, '../..');
const engineRoot = resolve(repositoryRoot, 'services/engine');
const messyRoot = resolve(toolRoot, 'fixtures/dda/messy-sales');

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runPythonParity() {
  const uv = process.env.DATABREEZE_UV ?? 'uv';
  const script = `
import json
from pathlib import Path
from databreeze_engine.processors.dda_etl_execute import execute_etl

rows = json.loads(Path(r'''${resolve(messyRoot, 'rows.json')}''').read_text(encoding='utf-8'))
plan = json.loads(Path(r'''${resolve(messyRoot, 'plan.json')}''').read_text(encoding='utf-8'))

def run(mode):
    ordered = list(reversed(rows)) if mode == 'cloud' else list(rows)
    ordered = sorted(ordered, key=lambda row: (row.get('sold_at', ''), row.get('name', '')))
    return execute_etl(
        rows=ordered,
        transformations=plan['transformations'],
        input_artifact_version_id=plan['inputArtifactVersionId'],
    )

local = run('local')
cloud = run('cloud')
print(json.dumps({'local': local.model_dump(mode='json'), 'cloud': cloud.model_dump(mode='json')}))
`.trim();

  const run = spawnSync(
    uv,
    ['run', '--locked', '--offline', '--no-sync', '--project', engineRoot, 'python', '-c', script],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NO_COLOR: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        UV_NO_PROGRESS: '1',
        UV_PYTHON_DOWNLOADS: 'never',
      },
      windowsHide: true,
      timeout: 300_000,
    },
  );
  if (run.status !== 0) {
    fail(`python parity failed: ${run.stdout}\n${run.stderr}`);
  }
  return JSON.parse(run.stdout);
}

function assertParity(payload) {
  const expected = JSON.parse(readFileSync(resolve(messyRoot, 'expected.json'), 'utf8'));
  const { local, cloud } = payload;
  for (const side of [local, cloud]) {
    if (side.rowCount !== expected.rowCount) fail(`rowCount mismatch: ${side.rowCount}`);
    if (side.rejectedCount !== expected.rejectedCount) {
      fail(`rejectedCount mismatch: ${side.rejectedCount}`);
    }
    if (side.partial !== expected.partial) fail(`partial mismatch: ${side.partial}`);
    if (side.quality.completeness_denominator !== expected.quality.completeness_denominator) {
      fail('quality completeness denominator mismatch');
    }
    if (JSON.stringify(side.lineageIds) !== JSON.stringify(expected.lineageIds)) {
      fail('lineage mismatch');
    }
  }
  if (local.contentHash !== cloud.contentHash) fail('contentHash local/cloud diverge');
  if (local.schemaHash !== cloud.schemaHash) fail('schemaHash local/cloud diverge');
  return {
    requirementId: 'DDA-038',
    fixture: 'messy-sales',
    contentHash: local.contentHash,
    schemaHash: local.schemaHash,
    rowCount: local.rowCount,
    rejectedCount: local.rejectedCount,
    fixtureHash: sha256(readFileSync(resolve(messyRoot, 'rows.json'))),
  };
}

export function runDdaParity() {
  const payload = runPythonParity();
  return assertParity(payload);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  try {
    const summary = runDdaParity();
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
