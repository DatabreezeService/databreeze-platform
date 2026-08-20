import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEV_COMMANDS,
  DEV_WORKING_DIRECTORIES,
  DEV_WEB_PREREQUISITE,
  databaseBackedDevelopmentEnvironment,
  localDevelopmentEnvironment,
  readLocalEnvironmentFile,
  renderDevelopmentInstructions,
  webDevelopmentEnvironment,
} from '../src/dev-stack.mjs';

test('local development commands keep infrastructure in Docker and app processes on the host', () => {
  assert.deepEqual(DEV_COMMANDS, {
    infra: ['local:services', 'start'],
    api: ['--filter', '@databreeze/api', 'dev'],
    web: ['--filter', '@databreeze/web', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'],
  });

  assert.deepEqual(localDevelopmentEnvironment(), {
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: '3000',
    VITE_DATABREEZE_API_PROXY_TARGET: 'http://127.0.0.1:3000',
  });
});

test('development instructions are explicit about the HMR URL and Docker-only services', () => {
  const instructions = renderDevelopmentInstructions();

  assert.match(instructions, /http:\/\/127\.0\.0\.1:5173\/vi-VN$/mu);
  assert.match(instructions, /Vite HMR/u);
  assert.match(instructions, /PostgreSQL.*Redis.*MinIO.*Mailpit/isu);
  assert.match(instructions, /database-backed/iu);
  assert.match(instructions, /8443.*production-shaped validation/isu);
});

test('database-backed development environment points host watchers at the Docker services', () => {
  const environment = databaseBackedDevelopmentEnvironment({
    DATABASE_URL:
      'postgresql://databreeze:databreeze-local-change-me@127.0.0.1:5432/databreeze?schema=public',
    REDIS_PORT: '6379',
    MINIO_API_PORT: '9000',
    MAILPIT_SMTP_PORT: '1025',
    DATABREEZE_LOCAL_EMAIL_PROVIDER: 'mailpit',
    VITE_DATABREEZE_LOCAL_PAYMENT_MODE: 'mock',
    PAYOS_PROVIDER: 'mock',
    PAYOS_LOCAL_TEST_MODE: 'false',
    DATABREEZE_OPENAI_AGENT_ENABLED: 'true',
    DATABREEZE_OPENAI_AGENT_MODEL: 'gpt-4o-mini-local-test',
    DATABREEZE_OPENAI_RECEIPT_ENABLED: 'true',
    DATABREEZE_OPENAI_DASHBOARD_ENABLED: 'false',
    DATABREEZE_OPENAI_MAPPING_ENABLED: 'true',
    DATABREEZE_OPENAI_MAPPING_ALLOW_SAMPLES: 'true',
    DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY: 'A'.repeat(43),
  });

  assert.equal(environment.NODE_ENV, 'production');
  assert.equal(environment.DATABREEZE_RUNTIME_PROFILE, 'local');
  assert.equal(environment.DATABREEZE_LOCAL_HMR_HTTP, 'true');
  assert.equal(environment.DATABREEZE_LOCAL_HMR_ORIGIN, 'http://127.0.0.1:5173');
  assert.equal(environment.DATABREEZE_LOCAL_PROJECT_ID, '00000000-0000-4000-8000-000000000003');
  assert.equal(environment.DATABREEZE_REDIS_URL, 'redis://127.0.0.1:6379');
  assert.equal(environment.DATABREEZE_IAM_SMTP_HOST, '127.0.0.1');
  assert.equal(environment.DATABREEZE_IAM_SMTP_PORT, '1025');
  assert.equal(typeof environment.DATABREEZE_IAM_INVITATION_DIGEST_KEY, 'string');
  assert.ok(environment.DATABREEZE_IAM_INVITATION_DIGEST_KEY.length >= 32);
  assert.equal(environment.DATABREEZE_LOCAL_MINIO_ENDPOINT, 'http://127.0.0.1:9000');
  assert.equal(environment.DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY, 'A'.repeat(43));
  assert.equal(environment.VITE_DATABREEZE_DEMO_MODE, 'false');
  assert.equal(environment.VITE_DATABREEZE_LOCAL_PAYMENT_MODE, 'mock');
  assert.equal(environment.PAYOS_PROVIDER, 'mock');
  assert.equal(environment.PAYOS_LOCAL_TEST_MODE, 'false');
  assert.equal(environment.VITE_DATABREEZE_API_BASE_URL, '');
  assert.equal(environment.DATABREEZE_OPENAI_AGENT_ENABLED, 'true');
  assert.equal(environment.DATABREEZE_OPENAI_AGENT_MODEL, 'gpt-4o-mini-local-test');
  assert.equal(environment.DATABREEZE_OPENAI_RECEIPT_ENABLED, 'true');
  assert.equal(environment.DATABREEZE_OPENAI_DASHBOARD_ENABLED, 'false');
  assert.equal(environment.DATABREEZE_OPENAI_MAPPING_ENABLED, 'true');
  assert.equal(environment.DATABREEZE_OPENAI_MAPPING_ALLOW_SAMPLES, 'true');
  assert.match(environment.DATABASE_URL, /@127\.0\.0\.1:5432\//u);
});

test('local environment keeps required defaults when an older ignored .env omits them', () => {
  const values = readLocalEnvironmentFile();

  for (const key of [
    'DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY',
    'DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY',
    'DATABREEZE_IAM_INVITATION_DIGEST_KEY',
    'DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY',
    'DATABREEZE_IAM_RECOVERY_DIGEST_KEY',
    'DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY',
    'DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY',
  ]) {
    assert.equal(typeof values[key], 'string');
    assert.ok(values[key].length >= 32);
  }
});

test('web development keeps Vite in development while using the database-backed local flags', () => {
  const environment = webDevelopmentEnvironment({
    DATABASE_URL:
      'postgresql://databreeze:databreeze-local-change-me@127.0.0.1:5432/databreeze?schema=public',
    REDIS_PORT: '6379',
    MINIO_API_PORT: '9000',
    MAILPIT_SMTP_PORT: '1025',
    DATABREEZE_LOCAL_EMAIL_PROVIDER: 'mailpit',
    VITE_DATABREEZE_LOCAL_PAYMENT_MODE: 'mock',
    PAYOS_PROVIDER: 'mock',
    PAYOS_LOCAL_TEST_MODE: 'false',
  });

  assert.equal(environment.NODE_ENV, 'development');
  assert.equal(environment.VITE_DATABREEZE_DEMO_MODE, 'false');
  assert.equal(environment.VITE_DATABREEZE_LOCAL_PAYMENT_MODE, 'mock');
  assert.equal(environment.PAYOS_PROVIDER, 'mock');
  assert.equal(environment.PAYOS_LOCAL_TEST_MODE, 'false');
  assert.equal(environment.VITE_DATABREEZE_API_BASE_URL, '');
  assert.equal(environment.DATABREEZE_RUNTIME_PROFILE, 'local');
  assert.equal(environment.DATABREEZE_LOCAL_HMR_ORIGIN, 'http://127.0.0.1:5173');
});

test('web development builds runtime domain exports before starting Vite', () => {
  assert.deepEqual(DEV_WEB_PREREQUISITE, ['--filter', '@databreeze/domain', 'build']);
});

test('web development starts from its package directory so workspace dependencies resolve', () => {
  assert.equal(DEV_WORKING_DIRECTORIES.web, 'apps/web');
});
