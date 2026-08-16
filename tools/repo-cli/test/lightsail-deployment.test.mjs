import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('Lightsail pilot Compose keeps data services private and gates API on migration', async () => {
  const compose = await read('infrastructure/lightsail/compose.pilot.yml');
  assert.match(compose, /api-migrate:/u);
  assert.match(compose, /condition: service_completed_successfully/u);
  assert.match(compose, /API_MIGRATION_IMAGE:\?API_MIGRATION_IMAGE/u);
  assert.match(compose, /API_IMAGE:\?API_IMAGE/u);
  assert.match(compose, /WEB_IMAGE:\?WEB_IMAGE/u);
  assert.match(compose, /- '80:80'/u);
  assert.match(compose, /- '443:443'/u);
  assert.match(
    compose,
    /DATABREEZE_LOCAL_EMAIL_PROVIDER: \$\{DATABREEZE_LOCAL_EMAIL_PROVIDER:-mailpit\}/u,
  );
  assert.match(compose, /DATABREEZE_IAM_SMTP_HOST: \$\{DATABREEZE_IAM_SMTP_HOST:-mailpit\}/u);
  assert.match(compose, /DATABREEZE_IAM_SMTP_PORT: \$\{DATABREEZE_IAM_SMTP_PORT:-1025\}/u);
  assert.match(compose, /DATABREEZE_IAM_SMTP_USERNAME: \$\{DATABREEZE_IAM_SMTP_USERNAME:-\}/u);
  assert.match(
    compose,
    /DATABREEZE_IAM_SMTP_APP_PASSWORD: \$\{DATABREEZE_IAM_SMTP_APP_PASSWORD:-\}/u,
  );
  assert.match(compose, /postgres:17\.5-alpine@sha256:[0-9a-f]{64}/u);
  assert.match(compose, /redis:7\.4\.5-alpine@sha256:[0-9a-f]{64}/u);
  const postgresService = compose.match(/\n  postgres:\n([\s\S]*?)(?=\n  [a-z-]+:\n)/u)?.[1] ?? '';
  const redisService = compose.match(/\n  redis:\n([\s\S]*?)(?=\n  [a-z-]+:\n)/u)?.[1] ?? '';
  assert.doesNotMatch(postgresService, /\n    ports:/u);
  assert.doesNotMatch(redisService, /\n    ports:/u);
  assert.doesNotMatch(compose, /latest/u);
});

test('Lightsail Caddy uses the configured public domain and API-before-SPA routing', async () => {
  const caddy = await read('infrastructure/lightsail/Caddyfile');
  assert.match(caddy, /\{\$DATABREEZE_PILOT_DOMAIN\}/u);
  assert.match(caddy, /reverse_proxy api:3000/u);
  assert.match(caddy, /try_files \{path\} \/index\.html/u);
  assert.doesNotMatch(caddy, /tls internal/u);
  assert.doesNotMatch(caddy, /localhost/u);
});

test('Lightsail environment example keeps secrets and mutable tags out of source control', async () => {
  const env = await read('infrastructure/lightsail/.env.example');
  assert.match(env, /CHANGE_ME/u);
  assert.match(env, /VITE_DATABREEZE_DEMO_MODE=true/u);
  assert.match(env, /DATABREEZE_LOCAL_EMAIL_PROVIDER=mailpit/u);
  assert.match(env, /DATABREEZE_IAM_SMTP_HOST=mailpit/u);
  assert.match(env, /DATABREEZE_IAM_SMTP_PORT=1025/u);
  assert.doesNotMatch(env, /OPENAI_API_KEY=/u);
  assert.doesNotMatch(env, /:latest\b/u);
});

