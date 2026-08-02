import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const script = path.join(repositoryRoot, 'tools/repo-cli/src/generate-provenance.mjs');

test('provenance generation records sorted artifact digests', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'databreeze-provenance-'));
  try {
    const first = path.join(directory, 'z-output.json');
    const second = path.join(directory, 'a-output.json');
    const output = path.join(directory, 'provenance.json');
    writeFileSync(first, 'z');
    writeFileSync(second, 'a');
    const result = spawnSync(
      process.execPath,
      [script, '--output', output, '--artifact', first, '--artifact', second],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const provenance = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(
      provenance.subject.map((subject) => path.posix.basename(subject.path)),
      ['a-output.json', 'z-output.json'],
    );
    assert.deepEqual(
      provenance.subject.map((subject) => subject.sha256),
      [
        'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
        '594e519ae499312b29433b7dd8a97ff068defcba9755b6d5d00e84c524d67b06',
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provenance generation fails closed when an artifact is missing', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'databreeze-provenance-missing-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--output',
        path.join(directory, 'provenance.json'),
        '--artifact',
        path.join(directory, 'missing.json'),
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Provenance artifact\(s\) do not exist/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provenance generation rejects an artifact flag without a path', () => {
  const result = spawnSync(process.execPath, [script, '--artifact'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /--artifact requires a file path/u);
});

test('provenance generation rejects an output flag without a path', () => {
  const result = spawnSync(process.execPath, [script, '--output'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /--output requires a file path/u);
});
