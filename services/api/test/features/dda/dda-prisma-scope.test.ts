import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const prismaRoot = resolve(root, 'prisma');

void test('[DDA-001] registers a DDA-owned schema without cross-schema foreign keys or blob columns', () => {
  const platform = readFileSync(resolve(prismaRoot, 'schema/platform.prisma'), 'utf8');
  assert.match(platform, /"dda"/u);

  const schema = readFileSync(resolve(prismaRoot, 'schema/dda.prisma'), 'utf8');
  assert.match(schema, /@@schema\("dda"\)/u);
  assert.match(schema, /model DashboardRecord/u);
  assert.match(schema, /model DashboardVersionRecord/u);
  assert.match(schema, /model AnalysisPlanRecord/u);
  assert.match(schema, /model MaterializationDefinitionRecord/u);
  assert.match(schema, /model DashboardSnapshotRecord/u);
  assert.match(schema, /model DashboardRefreshStateRecord/u);
  assert.doesNotMatch(schema, /\bBytes\b|@db\.ByteA|\bByteA\b|\bBLOB\b/u);
  assert.doesNotMatch(schema, /@@schema\("(iam|iae|dsm|jra|dso|bua|aud)"\)/u);
  assert.doesNotMatch(schema, /references:\s*\[/u);

  assert.match(schema, /organizationId/u);
  assert.match(schema, /workspaceId/u);
  assert.match(schema, /projectId/u);
  assert.match(schema, /canonicalHash/u);
});

void test('[DDA-001] migration creates DDA schema with rollback guidance and no IAE deletes', () => {
  const migration = readFileSync(
    resolve(prismaRoot, 'migrations/20260810010000_dda_foundation/migration.sql'),
    'utf8',
  );
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS "dda"/u);
  assert.match(migration, /schema_registry/u);
  assert.match(migration, /VALUES \('dda', 'DDA'\)/u);
  assert.match(migration, /ROLLBACK/u);
  assert.match(migration, /Never delete IAE content or AUD history/u);
  assert.doesNotMatch(migration, /DROP TABLE .*"iae"/iu);
  assert.doesNotMatch(migration, /DELETE FROM "aud"/iu);
});

void test('[DDA-001] repository ports reject unscoped lookup keys', async () => {
  const { InMemoryDashboardRepositoryAdapter } = await import(
    '../../../src/features/dda/adapter/in-memory-dashboard-repository.adapter.js'
  );
  const repository = new InMemoryDashboardRepositoryAdapter();
  await assert.rejects(
    () =>
      repository.findByDashboardId(
        {
          organizationId: '00000000-0000-4000-8000-000000000001',
        } as never,
        '00000000-0000-4000-8000-00000000001b',
      ),
    /TENANT_SCOPE_REQUIRED|INVALID_SCOPE/u,
  );
});
