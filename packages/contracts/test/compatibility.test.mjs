import assert from 'node:assert/strict';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compatibilityScript = resolve(packageRoot, 'scripts/contract-compatibility.mjs');

function runCompatibility(root, command, extraArguments = []) {
  return spawnSync(
    process.execPath,
    [compatibilityScript, command, '--root', root, ...extraArguments],
    { cwd: packageRoot, encoding: 'utf8' },
  );
}

function withPackageCopy(callback) {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'databreeze-contract-compatibility-'));
  const copyRoot = resolve(temporaryRoot, 'contracts');
  cpSync(packageRoot, copyRoot, { recursive: true });
  try {
    callback(copyRoot);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

test('the checked-in published v1 compatibility baseline accepts unchanged contracts', () => {
  const run = runCompatibility(packageRoot, 'check');
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /Published contract compatibility baseline is unchanged/u);
});

test('compatibility check rejects a missing published schema', () => {
  withPackageCopy((copyRoot) => {
    rmSync(resolve(copyRoot, 'schemas/v1/identifier.schema.json'));

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Published schema is missing: schemas\/v1\/identifier\.schema\.json/u);
  });
});

test('compatibility check rejects changed schema bytes in place', () => {
  withPackageCopy((copyRoot) => {
    appendFileSync(resolve(copyRoot, 'schemas/v1/revision.schema.json'), '\n', 'utf8');

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Published schema bytes changed in place: revision/u);
  });
});

test('compatibility check rejects changed generated public output in place', () => {
  withPackageCopy((copyRoot) => {
    appendFileSync(resolve(copyRoot, 'generated/typescript/v1/index.ts'), '\n', 'utf8');

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(
      run.stderr,
      /Published public output changed in place: generated\/typescript\/v1\/index\.ts/u,
    );
  });
});

test('compatibility check covers Python package metadata and root package markers', () => {
  for (const path of [
    'generated/python/pyproject.toml',
    'generated/python/databreeze_contracts/__init__.py',
    'generated/python/databreeze_contracts/py.typed',
  ]) {
    withPackageCopy((copyRoot) => {
      appendFileSync(resolve(copyRoot, path), '# changed\n', 'utf8');

      const run = runCompatibility(copyRoot, 'check');
      assert.equal(run.status, 1, `${path}\n${run.stdout}\n${run.stderr}`);
      assert.match(run.stderr, /Published public output changed in place/u);
    });
  }
});

test('compatibility check rejects added and removed public outputs', () => {
  withPackageCopy((copyRoot) => {
    writeFileSync(
      resolve(copyRoot, 'generated/python/databreeze_contracts/public_api.py'),
      '# unexpected public output\n',
      'utf8',
    );

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Generated output is not declared in public-output inventory/u);
  });

  withPackageCopy((copyRoot) => {
    rmSync(resolve(copyRoot, 'generated/python/databreeze_contracts/py.typed'));

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Published public output is missing/u);
  });
});

test('compatibility check rejects public package export mapping drift', () => {
  withPackageCopy((copyRoot) => {
    const packagePath = resolve(copyRoot, 'package.json');
    const packageManifest = JSON.parse(readFileSync(packagePath, 'utf8'));
    packageManifest.exports['./v1'].import = './generated/typescript/v1/not-public.mjs';
    writeFileSync(packagePath, `${JSON.stringify(packageManifest, null, 2)}\n`, 'utf8');

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Published package surface changed in place/u);
  });
});

test('compatibility check rejects a changed public-output inventory', () => {
  withPackageCopy((copyRoot) => {
    writeFileSync(
      resolve(copyRoot, 'public-outputs.json'),
      `${JSON.stringify({ inventoryFormat: 1, versions: [] }, null, 2)}\n`,
      'utf8',
    );

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Published public-output inventory changed in place/u);
  });
});

test('compatibility check rejects a missing baseline', () => {
  withPackageCopy((copyRoot) => {
    rmSync(resolve(copyRoot, 'compatibility/v1/baseline.json'), { force: true });

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Published baseline is missing: compatibility\/v1\/baseline\.json/u);
  });
});

test('compatibility check rejects unauthorized baseline drift', () => {
  withPackageCopy((copyRoot) => {
    const baselinePath = resolve(copyRoot, 'compatibility/v1/baseline.json');
    if (existsSync(baselinePath)) appendFileSync(baselinePath, '\n', 'utf8');

    const run = runCompatibility(copyRoot, 'check');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Published baseline drift detected for v1/u);
  });
});

test('baseline update is deterministic for a reviewed unpublished version', () => {
  withPackageCopy((copyRoot) => {
    rmSync(resolve(copyRoot, 'compatibility'), { recursive: true, force: true });

    const first = runCompatibility(copyRoot, 'update', ['--version', '1', '--approve-new-version']);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const firstPublished = readFileSync(resolve(copyRoot, 'compatibility/published.json'), 'utf8');
    const firstBaseline = readFileSync(resolve(copyRoot, 'compatibility/v1/baseline.json'), 'utf8');

    const second = runCompatibility(copyRoot, 'update', [
      '--version',
      '1',
      '--approve-new-version',
    ]);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.equal(
      readFileSync(resolve(copyRoot, 'compatibility/published.json'), 'utf8'),
      firstPublished,
    );
    assert.equal(
      readFileSync(resolve(copyRoot, 'compatibility/v1/baseline.json'), 'utf8'),
      firstBaseline,
    );
  });
});

test('baseline update refuses to rewrite an already published v1 contract', () => {
  withPackageCopy((copyRoot) => {
    appendFileSync(resolve(copyRoot, 'schemas/v1/revision.schema.json'), '\n', 'utf8');

    const run = runCompatibility(copyRoot, 'update', ['--version', '1', '--approve-new-version']);
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(
      run.stderr,
      /Refusing to rewrite published v1; publish new schema IDs and a new version/u,
    );
  });
});
