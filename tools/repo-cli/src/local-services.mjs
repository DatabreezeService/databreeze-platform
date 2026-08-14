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
const completionServices = ['minio-init'];
const appServices = ['api', 'web'];
const appCompletionServices = ['minio-init', 'api-migrate'];
const logServices = [...services, 'minio-init', ...appServices, 'api-migrate'];
const appLogServices = ['api', 'web', 'api-migrate'];
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
const appHostPorts = [{ service: 'web', key: 'WEB_HTTPS_PORT', fallback: 8443 }];
const allHostPorts = [...hostPorts, ...appHostPorts];

function usage() {
  console.log(`Usage: pnpm local:services <command> [options]

Commands (all preserve named volumes):
  config                validate Compose syntax without requiring a Docker daemon
  preflight             validate Compose, ports, and disk without a Docker daemon
  check                 validate Compose, ports, Docker, and disk headroom
  start                 validate, start services, and wait for healthy checks
  stop                  stop containers without removing containers or volumes
  reset                 recreate containers and networks, preserving volumes
  restart-check         restart running services and verify health/persistence
  persistence-check     restart Redis and verify a disposable sentinel survives
  status                print current container and health state
  logs                  print bounded local container logs (read-only)
  smoke                 legacy readiness command (use --start to start first)
  app-start             build, migrate, and start the same-origin HTTPS API and Web profile
  app-stop              stop API and Web containers while preserving dependencies and volumes
  app-status            print dependency, migration, API, and Web state
  app-logs              print bounded API, migration, and Web logs (read-only)

Options:
  --start               with smoke, start services before polling
  --wait-seconds=N      readiness timeout (default: services 60, app 600; maximum: 3600)
  --tail=N              log lines per service (default: 100, maximum: 1000)
  --service=NAME        limit logs to one known local service
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
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    values.set(match[1], match[2].replace(/^(['"])(.*)\1$/u, '$2'));
  }
  return values;
}

function environment() {
  const fileValues = parseEnvFile(existsSync(localEnvFile) ? localEnvFile : exampleEnvFile);
  if (process.env.COMPOSE_PROJECT_NAME !== undefined) {
    fileValues.set('COMPOSE_PROJECT_NAME', process.env.COMPOSE_PROJECT_NAME);
  }
  for (const definition of allHostPorts) {
    if (process.env[definition.key] !== undefined)
      fileValues.set(definition.key, process.env[definition.key]);
  }
  if (process.env.DATABREEZE_MIN_FREE_GIB !== undefined) {
    fileValues.set('DATABREEZE_MIN_FREE_GIB', process.env.DATABREEZE_MIN_FREE_GIB);
  }
  return fileValues;
}

function projectName(values) {
  const value =
    values.get('COMPOSE_PROJECT_NAME') || process.env.COMPOSE_PROJECT_NAME || 'databreeze-local';
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/u.test(value)) {
    fail(
      'COMPOSE_PROJECT_NAME must start with a lowercase letter or digit and contain only lowercase letters, digits, hyphens, or underscores',
    );
  }
  return value;
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
  const project = projectName(values);
  return ['compose', '--project-name', project, '--env-file', envFile, '-f', composeFile];
}

function appComposeArgs(values = environment()) {
  return [...composeArgs(values), '--profile', 'app'];
}

function runDocker(args, { allowFailure = false, capture = true, timeoutMs = 30_000 } = {}) {
  const result = spawnSync(
    'docker',
    args,
    capture
      ? { cwd: repositoryRoot, encoding: 'utf8', timeout: timeoutMs }
      : { cwd: repositoryRoot, stdio: 'inherit', timeout: timeoutMs },
  );
  if (!allowFailure && (result.error || result.status !== 0)) {
    if (result.error?.code === 'ENOENT') {
      fail(
        'Docker CLI is not installed or not on PATH; start Docker Desktop before using this command',
      );
    }
    if (result.error?.code === 'ETIMEDOUT') {
      fail(`docker ${args.join(' ')} timed out after ${timeoutMs}ms`);
    }
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
    fail(`docker ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

export function composeOperationTimeoutMs(waitSeconds) {
  return (waitSeconds + 30) * 1000;
}

export function classifyCompletionStatus(status, exitCode) {
  const detail = `${status}/${exitCode}`;
  if (status === 'exited') {
    return exitCode === 0 ? { state: 'complete', detail } : { state: 'failed', detail };
  }
  if (status === 'dead' || status === 'removing') return { state: 'failed', detail };
  return { state: 'pending', detail: status };
}

function requireDocker() {
  const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.error?.code === 'ENOENT') {
    fail(
      'Docker CLI is not installed or not on PATH; start Docker Desktop before using this command',
    );
  }
  if (result.error?.code === 'ETIMEDOUT') {
    fail('Docker CLI check timed out after 15000ms; verify Docker Desktop is responsive');
  }
  if (result.status !== 0) {
    fail(
      'Docker daemon is unavailable; start Docker Desktop or another Docker Engine before using this command',
    );
  }
}

function validateCompose(values) {
  runDocker([...appComposeArgs(values), 'config', '--quiet']);
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
    fail(
      `host free space is ${(freeBytes / 1024 ** 3).toFixed(2)} GiB; at least ${minFreeGib} GiB is required`,
    );
  }
}