test('Lightsail deployment scripts migrate first, health-check, and retain rollback support', async () => {
  const deploy = await read('infrastructure/lightsail/deploy.sh');
  const healthcheck = await read('infrastructure/lightsail/healthcheck.sh');
  const rollback = await read('infrastructure/lightsail/rollback.sh');
  const bootstrap = await read('infrastructure/lightsail/bootstrap.sh');
  for (const script of [deploy, healthcheck, rollback]) assert.match(script, /set -Eeuo pipefail/u);
  assert.match(deploy, /run --rm api-migrate/u);
  assert.match(deploy, /healthcheck\.sh/u);
  assert.match(deploy, /current-release\.env/u);
  assert.match(deploy, /down --remove-orphans/u);
  assert.match(deploy, /docker inspect --format/u);
  assert.match(deploy, /logs --no-color --tail 200 api/u);
  assert.match(healthcheck, /--max-time 10/u);
  assert.match(healthcheck, /content_type/u);
  assert.match(healthcheck, /application\/json/u);
  assert.match(healthcheck, /MAX_ATTEMPTS/u);
  assert.match(rollback, /exec .*deploy\.sh/u);
  assert.match(bootstrap, /install -m 0644 .*Caddyfile/u);
  assert.doesNotMatch(deploy, /curl[^\n]*\|[^\n]*sh/u);
});

test('Lightsail pilot workflow passes immutable image digests between jobs', async () => {
  const workflow = await read('.github/workflows/lightsail-pilot.yml');
  assert.doesNotThrow(() => parse(workflow));
  assert.match(workflow, /packages:\s*write/u);
  assert.match(workflow, /environment:\s*pilot/u);
  const deployJob = workflow.split('\n  deploy:\n', 2)[1] ?? '';
  assert.match(deployJob, /permissions:[\s\S]*packages:\s*read/u);
  assert.match(deployJob, /Checkout repository[\s\S]*actions\/checkout/u);
  assert.match(deployJob, /LIGHTSAIL_GHCR_USERNAME:\s*\$\{\{\s*github\.actor\s*\}\}/u);
  assert.match(deployJob, /LIGHTSAIL_GHCR_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/u);
  assert.doesNotMatch(deployJob, /secrets\.LIGHTSAIL_GHCR_/u);
  assert.match(workflow, /docker login [^\n]*--password-stdin/u);
  assert.match(workflow, /docker logout/u);
  assert.match(workflow, /api_image:\s*\$\{\{\s*steps\.manifest\.outputs\.api_image\s*\}\}/u);
  assert.match(
    workflow,
    /api_migration_image:\s*\$\{\{\s*steps\.manifest\.outputs\.api_migration_image\s*\}\}/u,
  );
  assert.match(workflow, /web_image:\s*\$\{\{\s*steps\.manifest\.outputs\.web_image\s*\}\}/u);
  assert.match(workflow, /API_IMAGE:\s*\$\{\{\s*needs\.publish\.outputs\.api_image\s*\}\}/u);
  assert.match(
    workflow,
    /API_MIGRATION_IMAGE:\s*\$\{\{\s*needs\.publish\.outputs\.api_migration_image\s*\}\}/u,
  );
  assert.match(workflow, /WEB_IMAGE:\s*\$\{\{\s*needs\.publish\.outputs\.web_image\s*\}\}/u);
  assert.match(workflow, /docker image inspect/u);
  assert.doesNotMatch(deployJob, /docker image inspect/u);
  assert.match(deployJob, /Upload deployment files/u);
  assert.match(deployJob, /infrastructure\/lightsail\/deploy\.sh/u);
  assert.match(deployJob, /install -m 0644 \/tmp\/databreeze-\$\{GITHUB_SHA\}\/Caddyfile/u);
  assert.match(deployJob, /install -m 0750 \/tmp\/databreeze-\$\{GITHUB_SHA\}\/deploy\.sh/u);
  assert.match(deployJob, /Remove temporary deployment files/u);
  assert.doesNotMatch(workflow, /:latest\b/u);
  assert.doesNotMatch(workflow, /tofu[^\n]*\bapply\b/u);
});
