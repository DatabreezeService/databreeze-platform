import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { isRequiredUvVersion, REQUIRED_UV_VERSION } from './uv-version.mjs';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uv = process.env.DATABREEZE_UV?.trim() || 'uv';
const operation = process.argv[2];
const safeEnvironment = {
  ...process.env,
  NO_COLOR: '1',
  PYTHONDONTWRITEBYTECODE: '1',
  SOURCE_DATE_EPOCH: '946684800',
  UV_NO_PROGRESS: '1',
  UV_PYTHON_DOWNLOADS: 'never',
};

function setupFailure() {
  process.stderr.write(
    `DataBreeze engine requires uv ${REQUIRED_UV_VERSION}; install it or set DATABREEZE_UV.\n`,
  );
  process.exitCode = 1;
}

function runUv(argumentsList) {
  const result = spawnSync(uv, argumentsList, {
    cwd: projectRoot,
    env: safeEnvironment,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    setupFailure();
    return false;
  }
  process.exitCode = result.status ?? 1;
  return result.status === 0;
}

const version = spawnSync(uv, ['--version'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: safeEnvironment,
  windowsHide: true,
});
if (version.error || version.status !== 0) {
  setupFailure();
} else if (!isRequiredUvVersion(version.stdout)) {
  process.stderr.write(`DataBreeze engine requires exactly uv ${REQUIRED_UV_VERSION}.\n`);
  process.exitCode = 1;
} else {
  const run = ['run', '--locked', '--offline', '--no-sync'];
  const commands = {
    format: [...run, 'ruff', 'format', '--check', '.'],
    lint: [...run, 'ruff', 'check', '.'],
    'python-version': [...run, 'python', '--version'],
    test: [...run, 'pytest'],
    typecheck: [...run, 'mypy'],
  };
  if (operation === 'build') {
    if (
      runUv(['lock', '--check', '--offline']) &&
      runUv(['build', '--offline', '--no-build-isolation'])
    ) {
      runUv([...run, 'python', 'scripts/verify_build.py']);
    }
  } else if (Object.hasOwn(commands, operation)) {
    runUv(commands[operation]);
  } else {
    process.stderr.write('Unknown engine operation.\n');
    process.exitCode = 2;
  }
}