function containerRunning(service, values) {
  const id = runDocker([...composeArgs(values), 'ps', '-q', service], {
    allowFailure: true,
  }).stdout.trim();
  if (!id) return false;
  const state = runDocker(['inspect', '--format', '{{.State.Running}}', id], {
    allowFailure: true,
  });
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

async function ensurePorts(values, definitions = hostPorts) {
  const collisions = [];
  const configured = new Map();
  for (const definition of definitions) {
    const port = portValue(definition, values);
    const prior = configured.get(port);
    if (prior && prior.key !== definition.key) {
      collisions.push(`${prior.key}=${port} and ${definition.key}=${port}`);
      continue;
    }
    configured.set(port, definition);
    if (containerRunning(definition.service, values)) continue;
    if (!(await portAvailable(port)))
      collisions.push(`${definition.key}=${port} (${definition.service})`);
  }
  if (collisions.length > 0) {
    fail(
      `host ports are already in use: ${collisions.join(', ')}; set alternate ports in infrastructure/local/.env`,
    );
  }
}

function inspectHealth(service, values) {
  const idResult = runDocker([...composeArgs(values), 'ps', '-q', service], { allowFailure: true });
  const id = idResult.stdout.trim();
  if (!id) return { state: 'missing', health: 'unknown', detail: 'no container' };
  const inspect = runDocker(
    [
      'inspect',
      '--format',
      '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}no-health{{end}}',
      id,
    ],
    { allowFailure: true },
  );
  const inspection = inspect.stdout?.trim();
  if (inspect.error || inspect.status !== 0 || !inspection) {
    return { state: 'unknown', health: 'unknown', detail: 'unknown/unknown (inspect unavailable)' };
  }
  const [state, health] = inspection.split('|');
  return { state, health, detail: `${state}/${health}` };
}

function inspectCompletion(service, values) {
  const idResult = runDocker([...composeArgs(values), 'ps', '-aq', service], {
    allowFailure: true,
  });
  const id = idResult.stdout.trim();
  if (!id) return { state: 'pending', detail: 'no container' };
  const inspect = runDocker(['inspect', '--format', '{{.State.Status}}|{{.State.ExitCode}}', id], {
    allowFailure: true,
  });
  const inspection = inspect.stdout?.trim();
  if (inspect.error || inspect.status !== 0 || !inspection) {
    return { state: 'pending', detail: 'inspect unavailable' };
  }
  const [status, rawExitCode] = inspection.split('|');
  return classifyCompletionStatus(status, Number(rawExitCode));
}

async function waitForReady(
  values,
  waitSeconds,
  healthServices = services,
  successfulCompletionServices = completionServices,
) {
  const deadline = Date.now() + waitSeconds * 1000;
  let last = new Map();
  let lastCompletions = new Map();
  while (Date.now() <= deadline) {
    last = new Map(healthServices.map((service) => [service, inspectHealth(service, values)]));
    lastCompletions = new Map(
      successfulCompletionServices.map((service) => [service, inspectCompletion(service, values)]),
    );
    const failedCompletion = [...lastCompletions.entries()].find(
      ([, result]) => result.state === 'failed',
    );
    if (failedCompletion) {
      fail(`${failedCompletion[0]} failed (${failedCompletion[1].detail})`);
    }
    if (
      [...last.values()].every(
        ({ state, health }) => state === 'running' && health === 'healthy',
      ) &&
      [...lastCompletions.values()].every(({ state }) => state === 'complete')
    ) {
      console.log(
        `Local services ready (${[...healthServices, ...successfulCompletionServices].join(
          ', ',
        )}).`,
      );
      return;
    }
    const summary = [
      ...healthServices.map((service) => `${service}=${last.get(service).detail}`),
      ...successfulCompletionServices.map(
        (service) => `${service}=${lastCompletions.get(service).detail}`,
      ),
    ].join(' ');
    process.stdout.write(`Waiting for local services: ${summary}\r`);
    await delay(1000);
  }
  console.error('\nLocal services did not become ready:');
  for (const service of healthServices)
    console.error(`- ${service}: ${last.get(service)?.detail ?? 'unknown'}`);
  for (const service of successfulCompletionServices) {
    console.error(`- ${service}: ${lastCompletions.get(service)?.detail ?? 'unknown'}`);
  }
  fail(`readiness timeout after ${waitSeconds}s`);
}

function parseArguments(argv, values = environment()) {
  let command = 'smoke';
  const argumentsToParse = [...argv];
  if (argumentsToParse[0] && !argumentsToParse[0].startsWith('-'))
    command = argumentsToParse.shift();
  const options = {
    start: false,
    waitSeconds: command.startsWith('app-') ? 600 : 60,
    tail: 100,
    service: undefined,
    minFreeGib: Number(values.get('DATABREEZE_MIN_FREE_GIB') ?? 5),
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
    if (argument.startsWith('--tail=')) {
      options.tail = Number(argument.slice('--tail='.length));
      continue;
    }
    if (argument.startsWith('--service=')) {
      options.service = argument.slice('--service='.length);
      continue;
    }
    if (argument.startsWith('--min-free-gib=')) {
      options.minFreeGib = Number(argument.slice('--min-free-gib='.length));
      continue;
    }
    fail(`unknown argument: ${argument}`);
  }
  if (
    !Number.isInteger(options.waitSeconds) ||
    options.waitSeconds < 1 ||
    options.waitSeconds > 3600
  ) {
    fail('--wait-seconds must be an integer from 1 to 3600');
  }
  if (!Number.isInteger(options.tail) || options.tail < 1 || options.tail > 1000) {
    fail('--tail must be an integer from 1 to 1000');
  }
  if (options.service !== undefined && !logServices.includes(options.service)) {
    fail(`--service must name one of: ${logServices.join(', ')}`);
  }
  if (!Number.isFinite(options.minFreeGib) || options.minFreeGib < 0) {
    fail('--min-free-gib must be a non-negative number');
  }
  if (
    ![
      'config',
      'preflight',
      'check',
      'start',
      'stop',
      'reset',
      'restart-check',
      'persistence-check',
      'status',
      'logs',
      'smoke',
      'app-start',
      'app-stop',
      'app-status',
      'app-logs',
    ].includes(command)
  ) {
    fail(`unknown command: ${command}`);
  }
  return { command, options };
}

export async function main(argv = process.argv.slice(2)) {
  const values = environment();
  const { command, options } = parseArguments(argv, values);
  const operationTimeoutMs = composeOperationTimeoutMs(options.waitSeconds);
  if (command === 'help') {
    usage();
    return;
  }
  if (command === 'config') {
    validateCompose(values);
    console.log('Local Compose configuration is valid.');
    return;
  }
  if (command === 'preflight') {
    validateCompose(values);
    ensureDiskSpace(options.minFreeGib);
    await ensurePorts(values);
    console.log('Local Compose, port, and disk preflight passed without starting services.');
    return;
  }
  requireDocker();
  validateCompose(values);

  if (command === 'status') {
    for (const service of services)
      console.log(`${service}: ${inspectHealth(service, values).detail}`);
    for (const service of completionServices)
      console.log(`${service}: ${inspectCompletion(service, values).detail}`);
    return;
  }
  if (command === 'app-status') {
    for (const service of [...services, ...appServices])
      console.log(`${service}: ${inspectHealth(service, values).detail}`);
    for (const service of appCompletionServices)
      console.log(`${service}: ${inspectCompletion(service, values).detail}`);
    return;
  }
  if (command === 'logs') {
    const selected = options.service ? [options.service] : logServices;
    runDocker(
      [...composeArgs(values), 'logs', '--no-color', `--tail=${options.tail}`, ...selected],
      { capture: false, timeoutMs: 120_000 },
    );
    return;
  }
  if (command === 'app-logs') {
    const selected = options.service ? [options.service] : appLogServices;
    runDocker(
      [...appComposeArgs(values), 'logs', '--no-color', `--tail=${options.tail}`, ...selected],
      { capture: false, timeoutMs: 120_000 },
    );
    return;
  }
  if (command === 'stop') {
    runDocker([...composeArgs(values), 'stop'], { timeoutMs: operationTimeoutMs });
    console.log('Local services stopped; named volumes and containers were preserved.');
    return;
  }
  if (command === 'app-stop') {
    runDocker([...appComposeArgs(values), 'stop', 'web', 'api', 'api-migrate'], {
      timeoutMs: operationTimeoutMs,
    });
    console.log('Local API and Web stopped; dependencies, containers, and volumes were preserved.');
    return;
  }

  if (command === 'app-start') {
    ensureDiskSpace(options.minFreeGib);
    await ensurePorts(values, allHostPorts);
    // The migration service is a disposable one-shot container. Remove only
    // that exact service before recreate so an interrupted start cannot leave
    // its fixed Compose name blocking the next idempotent start. Named
    // database/object volumes are never touched.
    runDocker([...appComposeArgs(values), 'rm', '--stop', '--force', 'api-migrate'], {
      timeoutMs: operationTimeoutMs,
    });
    runDocker([...appComposeArgs(values), 'up', '--detach', '--build'], {
      timeoutMs: operationTimeoutMs,
    });
    await waitForReady(
      values,
      options.waitSeconds,
      [...services, ...appServices],
      appCompletionServices,
    );
    console.log(
      `DataBreeze local app ready at https://localhost:${portValue(appHostPorts[0], values)}. Mailpit: http://localhost:${portValue(hostPorts[5], values)}.`,
    );
    return;
  }

  const shouldStart =
    command === 'start' || command === 'reset' || (command === 'smoke' && options.start);
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
    runDocker([...composeArgs(values), 'down', '--remove-orphans'], {
      timeoutMs: operationTimeoutMs,
    });
    runDocker([...composeArgs(values), 'up', '-d'], { timeoutMs: operationTimeoutMs });
    await waitForReady(values, options.waitSeconds);
    console.log('Local services reset without removing named volumes.');
    return;
  }
  if (command === 'restart-check') {
    runDocker([...composeArgs(values), 'restart'], { timeoutMs: operationTimeoutMs });
    await waitForReady(values, options.waitSeconds);
    console.log(
      'Local service restart and health checks passed. Use persistence-check for a Redis sentinel probe.',
    );
    return;
  }
  if (command === 'persistence-check') {
    const key = `databreeze:local:persistence-check:${process.pid}`;
    const value = `${Date.now()}`;
    let recovered = false;
    try {
      runDocker([
        ...composeArgs(values),
        'exec',
        '-T',
        'redis',
        'redis-cli',
        'SET',
        key,
        value,
        'EX',
        '300',
      ]);
      runDocker([...composeArgs(values), 'restart', 'redis'], { timeoutMs: operationTimeoutMs });
      await waitForReady(values, options.waitSeconds);
      const result = runDocker([
        ...composeArgs(values),
        'exec',
        '-T',
        'redis',
        'redis-cli',
        'GET',
        key,
      ]);
      if (result.stdout.trim() !== value)
        fail('Redis persistence sentinel was not recovered after restart');
      recovered = true;
    } finally {
      runDocker([...composeArgs(values), 'exec', '-T', 'redis', 'redis-cli', 'DEL', key], {
        allowFailure: true,
      });
    }
    if (!recovered) return;
    console.log('Local Redis persistence check passed; sentinel was removed.');
    return;
  }
  if (shouldStart)
    runDocker([...composeArgs(values), 'up', '-d'], { timeoutMs: operationTimeoutMs });
  await waitForReady(values, options.waitSeconds);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
