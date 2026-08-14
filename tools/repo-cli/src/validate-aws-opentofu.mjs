import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const infrastructureRoot = path.join(repositoryRoot, 'infrastructure', 'aws');
const containerDataDirectory = '/tmp/databreeze-tofu';
const containerWorkspaceDirectory = '/tmp/databreeze-tofu-workspace';
const validationTargets = [
  { directory: '/workspace/modules/compute', dataName: 'compute', lockfile: false },
  { directory: '/workspace/modules/security', dataName: 'security', lockfile: false },
  { directory: '/workspace/environments/alpha', dataName: 'alpha', lockfile: true },
  { directory: '/workspace/environments/staging', dataName: 'staging', lockfile: true },
  { directory: '/workspace/environments/production', dataName: 'production', lockfile: true },
];

function usage() {
  console.log(`Usage: pnpm infra:validate

Runs format, backend-disabled initialization, validation, and mocked plan
tests for compute, security, alpha, staging, and production through the
official pinned OpenTofu container. The command does not apply infrastructure
and removes its isolated provider cache on completion.`);
}

function fail(message) {
  throw new Error(`AWS OpenTofu validation: ${message}`);
}

function runDocker(args, timeout = 600_000) {
  const result = spawnSync('docker', args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    timeout,
  });
  if (result.error?.code === 'ENOENT') fail('Docker CLI is not installed or not on PATH');
  if (result.error?.code === 'ETIMEDOUT') fail(`docker ${args[0]} timed out after ${timeout}ms`);
  if (result.error || result.status !== 0) {
    fail(`docker ${args[0]} failed with status ${result.status ?? 'unknown'}`);
  }
}

function removeValidationDirectory(directory) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(directory);
  if (
    !resolved.startsWith(`${temporaryRoot}${path.sep}`) ||
    !path.basename(resolved).startsWith('databreeze-tofu-')
  ) {
    fail('refusing to remove a provider cache outside the bounded temporary directory');
  }
  rmSync(resolved, { recursive: true, force: true });
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    return;
  }
  if (argv.length > 0) fail(`unknown argument: ${argv[0]}`);

  const version = readFileSync(path.join(infrastructureRoot, '.opentofu-version'), 'utf8').trim();
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version))
    fail('version pin is not an exact semantic version');
  const image = `ghcr.io/opentofu/opentofu:${version}`;
  const sourceMount = `type=bind,source=${infrastructureRoot},target=/workspace,readonly`;
  const validationDirectory = mkdtempSync(path.join(os.tmpdir(), 'databreeze-tofu-'));
  const dataMount = `type=bind,source=${validationDirectory},target=${containerDataDirectory}`;

  try {
    runDocker([
      'run',
      '--rm',
      '--mount',
      sourceMount,
      image,
      'fmt',
      '-check',
      '-recursive',
      '/workspace',
    ]);
    for (const target of validationTargets) {
      const targetPath = target.directory.replace(/^\/workspace/u, '');
      const base = [
        'run',
        '--rm',
        '--entrypoint',
        'sh',
        '--mount',
        sourceMount,
        '--mount',
        dataMount,
        '--env',
        `TF_DATA_DIR=${containerDataDirectory}/${target.dataName}`,
        image,
      ];
      runDocker([
        ...base,
        '-c',
        [
          'set -eu',
          `rm -rf ${containerWorkspaceDirectory}`,
          `mkdir -p ${containerWorkspaceDirectory}`,
          `cp -a /workspace/. ${containerWorkspaceDirectory}/`,
          `cd ${containerWorkspaceDirectory}${targetPath}`,
          `tofu init -backend=false -input=false ${target.lockfile ? '-lockfile=readonly ' : ''}-no-color`,
          'tofu validate -no-color',
          'tofu test -no-color',
        ].join('; '),
      ]);
    }
  } finally {
    removeValidationDirectory(validationDirectory);
  }

  console.log(
    `AWS OpenTofu ${version} container validation passed format, validation, and mocked plan tests without applying infrastructure.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
