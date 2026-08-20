import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

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

const LOCAL_ENV_FILE = path.join(REPOSITORY_ROOT, 'infrastructure', 'local', '.env');
const LOCAL_ENV_EXAMPLE_FILE = path.join(
  REPOSITORY_ROOT,
  'infrastructure',
  'local',
  '.env.example',
);

function parseEnvironmentFile(filename) {
  const values = {};
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/u)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/u, '$2');
  }
  return values;
}

/**
 * Keep the checked-in defaults as a compatibility floor for ignored local
 * env files. New required keys are added to `.env.example` over time, while
 * an existing developer's `.env` can legitimately predate those additions.
 * Local values still win, including deliberate empty values.
 */
export function readLocalEnvironmentFile() {
  const defaults = parseEnvironmentFile(LOCAL_ENV_EXAMPLE_FILE);
  if (!existsSync(LOCAL_ENV_FILE)) return defaults;
  return { ...defaults, ...parseEnvironmentFile(LOCAL_ENV_FILE) };
}

function localPort(values, name, fallback) {
  const value = Number(values[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer between 1024 and 65535`);
  }
  return value;
}

function localUrlWithLoopbackHost(raw, fallback) {
  try {
    const value = new URL(raw);
    value.hostname = '127.0.0.1';
    if (value.port === '') value.port = String(fallback);
    return value.toString();
  } catch {
    throw new Error('Local development connection URL is invalid');
  }
}

/** Host-watcher environment for the real local Postgres/Redis/Mailpit profile. */
export function databaseBackedDevelopmentEnvironment(overrides = {}) {
  const values = { ...readLocalEnvironmentFile(), ...process.env, ...overrides };
  const postgresPort = localPort(values, 'POSTGRES_PORT', 5432);
  const redisPort = localPort(values, 'REDIS_PORT', 6379);
  const minioPort = localPort(values, 'MINIO_API_PORT', 9000);
  const smtpPort = localPort(values, 'MAILPIT_SMTP_PORT', 1025);
  const databaseUrl = values.DATABASE_URL
    ? localUrlWithLoopbackHost(values.DATABASE_URL, postgresPort)
    : `postgresql://${encodeURIComponent(values.POSTGRES_USER ?? 'databreeze')}:${encodeURIComponent(values.POSTGRES_PASSWORD ?? 'databreeze-local-change-me')}@127.0.0.1:${postgresPort}/${values.POSTGRES_DB ?? 'databreeze'}?schema=public`;
  const emailProvider = values.DATABREEZE_LOCAL_EMAIL_PROVIDER ?? 'mailpit';
  const smtpHost = emailProvider === 'mailpit' ? '127.0.0.1' : values.DATABREEZE_IAM_SMTP_HOST;
  const smtpPortValue =
    emailProvider === 'mailpit' ? String(smtpPort) : values.DATABREEZE_IAM_SMTP_PORT;

  return {
    ...localDevelopmentEnvironment(),
    NODE_ENV: 'production',
    DATABREEZE_RUNTIME_PROFILE: 'local',
    DATABASE_URL: databaseUrl,
    DATABREEZE_REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    DATABREEZE_LOCAL_HMR_HTTP: 'true',
    DATABREEZE_LOCAL_HMR_ORIGIN: 'http://127.0.0.1:5173',
    DATABREEZE_LOCAL_EMAIL_PROVIDER: emailProvider,
    DATABREEZE_IAM_SMTP_HOST: smtpHost,
    DATABREEZE_IAM_SMTP_PORT: smtpPortValue,
    DATABREEZE_IAM_SMTP_USERNAME: values.DATABREEZE_IAM_SMTP_USERNAME ?? '',
    DATABREEZE_IAM_SMTP_APP_PASSWORD: values.DATABREEZE_IAM_SMTP_APP_PASSWORD ?? '',
    DATABREEZE_IAM_EMAIL_FROM_ADDRESS:
      values.DATABREEZE_IAM_EMAIL_FROM_ADDRESS ?? 'verify@databreeze.local',
    DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY:
      values.DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY,
    DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY:
      values.DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY,
    DATABREEZE_IAM_INVITATION_DIGEST_KEY: values.DATABREEZE_IAM_INVITATION_DIGEST_KEY,
    DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY: values.DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY,
    DATABREEZE_IAM_RECOVERY_DIGEST_KEY: values.DATABREEZE_IAM_RECOVERY_DIGEST_KEY,
    DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY:
      values.DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY,
    DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY:
      values.DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY,
    DATABREEZE_LOCAL_PROJECT_ID: values.DATABREEZE_LOCAL_PROJECT_ID,
    DATABREEZE_LOCAL_SEED_PASSWORD: values.DATABREEZE_LOCAL_SEED_PASSWORD,
    OPENAI_API_KEY: values.OPENAI_API_KEY,
    // Keep every owner-controlled provider gate from the local env file when
    // launching the host API. Without these flags the API receives the key but
    // silently disables the corresponding provider, making local feature tests
    // look like backend failures.
    DATABREEZE_OPENAI_AGENT_ENABLED: values.DATABREEZE_OPENAI_AGENT_ENABLED,
    DATABREEZE_OPENAI_AGENT_MODEL: values.DATABREEZE_OPENAI_AGENT_MODEL,
    DATABREEZE_OPENAI_AGENT_TIMEOUT_MS: values.DATABREEZE_OPENAI_AGENT_TIMEOUT_MS,
    DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS: values.DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS,
    DATABREEZE_OPENAI_RECEIPT_ENABLED: values.DATABREEZE_OPENAI_RECEIPT_ENABLED,
    DATABREEZE_OPENAI_RECEIPT_MODEL: values.DATABREEZE_OPENAI_RECEIPT_MODEL,
    DATABREEZE_OPENAI_DASHBOARD_ENABLED: values.DATABREEZE_OPENAI_DASHBOARD_ENABLED,
    DATABREEZE_OPENAI_DASHBOARD_MODEL: values.DATABREEZE_OPENAI_DASHBOARD_MODEL,
    DATABREEZE_OPENAI_IMAGE_DETAIL: values.DATABREEZE_OPENAI_IMAGE_DETAIL,
    DATABREEZE_OPENAI_TIMEOUT_MS: values.DATABREEZE_OPENAI_TIMEOUT_MS,
    DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS: values.DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS,
    DATABREEZE_OPENAI_ANALYSIS_ENABLED: values.DATABREEZE_OPENAI_ANALYSIS_ENABLED,
    DATABREEZE_OPENAI_ANALYSIS_MODEL: values.DATABREEZE_OPENAI_ANALYSIS_MODEL,
    DATABREEZE_OPENAI_NARRATIVE_ENABLED: values.DATABREEZE_OPENAI_NARRATIVE_ENABLED,
    DATABREEZE_OPENAI_NARRATIVE_MODEL: values.DATABREEZE_OPENAI_NARRATIVE_MODEL,
    DATABREEZE_OPENAI_MAPPING_ENABLED: values.DATABREEZE_OPENAI_MAPPING_ENABLED,
    DATABREEZE_OPENAI_MAPPING_MODEL: values.DATABREEZE_OPENAI_MAPPING_MODEL,
    DATABREEZE_OPENAI_MAPPING_ALLOW_SAMPLES: values.DATABREEZE_OPENAI_MAPPING_ALLOW_SAMPLES,
    DATABREEZE_LOCAL_MINIO_ENDPOINT: `http://127.0.0.1:${minioPort}`,
    DATABREEZE_LOCAL_MINIO_ACCESS_KEY: values.MINIO_ROOT_USER ?? 'databreeze',
    DATABREEZE_LOCAL_MINIO_SECRET_KEY: values.MINIO_ROOT_PASSWORD ?? 'databreeze-local-change-me',
    DATABREEZE_LOCAL_MINIO_BUCKET: values.MINIO_BUCKET_ARTIFACTS ?? 'databreeze-artifacts',
    VITE_DATABREEZE_API_BASE_URL: '',
    VITE_DATABREEZE_DEMO_MODE: 'false',
    // Keep the server-backed local PayOS checkout testable in HMR. This is
    // separate from demo mode: the amount/status still come from the API and
    // the webhook still settles the real local entitlement transaction.
    PAYOS_PROVIDER: values.PAYOS_PROVIDER ?? 'mock',
    PAYOS_LOCAL_TEST_MODE: values.PAYOS_LOCAL_TEST_MODE ?? 'false',
    PAYOS_CLIENT_ID: values.PAYOS_CLIENT_ID ?? '',
    PAYOS_API_KEY: values.PAYOS_API_KEY ?? '',
    PAYOS_CHECKSUM_KEY: values.PAYOS_CHECKSUM_KEY ?? '',
    DATABREEZE_WEB_PUBLIC_URL: values.DATABREEZE_WEB_PUBLIC_URL ?? 'https://localhost:8443',
    DATABREEZE_PAYOS_SUCCESS_URL: values.DATABREEZE_PAYOS_SUCCESS_URL ?? '',
    DATABREEZE_PAYOS_FAILED_URL: values.DATABREEZE_PAYOS_FAILED_URL ?? '',
    VITE_DATABREEZE_LOCAL_PAYMENT_MODE:
      values.VITE_DATABREEZE_LOCAL_PAYMENT_MODE ?? values.PAYOS_PROVIDER ?? 'mock',
    VITE_DATABREEZE_LOCAL_NAVIGATION_HINTS: 'true',
  };
}

export function localDevelopmentEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: '3000',
    VITE_DATABREEZE_API_PROXY_TARGET: 'http://127.0.0.1:3000',
    ...overrides,
  };
}

