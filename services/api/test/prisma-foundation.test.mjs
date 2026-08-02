import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function prisma(...argumentsList) {
  const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack';
  const argumentsForProcess =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', ['corepack', 'pnpm', 'exec', 'prisma', ...argumentsList].join(' ')]
      : ['pnpm', 'exec', 'prisma', ...argumentsList];
  if (argumentsList.some((argument) => !/^[A-Za-z0-9_./:-]+$/.test(argument))) {
    throw new Error('Unsafe Prisma test argument');
  }
  return spawnSync(executable, argumentsForProcess, {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  });
}

test('Prisma validates and generates the multi-schema client without connecting to PostgreSQL', () => {
  const validation = prisma('validate', '--config', 'prisma.config.ts');
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);

  const generation = prisma('generate', '--config', 'prisma.config.ts');
  assert.equal(generation.status, 0, generation.stderr || generation.stdout);
  assert.doesNotMatch(`${generation.stdout}${generation.stderr}`, /ECONNREFUSED|P1001/);
});

test('the schema diff and centrally ordered migration inventory establish platform and system ownership', async () => {
  const diff = prisma(
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema',
    'prisma/schema',
    '--script',
    '--config',
    'prisma.config.ts',
  );
  assert.equal(diff.status, 0, diff.stderr || diff.stdout);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "platform"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "iam"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "iae"/);
  assert.match(diff.stdout, /CREATE SCHEMA IF NOT EXISTS "aud"/);
  assert.match(diff.stdout, /CREATE TABLE "platform"\."schema_registry"/);
  assert.match(diff.stdout, /CREATE TABLE "iam"\."users"/);
  assert.match(diff.stdout, /CREATE TABLE "iae"\."artifact_versions"/);
  assert.match(diff.stdout, /CREATE TABLE "aud"\."audit_events"/);

  const migrationsDirectory = path.join(apiDirectory, 'prisma', 'migrations');
  const inventory = (await readdir(migrationsDirectory)).sort();
  assert.deepEqual(inventory, [
    '20260801000000_platform_schema_registry',
    '20260802000000_iam_identity_foundation',
    '20260802010000_iae_artifact_foundation',
    '20260802020000_aud_audit_ledger',
    'migration_lock.toml',
  ]);
  const migration = await readFile(
    path.join(migrationsDirectory, inventory[0], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "platform"',
    'CREATE SCHEMA IF NOT EXISTS "system"',
    'CREATE TABLE "platform"."schema_registry"',
  ]) {
    assert.match(migration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const iamMigration = await readFile(
    path.join(migrationsDirectory, inventory[1], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "iam"',
    'CREATE TABLE "iam"."users"',
    'CREATE TABLE "iam"."sessions"',
    'CREATE UNIQUE INDEX "refresh_tokens_digest_key"',
  ]) {
    assert.match(iamMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const iaeMigration = await readFile(
    path.join(migrationsDirectory, inventory[2], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "iae"',
    'CREATE TABLE "iae"."artifact_versions"',
    'CREATE TABLE "iae"."content_placements"',
    'CREATE TABLE "iae"."evidence_references"',
  ]) {
    assert.match(iaeMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const audMigration = await readFile(
    path.join(migrationsDirectory, inventory[3], 'migration.sql'),
    'utf8',
  );
  for (const statement of [
    'CREATE SCHEMA IF NOT EXISTS "aud"',
    'CREATE TABLE "aud"."audit_events"',
    'CREATE TABLE "aud"."audit_seals"',
    'CREATE UNIQUE INDEX "audit_events_scope_idempotency_key"',
  ]) {
    assert.match(audMigration, new RegExp(statement.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
