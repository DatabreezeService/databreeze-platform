import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { compareContractResults } from './compare-contract-results.mjs';
import { quoteGradleApplicationArgument } from './gradle-application-arguments.mjs';

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(toolRoot, '../..');
const require = createRequire(import.meta.url);

function fail(message) {
  throw new Error(message);
}

function readArguments(argumentsList) {
  const options = {
    fixtureManifest: resolve(repositoryRoot, 'packages/test-fixtures/contracts/v1/manifest.json'),
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument !== '--fixture-manifest') fail(`Unknown argument: ${argument}`);
    const value = argumentsList[index + 1];
    if (!value) fail('--fixture-manifest requires a path');
    options.fixtureManifest = resolve(value);
    index += 1;
  }
  return options;
}

function runCommand(command, argumentsList, options = {}) {
  const run = spawnSync(command, argumentsList, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 300_000,
    windowsHide: true,
  });
  if (run.error) fail(`${command} could not start: ${run.error.message}`);
  if (run.status !== 0) {
    const output = [run.stdout, run.stderr].filter(Boolean).join('\n').trim();
    fail(`${command} exited with status ${run.status}${output ? `:\n${output}` : ''}`);
  }
  return run;
}

function runTypeScript(fixtureManifest, output) {
  const typeScriptCompiler = require.resolve('typescript/bin/tsc');
  runCommand(process.execPath, [
    typeScriptCompiler,
    '--project',
    resolve(toolRoot, 'typescript/tsconfig.json'),
  ]);
  runCommand(process.execPath, [
    resolve(toolRoot, 'typescript/run-fixtures.mjs'),
    '--fixture-manifest',
    fixtureManifest,
    '--output',
    output,
  ]);
}

function runPython(fixtureManifest, output, temporaryRoot) {
  const uvCommand = process.env.DATABREEZE_UV ?? 'uv';
  const version = runCommand(uvCommand, ['--version']).stdout.trim();
  if (!/^uv 0\.11\.32(?:\s|$)/u.test(version)) {
    fail(`Expected uv 0.11.32, received ${version}`);
  }
  const pythonRoot = resolve(toolRoot, 'python');
  runCommand(
    uvCommand,
    [
      'run',
      '--frozen',
      '--project',
      pythonRoot,
      'python',
      resolve(pythonRoot, 'run_fixtures.py'),
      '--fixture-manifest',
      fixtureManifest,
      '--output',
      output,
    ],
    {
      env: {
        ...process.env,
        PYTHONPATH: [
          resolve(repositoryRoot, 'packages/contracts/generated/python'),
          process.env.PYTHONPATH,
        ]
          .filter(Boolean)
          .join(delimiter),
        PYTHONDONTWRITEBYTECODE: '1',
        UV_PROJECT_ENVIRONMENT: resolve(temporaryRoot, 'python-environment'),
      },
    },
  );
}

function runKotlin(fixtureManifest, output) {
  const javaCommand = process.env.DATABREEZE_JAVA ?? 'java';
  const kotlinRoot = resolve(toolRoot, 'kotlin');
  const wrapperJar = resolve(kotlinRoot, 'gradle/wrapper/gradle-wrapper.jar');
  const applicationArguments = [
    '--fixture-manifest',
    quoteGradleApplicationArgument(fixtureManifest),
    '--output',
    quoteGradleApplicationArgument(output),
  ].join(' ');
  runCommand(
    javaCommand,
    [
      '-classpath',
      wrapperJar,
      'org.gradle.wrapper.GradleWrapperMain',
      '--no-daemon',
      '--quiet',
      'run',
      `--args=${applicationArguments}`,
    ],
    { cwd: kotlinRoot },
  );
}

try {
  const options = readArguments(process.argv.slice(2));
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'databreeze-contract-parity-'));
  try {
    const results = {
      typescript: resolve(temporaryRoot, 'typescript.json'),
      python: resolve(temporaryRoot, 'python.json'),
      kotlin: resolve(temporaryRoot, 'kotlin.json'),
    };
    runTypeScript(options.fixtureManifest, results.typescript);
    runPython(options.fixtureManifest, results.python, temporaryRoot);
    runKotlin(options.fixtureManifest, results.kotlin);
    const summary = compareContractResults(options.fixtureManifest, [
      results.typescript,
      results.python,
      results.kotlin,
    ]);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