/** Vite HMR keeps NODE_ENV=development so React Refresh stays enabled. */
export function webDevelopmentEnvironment(overrides = {}) {
  return {
    ...databaseBackedDevelopmentEnvironment(overrides),
    NODE_ENV: 'development',
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
  Open http://127.0.0.1:5173/vi-VN
  Edit apps/web/src/* and Vite HMR updates the browser without a rebuild.

The watched API uses the database-backed local composition against the Docker services,
and Vite proxies /v1, /v3, and /health to it. Registration, OTP, sign-in, refresh, and
logout therefore use real Postgres/Redis/Mailpit state. This loopback-only HMR profile
uses development HTTP cookies; the built local gateway at https://localhost:8443 keeps
Secure cookies and is still the production-shaped validation path.`;
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
      env: { ...process.env, ...databaseBackedDevelopmentEnvironment() },
    });
  }
  if (command === 'web') {
    const prerequisiteCode = await runProcess(DEV_WEB_PREREQUISITE, {
      env: { ...process.env, ...localDevelopmentEnvironment() },
    });
    if (prerequisiteCode !== 0) return prerequisiteCode;
    return runProcess(DEV_COMMANDS.web, {
      cwd: path.resolve(REPOSITORY_ROOT, DEV_WORKING_DIRECTORIES.web),
      env: { ...process.env, ...webDevelopmentEnvironment() },
    });
  }
  throw new Error(`Unknown local development command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
