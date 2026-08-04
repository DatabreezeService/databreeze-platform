import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { quoteGradleApplicationArgument } from '../src/gradle-application-arguments.mjs';

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(toolRoot, '../..');
const comparatorPath = resolve(toolRoot, 'src/compare-contract-results.mjs');
const orchestratorPath = resolve(toolRoot, 'src/run-contract-parity.mjs');
const fixtureManifestPath = resolve(
  repositoryRoot,
  'packages/test-fixtures/contracts/v1/manifest.json',
);
const generatedContractsRoot = resolve(repositoryRoot, 'packages/contracts/generated');
const require = createRequire(import.meta.url);

function splitLikeGradle(value) {
  const argumentsList = [];
  let current = '';
  let hasArgument = false;
  let quote;
  for (const character of value) {
    if (quote === undefined && /\s/u.test(character)) {
      if (hasArgument) {
        argumentsList.push(current);
        current = '';
        hasArgument = false;
      }
    } else if (quote === undefined && (character === '"' || character === "'")) {
      quote = character;
      hasArgument = true;
    } else if (character === quote) {
      quote = undefined;
    } else {
      current += character;
      hasArgument = true;
    }
  }
  if (hasArgument) argumentsList.push(current);
  return argumentsList;
}

test('Gradle application arguments preserve whitespace, slashes, and embedded quotes', () => {
  const expected = [
    '',
    'plain',
    'with spaces',
    'double"quote',
    "single'quote",
    `both"'quotes`,
    'C:\\folder with spaces\\fixture.json',
  ];
  const encoded = expected.map(quoteGradleApplicationArgument).join(' ');

  assert.deepEqual(splitLikeGradle(encoded), expected);
});

test('the Kotlin validator pins the patched Jackson 2.21 line consistently', () => {
  const kotlinRoot = resolve(toolRoot, 'kotlin');
  const build = readFileSync(resolve(kotlinRoot, 'build.gradle.kts'), 'utf8');
  const lock = readFileSync(resolve(kotlinRoot, 'gradle.lockfile'), 'utf8');

  assert.match(build, /jackson-module-kotlin:2\.21\.5/u);
  for (const artifact of [
    'jackson-core',
    'jackson-databind',
    'jackson-dataformat-yaml',
    'jackson-module-kotlin',
    'jackson-bom',
  ]) {
    assert.match(lock, new RegExp(`${artifact}:2\\.21\\.5(?:=|\\n)`, 'u'));
  }
});

