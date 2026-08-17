import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseBackedDevelopmentEnvironment } from './dev-stack.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const pnpmExecutable = 'corepack';
const apiDirectory = path.join(repositoryRoot, 'services', 'api');

function runPnpm(args) {
  const result = spawnSync(pnpmExecutable, ['pnpm', ...args], {
    cwd: repositoryRoot,
    env: { ...databaseBackedDevelopmentEnvironment(), ...process.env },
    shell: process.platform === 'win32',
    stdio: 'inherit',
    windowsHide: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function start(command, args) {
  return spawn(command, args, {
    cwd: repositoryRoot,
    env: {
      ...databaseBackedDevelopmentEnvironment(),
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? 'development',
      HOST: '127.0.0.1',
      PORT: '3000',
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
    windowsHide: false,
  });
}

function stop(child) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
}

// Keep this command self-starting: the user may run only dev:api after Docker
// Desktop is ready. The lifecycle command is idempotent when dependencies are
// already healthy and never starts the built API/Web containers.
runPnpm(['local:services', 'start']);
runPnpm(['--filter', '@databreeze/api', 'prisma:generate']);
runPnpm([
  '--filter',
  '@databreeze/api',
  'exec',
  'prisma',
  'migrate',
  'deploy',
  '--config',
  'prisma.config.ts',
]);
runPnpm(['--filter', '@databreeze/domain', 'build']);
runPnpm(['--filter', '@databreeze/telemetry', 'build']);
runPnpm(['--filter', '@databreeze/api', 'build']);

const compiler = start(pnpmExecutable, [
  'pnpm',
  '--filter',
  '@databreeze/api',
  'exec',
  'tsc',
  '--project',
  'tsconfig.build.json',
  '--watch',
  '--preserveWatchOutput',
]);
const server = start(process.execPath, ['--watch', path.join(apiDirectory, 'dist', 'main.js')]);

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  stop(compiler);
  stop(server);
  process.exitCode = code;
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));
compiler.once('exit', (code) => {
  if (!stopping && code !== 0) shutdown(code ?? 1);
});
server.once('exit', (code) => {
  if (!stopping && code !== 0) shutdown(code ?? 1);
});
