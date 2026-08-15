import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PNPM_EXECUTABLE = 'corepack';
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

export const DEV_COMMANDS = Object.freeze({
  infra: ['local:services', 'start'],
  api: ['--filter', '@databreeze/api', 'dev'],
  web: ['--filter', '@databreeze/web', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'],
});

export const DEV_WORKING_DIRECTORIES = Object.freeze({
  web: 'apps/web',
});

export const DEV_WEB_PREREQUISITE = Object.freeze(['--filter', '@databreeze/domain', 'build']);

export function localDevelopmentEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: '3000',
    VITE_DATABREEZE_API_PROXY_TARGET: 'http://127.0.0.1:3000',
    ...overrides,
  };
}

export function renderDevelopmentInstructions() {
  return `Local DataBreeze development

Terminal A — Docker infrastructure only:
  corepack pnpm dev:infra
  This starts PostgreSQL, Redis, MinIO, Mailpit, and OpenTelemetry with localhost-only ports.

Terminal B — watched API process:
  corepack pnpm dev:api
  API health: http://127.0.0.1:3000/health/ready

Terminal C — Vite HMR frontend:
  corepack pnpm dev:web
  Open http://127.0.0.1:5173/vi-VN/workspace
  Edit apps/web/src/* and Vite HMR updates the browser without a rebuild.

The Vite server proxies /v1, /v3, and /health to the loopback API. The current API
development composition is database-free by design; Docker services are available for
local adapters and integration checks. Do not use the pilot/production https://localhost:8443
URL for source editing: it serves a built bundle and cannot hot reload.`;
}

function spawnPnpm(args, { env = process.env, cwd = REPOSITORY_ROOT } = {}) {
  return spawn(PNPM_EXECUTABLE, ['pnpm', ...args], {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: false,
  });
}

async function runProcess(args, options = {}) {
  const child = spawnPnpm(args, options);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal === null ? 1 : 143)));
  });
  process.exitCode = exitCode;
  return exitCode;
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'help';
  if (command === 'help' || command === 'stack') {
    console.log(renderDevelopmentInstructions());
    return 0;
  }
  if (command === 'infra') return runProcess(DEV_COMMANDS.infra);
  if (command === 'api') {
    return runProcess(DEV_COMMANDS.api, {
      env: { ...process.env, ...localDevelopmentEnvironment() },
    });
  }
  if (command === 'web') {
    const prerequisiteCode = await runProcess(DEV_WEB_PREREQUISITE, {
      env: { ...process.env, ...localDevelopmentEnvironment() },
    });
    if (prerequisiteCode !== 0) return prerequisiteCode;
    return runProcess(DEV_COMMANDS.web, {
      cwd: path.resolve(REPOSITORY_ROOT, DEV_WORKING_DIRECTORIES.web),
      env: { ...process.env, ...localDevelopmentEnvironment() },
    });
  }
  throw new Error(`Unknown local development command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
