import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const script = path.join(repositoryRoot, 'tools/repo-cli/src/generate-sbom.mjs');

test('SBOM generation rejects an output flag without a path', () => {
  const result = spawnSync(process.execPath, [script, '--output'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /--output requires a file path/u);
});

test('SBOM generation writes to an explicit output path', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'databreeze-sbom-'));
  try {
    const output = path.join(directory, 'sbom.json');
    const result = spawnSync(process.execPath, [script, '--output', output], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Wrote .*sbom\.json/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
