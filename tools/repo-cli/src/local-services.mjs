import { existsSync, readFileSync, statfsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const localRoot = path.join(repositoryRoot, 'infrastructure', 'local');
const composeFile = path.join(localRoot, 'compose.yml');
const exampleEnvFile = path.join(localRoot, '.env.example');
const localEnvFile = path.join(localRoot, '.env');
const services = [
  'postgres',
  'redis',
  'minio',
  'mailpit',
  'otel-collector',
  'otel-collector-health',
];
const hostPorts = [
  { service: 'postgres', key: 'POSTGRES_PORT', fallback: 5432 },
  { service: 'redis', key: 'REDIS_PORT', fallback: 6379 },
  { service: 'minio', key: 'MINIO_API_PORT', fallback: 9000 },
  { service: 'minio', key: 'MINIO_CONSOLE_PORT', fallback: 9001 },
  { service: 'mailpit', key: 'MAILPIT_SMTP_PORT', fallback: 1025 },
  { service: 'mailpit', key: 'MAILPIT_UI_PORT', fallback: 8025 },
  { service: 'otel-collector', key: 'OTEL_GRPC_PORT', fallback: 4317 },
  { service: 'otel-collector', key: 'OTEL_HTTP_PORT', fallback: 4318 },
  { service: 'otel-collector', key: 'OTEL_HEALTH_PORT', fallback: 13133 },
];

function usage() {
  console.log(`Usage: pnpm local:services <command> [options]

Commands (all preserve named volumes):
  check                 validate Compose, ports, Docker, and disk headroom
  start                 validate, start services, and wait for healthy checks
  stop                  stop containers without removing containers or volumes
  reset                 recreate containers and networks, preserving volumes
  restart-check         restart running services and verify health/persistence
  status                print current container and health state
  smoke                 legacy readiness command (use --start to start first)

Options:
  --start               with smoke, start services before polling
  --wait-seconds=N      readiness timeout (default: 60, maximum: 3600)
  --min-free-gib=N      minimum host free space (default: 5)
  --help                show this help

Smoke never removes containers or named volumes. Lifecycle reset recreates
containers but never passes --volumes to Compose. Use Docker directly only when
you explicitly intend to discard local development data.`);
}

function fail(message) {
  throw new Error(`Local infrastructure: ${message}`);
}

function parseEnvFile(file) {
  if (!existsSync(file)) return new Map();
  const values = new Map();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u.exec(line);
    if (!match || match[1].startsWith('#')) continue;
    values.set(match[1], match[2].replace(/^(['"])(.*)\1$/u, '$2'));
  }
  return values;
}

function environment() {
  const fileValues = parseEnvFile(existsSync(localEnvFile) ? localEnvFile : exampleEnvFile);
  for (const definition of hostPorts) {
    if (process.env[definition.key] !== undefined) fileValues.set(definition.key, process.env[definition.key]);
  }
  return fileValues;
}

function portValue(definition, values) {
  const value = Number(values.get(definition.key) ?? definition.fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    fail(`${definition.key} must be an integer between 1024 and 65535`);
  }
  return value;
}

function composeArgs(values = environment()) {
  const envFile = existsSync(localEnvFile) ? localEnvFile : exampleEnvFile;
  const project = values.get('COMPOSE_PROJECT_NAME') || process.env.COMPOSE_PROJECT_NAME || 'databreeze-local';
  return ['compose', '--project-name', project, '--env-file', envFile, '-f', composeFile];
}

function runDocker(args, { allowFailure = false } = {}) {
  const result = spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (!allowFailure && (result.error || result.status !== 0)) {
    if (result.error?.code === 'ENOENT') {
      fail('Docker CLI is not installed or not on PATH; start Docker Desktop before using this command');
    }
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
    fail(`docker ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function requireDocker() {
  const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.error?.code === 'ENOENT') {
    fail('Docker CLI is not installed or not on PATH; start Docker Desktop before using this command');
  }
  if (result.status !== 0) {
    fail('Docker daemon is unavailable; start Docker Desktop or another Docker Engine before using this command');
  }
}

function validateCompose(values) {
  runDocker([...composeArgs(values), 'config', '--quiet']);
}

function ensureDiskSpace(minFreeGib) {
  if (typeof statfsSync !== 'function') {
    console.warn('Local infrastructure: disk free-space check is unavailable on this Node runtime');
    return;
  }
  const stats = statfsSync(repositoryRoot);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  const requiredBytes = minFreeGib * 1024 ** 3;
  if (freeBytes < requiredBytes) {
    fail(`host free space is ${(freeBytes / 1024 ** 3).toFixed(2)} GiB; at least ${minFreeGib} GiB is required`);
  }
}

function containerRunning(service, values) {
  const id = runDocker([...composeArgs(values), 'ps', '-q', service], { allowFailure: true }).stdout.trim();
  if (!id) return false;
  const state = runDocker(['inspect', '--format', '{{.State.Running}}', id], { allowFailure: true });
  return state.stdout.trim() === 'true';
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    const finish = (available) => {
      server.removeAllListeners();
      if (server.listening) server.close(() => resolve(available));
      else resolve(available);
    };
    server.once('error', () => finish(false));
    server.listen({ host: '127.0.0.1', port }, () => finish(true));
  });
}

async function ensurePorts(values) {
  const collisions = [];
  for (const definition of hostPorts) {
    if (containerRunning(definition.service, values)) continue;
    const port = portValue(definition, values);
    if (!(await portAvailable(port))) collisions.push(`${definition.key}=${port} (${definition.service})`);
  }
  if (collisions.length > 0) {
    fail(`host ports are already in use: ${collisions.join(', ')}; set alternate ports in infrastructure/local/.env`);
  }
}

function inspectHealth(service, values) {
  const idResult = runDocker([...composeArgs(values), 'ps', '-q', service], { allowFailure: true });
  const id = idResult.stdout.trim();
  if (!id) return { state: 'missing', health: 'unknown', detail: 'no container' };
  const inspect = runDocker([
    'inspect',
    '--format',
    '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}no-health{{end}}',
    id,
  ]);
  const [state, health] = inspect.stdout.trim().split('|');
  return { state, health, detail: `${state}/${health}` };
}

async function waitForReady(values, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  let last = new Map();
  while (Date.now() <= deadline) {
    last = new Map(services.map((service) => [service, inspectHealth(service, values)]));
    if ([...last.values()].every(({ state, health }) => state === 'running' && health === 'healthy')) {
      console.log(`Local services ready (${services.join(', ')}).`);
      return;
    }
    const summary = services.map((service) => `${service}=${last.get(service).detail}`).join(' ');
    process.stdout.write(`Waiting for local services: ${summary}\r`);
    await delay(1000);
  }
  console.error('\nLocal services did not become ready:');
  for (const service of services) console.error(`- ${service}: ${last.get(service)?.detail ?? 'unknown'}`);
  fail(`readiness timeout after ${waitSeconds}s`);
}

function parseArguments(argv) {
  let command = 'smoke';
  const argumentsToParse = [...argv];
  if (argumentsToParse[0] && !argumentsToParse[0].startsWith('-')) command = argumentsToParse.shift();
  const options = {
    start: false,
    waitSeconds: 60,
    minFreeGib: Number(process.env.DATABREEZE_MIN_FREE_GIB || 5),
  };
  for (const argument of argumentsToParse) {
    if (argument === '--help' || argument === '-h') return { command: 'help', options };
    if (argument === '--start') {
      options.start = true;
      continue;
    }
    if (argument.startsWith('--wait-seconds=')) {
      options.waitSeconds = Number(argument.slice('--wait-seconds='.length));
      continue;
    }
    if (argument.startsWith('--min-free-gib=')) {
      options.minFreeGib = Number(argument.slice('--min-free-gib='.length));
      continue;
    }
    fail(`unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.waitSeconds) || options.waitSeconds < 1 || options.waitSeconds > 3600) {
    fail('--wait-seconds must be an integer from 1 to 3600');
  }
  if (!Number.isFinite(options.minFreeGib) || options.minFreeGib < 0) {
    fail('--min-free-gib must be a non-negative number');
  }
  if (!['check', 'start', 'stop', 'reset', 'restart-check', 'status', 'smoke'].includes(command)) {
    fail(`unknown command: ${command}`);
  }
  return { command, options };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  if (command === 'help') {
    usage();
    return;
  }
  const values = environment();
  requireDocker();
  validateCompose(values);

  if (command === 'status') {
    for (const service of services) console.log(`${service}: ${inspectHealth(service, values).detail}`);
    return;
  }
  if (command === 'stop') {
    runDocker([...composeArgs(values), 'stop']);
    console.log('Local services stopped; named volumes and containers were preserved.');
    return;
  }

  const shouldStart = command === 'start' || command === 'reset' || (command === 'smoke' && options.start);
  if (shouldStart) {
    ensureDiskSpace(options.minFreeGib);
    await ensurePorts(values);
  }
  if (command === 'check') {
    ensureDiskSpace(options.minFreeGib);
    await ensurePorts(values);
    console.log('Local Compose, Docker, port, and disk preflight passed.');
    return;
  }
  if (command === 'reset') {
    runDocker([...composeArgs(values), 'down', '--remove-orphans']);
    runDocker([...composeArgs(values), 'up', '-d']);
    await waitForReady(values, options.waitSeconds);
    console.log('Local services reset without removing named volumes.');
    return;
  }
  if (command === 'restart-check') {
    runDocker([...composeArgs(values), 'restart']);
    await waitForReady(values, options.waitSeconds);
    console.log('Local service restart and health persistence check passed.');
    return;
  }
  if (shouldStart) runDocker([...composeArgs(values), 'up', '-d']);
  await waitForReady(values, options.waitSeconds);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