function snapshotDirectory(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? snapshotDirectory(root, path)
        : [
            [
              path.slice(root.length + 1).replaceAll('\\', '/'),
              createHash('sha256').update(readFileSync(path)).digest('hex'),
            ],
          ];
    })
    .sort(([left], [right]) => left.localeCompare(right, 'en'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runComparator(manifestPath, resultPaths) {
  return spawnSync(
    process.execPath,
    [
      comparatorPath,
      '--fixture-manifest',
      manifestPath,
      ...resultPaths.flatMap((resultPath) => ['--result', resultPath]),
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
}

function withComparisonFixture(callback) {
  const root = mkdtempSync(resolve(tmpdir(), 'databreeze-parity-comparison-'));
  try {
    const manifestPath = resolve(root, 'manifest.json');
    writeJson(manifestPath, {
      fixtureVersion: 1,
      cases: [
        {
          id: 'v1.identifier.valid-uuid',
          schemaId: 'https://schemas.databreeze.dev/contracts/v1/identifier',
          expectedAcceptance: true,
          source: 'payload.json',
        },
      ],
    });
    callback(root, manifestPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('fails when a runtime disagrees with another consumer', () => {
  withComparisonFixture((root, manifestPath) => {
    const results = [
      ['typescript', true],
      ['python', false],
      ['kotlin', true],
    ].map(([runtime, accepted]) => {
      const path = resolve(root, `${runtime}.json`);
      writeJson(path, {
        runtime,
        results: [{ caseId: 'v1.identifier.valid-uuid', accepted }],
      });
      return path;
    });

    const run = runComparator(manifestPath, results);
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Runtime disagreement for v1\.identifier\.valid-uuid/u);
  });
});

test('fails when every runtime disagrees with the fixture manifest', () => {
  withComparisonFixture((root, manifestPath) => {
    const results = ['typescript', 'python', 'kotlin'].map((runtime) => {
      const path = resolve(root, `${runtime}.json`);
      writeJson(path, {
        runtime,
        results: [{ caseId: 'v1.identifier.valid-uuid', accepted: false }],
      });
      return path;
    });

    const run = runComparator(manifestPath, results);
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(
      run.stderr,
      /Manifest disagreement for v1\.identifier\.valid-uuid: expected accepted/u,
    );
  });
});

test('fails when a required consumer result is missing', () => {
  withComparisonFixture((root, manifestPath) => {
    const results = ['typescript', 'python'].map((runtime) => {
      const path = resolve(root, `${runtime}.json`);
      writeJson(path, {
        runtime,
        results: [{ caseId: 'v1.identifier.valid-uuid', accepted: true }],
      });
      return path;
    });

    const run = runComparator(manifestPath, results);
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /Missing runtime result: kotlin/u);
  });
});

test('the supported TypeScript v1 export serves generated types and runtime validation', () => {
  const typecheck = spawnSync(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      '--project',
      resolve(toolRoot, 'typescript/tsconfig.json'),
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);

  const schemaId = 'https://schemas.databreeze.dev/contracts/v1/identifier';
  const acceptedPath = resolve(
    repositoryRoot,
    'packages/test-fixtures/contracts/v1/payloads/identifier/valid-uuid.json',
  );
  const rejectedPath = resolve(
    repositoryRoot,
    'packages/test-fixtures/contracts/v1/payloads/identifier/malformed.json',
  );
  const program = [
    "import { readFileSync } from 'node:fs';",
    "import { parseV1Contract } from '@databreeze/contracts/v1';",
    'const [schemaId, acceptedPath, rejectedPath] = process.argv.slice(1);',
    "const readPayload = (path) => JSON.parse(readFileSync(path, 'utf8'));",
    'const results = [acceptedPath, rejectedPath].map((path) =>',
    '  parseV1Contract(schemaId, readPayload(path)).accepted,',
    ');',
    'process.stdout.write(`${JSON.stringify(results)}\\n`);',
  ].join('\n');
  const runtime = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', program, schemaId, acceptedPath, rejectedPath],
    { cwd: toolRoot, encoding: 'utf8' },
  );

  assert.equal(runtime.status, 0, `${runtime.stdout}\n${runtime.stderr}`);
  assert.deepEqual(JSON.parse(runtime.stdout), [true, false]);
});

test('the real TypeScript Python and Kotlin consumers agree on every shared fixture', () => {
  const generatedBefore = snapshotDirectory(generatedContractsRoot);
  const run = spawnSync(
    process.execPath,
    [orchestratorPath, '--fixture-manifest', fixtureManifestPath],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', UV_NO_CACHE: '1' },
      timeout: 300_000,
    },
  );
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout), {
    caseCount: 34,
    expectedAccepted: 17,
    expectedRejected: 17,
    runtimes: ['typescript', 'python', 'kotlin'],
  });
  assert.deepEqual(
    snapshotDirectory(generatedContractsRoot),
    generatedBefore,
    'consumer parity must not mutate checked-in generated contracts',
  );
});

test('fixture expectations stay independently balanced', () => {
  const manifest = JSON.parse(readFileSync(fixtureManifestPath, 'utf8'));
  assert.equal(manifest.cases.filter((fixtureCase) => fixtureCase.expectedAcceptance).length, 17);
  assert.equal(manifest.cases.filter((fixtureCase) => !fixtureCase.expectedAcceptance).length, 17);
});
