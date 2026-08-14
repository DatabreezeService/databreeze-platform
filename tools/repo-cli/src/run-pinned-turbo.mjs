import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const packageManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const expectedPnpmVersion = packageManifest.packageManager?.replace(/^pnpm@/u, '');

if (!/^\d+\.\d+\.\d+$/u.test(expectedPnpmVersion ?? '')) {
  console.error('Pinned Turbo launcher requires one exact pnpm packageManager version.');
  process.exit(1);
}

function findCorepack() {
  const candidates = [];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    candidates.push(
      path.join(directory, process.platform === 'win32' ? 'corepack.cmd' : 'corepack'),
    );
  }

  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error('Repository-pinned package manager unavailable: Corepack was not found.');
  }
  return executable;
}

function writePinnedPnpmShim(directory, corepack) {
  const shim = path.join(directory, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
  if (process.platform === 'win32') {
    writeFileSync(shim, `@echo off\r\n"${corepack}" pnpm %*\r\n`, 'utf8');
  } else {
    writeFileSync(shim, `#!/bin/sh\nexec "${corepack}" pnpm "$@"\n`, {
      encoding: 'utf8',
      mode: 0o755,
    });
  }
  return shim;
}

function verifyPinnedPnpm(environment) {
  const verification =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/q', '/c', 'pnpm.cmd --version'], {
          cwd: repositoryRoot,
          env: environment,
          encoding: 'utf8',
          windowsHide: true,
        })
      : spawnSync('pnpm', ['--version'], {
          cwd: repositoryRoot,
          env: environment,
          encoding: 'utf8',
        });

  if (verification.status !== 0) {
    throw new Error(
      `Repository-pinned pnpm verification failed: ${verification.stderr?.trim() || 'unknown error'}`,
    );
  }
  const actualVersion = verification.stdout.trim();
  if (actualVersion !== expectedPnpmVersion) {
    throw new Error(
      `Repository-pinned pnpm mismatch: expected ${expectedPnpmVersion}, received ${actualVersion}`,
    );
  }
  return actualVersion;
}

const shimDirectory = mkdtempSync(path.join(os.tmpdir(), 'databreeze-pinned-pnpm-'));
try {
  writePinnedPnpmShim(shimDirectory, findCorepack());
  const environment = {
    ...process.env,
    PATH: `${shimDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
  };
  const actualVersion = verifyPinnedPnpm(environment);

  if (process.argv[2] === '--verify-only') {
    console.log(actualVersion);
    process.exitCode = 0;
  } else {
    const turboScript = path.join(repositoryRoot, 'node_modules', 'turbo', 'bin', 'turbo');
    if (!existsSync(turboScript)) {
      throw new Error('Turbo is unavailable. Run the frozen workspace bootstrap first.');
    }
    const result = spawnSync(process.execPath, [turboScript, ...process.argv.slice(2)], {
      cwd: repositoryRoot,
      env: environment,
      stdio: 'inherit',
      windowsHide: process.platform === 'win32',
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Pinned Turbo launcher failed.');
  process.exitCode = 1;
} finally {
  rmSync(shimDirectory, { recursive: true, force: true });
}
