import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const indexerPath = path.join(testDirectory, '..', 'src', 'generate-requirement-index.mjs');
const fixturesDirectory = path.join(testDirectory, 'fixtures', 'requirement-traceability');

function quoteCommandArgument(value) {
  return process.platform === 'win32' ? `"${value}"` : `'${value.replaceAll("'", "'\\''")}'`;
}

function runIndexer(fixtureName, extraArguments = [], prepareOutput) {
  const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'databreeze-requirements-'));
  const outputPath = path.join(outputDirectory, 'requirements-index.json');
  const rootPath = path.join(fixturesDirectory, fixtureName);
  prepareOutput?.(outputPath);
  const result = spawnSync(
    process.execPath,
    [indexerPath, '--root', rootPath, '--output', outputPath, ...extraArguments],
    { encoding: 'utf8' },
  );

  return {
    ...result,
    outputPath,
    rootPath,
    cleanup() {
      rmSync(outputDirectory, { force: true, recursive: true });
    },
  };
}

test('generates a deterministic index with requirement text and source metadata', () => {
  const first = runIndexer('valid');
  const second = runIndexer('valid');

  try {
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(first.outputPath, 'utf8'), readFileSync(second.outputPath, 'utf8'));
    assert.deepEqual(JSON.parse(readFileSync(first.outputPath, 'utf8')), {
      requirements: [
        {
          id: 'BAR-001',
          priority: 'P1',
          requirement: 'Bar keeps its first requirement.',
          source: { line: 5, path: 'docs/specs/features/bar.md' },
        },
        {
          id: 'FOO-001',
          priority: 'P0',
          requirement: 'Foo starts with a stable requirement.',
          source: { line: 5, path: 'docs/specs/foundation/foo.md' },
        },
        {
          id: 'FOO-002',
          priority: 'P2',
          requirement: 'Foo keeps sequential identifiers.',
          source: { line: 6, path: 'docs/specs/foundation/foo.md' },
        },
      ],
      version: 1,
    });
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

test('rejects duplicate requirement IDs with deterministic source diagnostics', () => {
  const result = runIndexer('duplicate');

  try {
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      'docs/specs/features/duplicate.md:5: duplicate requirement ID FOO-001; first declared at docs/specs/foundation/foo.md:5\n',
    );
  } finally {
    result.cleanup();
  }
});

test('rejects gaps in a requirement prefix', () => {
  const result = runIndexer('gap');

  try {
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      'docs/specs/foundation/foo.md:6: prefix FOO has a gap: expected FOO-002 before FOO-003\n',
    );
  } finally {
    result.cleanup();
  }
});

test('rejects a requirement table with a missing separator before any row is skipped', () => {
  const result = runIndexer('malformed-separator');

  try {
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      'docs/specs/foundation/foo.md:4: malformed requirement table separator; expected | --- | --- | --- |\n',
    );
  } finally {
    result.cleanup();
  }
});

test('rejects malformed priorities and malformed requirement rows', () => {
  const result = runIndexer('malformed');

  try {
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      'docs/specs/foundation/foo.md:5: malformed priority P3 for requirement FOO-001; expected P0, P1, or P2\n' +
        'docs/specs/foundation/foo.md:6: malformed requirement row; expected | ID | Priority | Requirement |\n' +
        'docs/specs/foundation/foo.md:7: malformed requirement ID FOO-01; expected PREFIX-NNN\n',
    );
  } finally {
    result.cleanup();
  }
});

test('reports output drift without rewriting the checked index', () => {
  const result = runIndexer('valid', ['--check']);

  try {
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      `requirement index drift: ${result.outputPath} is missing or differs; run node tools/repo-cli/src/generate-requirement-index.mjs --root ${quoteCommandArgument(result.rootPath)} --output ${quoteCommandArgument(result.outputPath)}\n`,
    );
  } finally {
    result.cleanup();
  }
});

test('reports stale index drift without rewriting the existing bytes', () => {
  const staleContents = '{\n  "version": 0\n}\n';
  const result = runIndexer('valid', ['--check'], (outputPath) => {
    writeFileSync(outputPath, staleContents);
  });

  try {
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      `requirement index drift: ${result.outputPath} is missing or differs; run node tools/repo-cli/src/generate-requirement-index.mjs --root ${quoteCommandArgument(result.rootPath)} --output ${quoteCommandArgument(result.outputPath)}\n`,
    );
    assert.equal(readFileSync(result.outputPath, 'utf8'), staleContents);
  } finally {
    result.cleanup();
  }
});
