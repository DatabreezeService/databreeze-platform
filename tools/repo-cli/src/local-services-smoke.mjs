import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const composeFile = path.join(repositoryRoot, 'infrastructure', 'local', 'compose.yml');
const exampleEnvFile = path.join(repositoryRoot, 'infrastructure', 'local', '.env.example');
const localEnvFile = path.join(repositoryRoot, 'infrastructure', 'local', '.env');
const services = ['postgres', 'redis', 'minio', 'mailpit', 'otel-collector'];

function usage() {
  console.log(`Usage: pnpm local:smoke [-- --start] [-- --wait-seconds=60]

Validates the local Compose file and polls health checks for the five required
services. The command never removes containers or named volumes.

  --start              run docker compose up -d before polling
  --wait-seconds=N     maximum readiness wait (default: 60)
  --help               show this help`);
}

function runDocker(args, { allowFailure = false } = {}) {
  const result = spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`docker ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function composeArgs() {
  const envFile = existsSync(localEnvFile) ? localEnvFile : exampleEnvFile;
  return ['compose', '--env-file', envFile, '-f', composeFile];
}

function inspectHealth(service) {
  const idResult = runDocker([...composeArgs(), 'ps', '-q', service], { allowFailure: true });
  const id = idResult.stdout.trim();
  if (!id) return { state: 'missing', detail: 'no container' };

  const inspect = runDocker([
    'inspect',
    '--format',
    '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}no-health{{end}}',
    id,
  ]);
  const [state, health] = inspect.stdout.trim().split('|');
  return { state, health, detail: `${state}/${health}` };
}

function parseArguments(argv) {
  const options = { start: false, waitSeconds: 60 };
  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') {
      usage();
      process.exit(0);
    }
    if (argument === '--start') {
      options.start = true;
      continue;
    }
    if (argument.startsWith('--wait-seconds=')) {
      const value = Number(argument.slice('--wait-seconds='.length));
      if (!Number.isInteger(value) || value < 1 || value > 3600) {
        throw new Error('--wait-seconds must be an integer from 1 to 3600');
      }
      options.waitSeconds = value;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  runDocker([...composeArgs(), 'config', '--quiet']);
  if (options.start) runDocker([...composeArgs(), 'up', '-d']);

  const deadline = Date.now() + options.waitSeconds * 1000;
  let last = new Map();
  while (Date.now() <= deadline) {
    last = new Map(services.map((service) => [service, inspectHealth(service)]));
    if (
      [...last.values()].every(({ state, health }) => state === 'running' && health === 'healthy')
    ) {
      console.log(`Local services ready (${services.join(', ')}).`);
      return;
    }
    const summary = services.map((service) => `${service}=${last.get(service).detail}`).join(' ');
    process.stdout.write(`Waiting for local services: ${summary}\r`);
    await delay(1000);
  }

  console.error('\nLocal services did not become ready:');
  for (const service of services)
    console.error(`- ${service}: ${last.get(service)?.detail ?? 'unknown'}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
