import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { clearTimeout, setTimeout } from 'node:timers';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const dockerfilePath = path.join(
  repositoryRoot,
  'infrastructure',
  'containers',
  'api',
  'Dockerfile',
);

function terminateProcessTree(child) {
  if (child.pid === undefined) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

function runPnpm(argumentsList, timeout = 180_000) {
  const isWindows = process.platform === 'win32';
  const bundledCorepack = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'corepack',
    'dist',
    'corepack.js',
  );
  const useBundledCorepack = isWindows && existsSync(bundledCorepack);
  const executable = useBundledCorepack
    ? process.execPath
    : isWindows
      ? 'corepack.cmd'
      : 'corepack';
  const commandArguments = [
    ...(useBundledCorepack ? [bundledCorepack] : []),
    'pnpm',
    ...argumentsList,
  ];

  return new Promise((resolve, reject) => {
    const command = [executable, ...commandArguments].join(' ');
    const child = spawn(executable, commandArguments, {
      cwd: repositoryRoot,
      detached: !isWindows,
      env: {
        ...process.env,
        CI: '1',
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWindows && !useBundledCorepack,
      windowsHide: isWindows,
    });
    let stderr = '';
    let stdout = '';
    let timedOut = false;
    let settled = false;
    const appendOutput = (current, chunk) => {
      const next = current + chunk;
      return next.length > 32 * 1024 * 1024 ? next.slice(-32 * 1024 * 1024) : next;
    };
    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout = appendOutput(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeout);

    child.once('error', (error) => {
      finish(new Error(`${command} failed\n${error.message}\n${stdout}\n${stderr}`));
    });
    child.once('close', (status, signal) => {
      if (timedOut) {
        finish(new Error(`${command} timed out after ${timeout}ms\n${stdout}\n${stderr}`));
        return;
      }
      if (status !== 0) {
        finish(
          new Error(`${command} failed with status ${status ?? signal}\n${stdout}\n${stderr}`),
        );
        return;
      }
      finish();
    });
  });
}

function deployCommand(destination) {
  const deployLine = readFileSync(dockerfilePath, 'utf8')
    .replaceAll('\r\n', '\n')
    .split('\n')
    .find((line) => line.startsWith('RUN pnpm --filter @databreeze/api --prod deploy '));

  assert.ok(deployLine, 'Dockerfile must contain the production API deploy command');

  const argumentsList = deployLine.slice('RUN '.length).trim().split(/\s+/u);
  assert.equal(argumentsList[0], 'pnpm');
  assert.equal(argumentsList.at(-1), '/workspace/api-runtime');
  assert.ok(argumentsList.includes('--legacy'), 'production deploy must force pnpm legacy mode');
  argumentsList[argumentsList.length - 1] = destination;
  return argumentsList.slice(1);
}

test('[Task 19 / IAM-019 / DDA-036] production deploy preserves the built API runtime closure', async () => {
  const apiEntryPath = path.join(repositoryRoot, 'services', 'api', 'dist', 'main.js');
  await runPnpm(['--filter', '@databreeze/api', 'prisma:generate']);
  await runPnpm(['--filter', '@databreeze/api...', 'build']);

  const generatedClientDirectory = path.join(
    repositoryRoot,
    'services',
    'api',
    'build',
    'prisma-client',
  );
  assert.equal(
    existsSync(apiEntryPath),
    true,
    'API production build output must exist before deploy',
  );
  assert.match(readFileSync(apiEntryPath, 'utf8'), /createDatabaseCompositionForRuntime/u);
  assert.equal(existsSync(path.join(generatedClientDirectory, 'client.ts')), true);
  assert.equal(existsSync(path.join(generatedClientDirectory, 'client.js')), true);
  assert.equal(existsSync(path.join(generatedClientDirectory, 'internal', 'class.ts')), true);

  const destination = mkdtempSync(path.join(os.tmpdir(), 'databreeze-api-package-'));
  try {
    const deployArguments = deployCommand(destination);
    try {
      // A cold legacy deploy copies the complete production closure on Windows.
      // It regularly exceeds three minutes even when every package is reused.
      await runPnpm(deployArguments, 600_000);
    } finally {
      // `pnpm deploy --prod` may prune the workspace's shared dev links on Windows.
      // Restore the frozen workspace before other repository tests continue.
      await runPnpm(['install', '--frozen-lockfile'], 180_000);
    }

    for (const requiredPath of [
      'package.json',
      'dist/main.js',
      'build/prisma-client/client.ts',
      'build/prisma-client/internal/class.ts',
      'node_modules/@nestjs/core/package.json',
      'node_modules/@prisma/adapter-pg/package.json',
      'node_modules/@prisma/client/package.json',
      'node_modules/fastify/package.json',
      'node_modules/@databreeze/contracts/manifest.json',
      'node_modules/@databreeze/domain/dist/v1.js',
      'node_modules/@databreeze/telemetry/dist/v1.js',
    ]) {
      assert.equal(
        existsSync(path.join(destination, ...requiredPath.split('/'))),
        true,
        requiredPath,
      );
    }

    assert.equal(existsSync(path.join(destination, 'node_modules', 'prisma')), false);
    assert.equal(existsSync(path.join(destination, 'node_modules', 'typescript')), false);

    const runtimeClosureProbe = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "await import('@prisma/adapter-pg'); await import('@prisma/client/runtime/client');",
      ],
      {
        cwd: destination,
        encoding: 'utf8',
        timeout: 30_000,
        windowsHide: process.platform === 'win32',
      },
    );
    assert.equal(
      runtimeClosureProbe.status,
      0,
      `Prisma runtime closure must load from deploy output\n${runtimeClosureProbe.stdout}\n${runtimeClosureProbe.stderr}`,
    );
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});
