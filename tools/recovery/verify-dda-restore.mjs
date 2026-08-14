#!/usr/bin/env node
/** Content-safe isolated-staging restore verifier. Never prints URLs or row content. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  repoRoot,
  'services/api/prisma/migrations/20260812010000_unified_workspace/migration.sql',
);
const clientPath = resolve(repoRoot, 'services/api/build/prisma-client/client.js');

const FIXTURE_CHECKLIST = Object.freeze([
  {
    id: 'conversation-with-messages-context',
    tables: ['conversations', 'conversation_messages', 'conversation_context_events'],
    minCount: 1,
  },
  { id: 'source-assignment', tables: ['source_assignments'], minCount: 1 },
  { id: 'workspace-agent-grant', tables: ['workspace_agent_grants'], minCount: 1 },
  { id: 'extraction-candidate', tables: ['extraction_candidates'], minCount: 1 },
  { id: 'named-dashboard-view', tables: ['named_dashboard_views'], minCount: 1 },
]);

const LIVE_TABLES = Object.freeze([
  { id: 'conversations', schema: 'dda', table: 'conversations' },
  { id: 'conversation-messages', schema: 'dda', table: 'conversation_messages' },
  { id: 'conversation-context-events', schema: 'dda', table: 'conversation_context_events' },
  { id: 'source-assignments', schema: 'dda', table: 'source_assignments' },
  { id: 'workspace-agent-grants', schema: 'iam', table: 'workspace_agent_grants' },
  { id: 'extraction-candidates', schema: 'dda', table: 'extraction_candidates' },
  { id: 'named-dashboard-views', schema: 'dda', table: 'named_dashboard_views' },
]);

function usage() {
  console.log(`Usage:
  node tools/recovery/verify-dda-restore.mjs --fixture-only
  $env:DATABREEZE_RESTORED_DATABASE_URL = <isolated-restored-staging-url>
  node tools/recovery/verify-dda-restore.mjs --acknowledge-isolated-restored-staging

The live URL is accepted only through DATABREEZE_RESTORED_DATABASE_URL so it does not
appear in process arguments. Output contains counts only, never row content or credentials.`);
}

function parseArgs(argv) {
  const known = new Set([
    '--help',
    '-h',
    '--fixture-only',
    '--acknowledge-isolated-restored-staging',
  ]);
  const unknown = argv.filter((argument) => !known.has(argument));
  return {
    help: argv.includes('--help') || argv.includes('-h'),
    fixtureOnly: argv.includes('--fixture-only'),
    acknowledged: argv.includes('--acknowledge-isolated-restored-staging'),
    unknown,
  };
}

function verifyFixtureChecklist() {
  const migration = readFileSync(migrationPath, 'utf8');
  const missing = [];
  for (const item of FIXTURE_CHECKLIST) {
    for (const table of item.tables) {
      const present =
        migration.includes(`CREATE TABLE "dda"."${table}"`) ||
        migration.includes(`CREATE TABLE "iam"."${table}"`);
      if (!present) missing.push(`${item.id}:${table}`);
    }
  }
  if (!migration.includes('iae_artifact_version_id')) missing.push('iae-reference-columns');
  if (!migration.includes(`CHECK ("retention_state" IN ('ACTIVE', 'PENDING_DELETE', 'DELETED')`)) {
    missing.push('conversation-retention-state');
  }
  if (missing.length > 0) {
    console.error(`FAIL: restore fixture checklist incomplete: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify({
      mode: 'fixture-only',
      checklist: FIXTURE_CHECKLIST.map((item) => item.id),
      contentSafe: true,
      status: 'ok',
    }),
  );
}

async function withDeadline(operation, timeoutMs = 5_000) {
  let timeout;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('RESTORE_VERIFICATION_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyLiveRestore(databaseUrl) {
  let client;
  try {
    const [{ PrismaPg }, generated] = await Promise.all([
      import(
        pathToFileURL(
          resolve(repoRoot, 'services/api/node_modules/@prisma/adapter-pg/dist/index.mjs'),
        )
      ),
      import(pathToFileURL(clientPath)),
    ]);
    client = new generated.PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    await withDeadline(() => client.$connect());

    const results = [];
    for (const check of LIVE_TABLES) {
      const rows = await withDeadline(() =>
        client.$queryRawUnsafe(
          `SELECT COUNT(*)::text AS count FROM "${check.schema}"."${check.table}"`,
        ),
      );
      const count = Number.parseInt(rows?.[0]?.count ?? '', 10);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('RESTORE_COUNT_INVALID');
      results.push({ id: check.id, count });
    }
    console.log(
      JSON.stringify({
        mode: 'isolated-restored-staging',
        status: 'ok',
        contentSafe: true,
        checks: results,
      }),
    );
  } catch {
    console.error('RESTORE_VERIFICATION_UNAVAILABLE: isolated staging verification failed.');
    process.exitCode = 1;
  } finally {
    if (client) {
      try {
        await withDeadline(() => client.$disconnect());
      } catch {
        process.exitCode = 1;
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  if (args.unknown.length > 0) {
    console.error(
      'INVALID_ARGUMENT: use DATABREEZE_RESTORED_DATABASE_URL; database URLs are forbidden in process arguments.',
    );
    process.exitCode = 2;
    return;
  }
  if (args.fixtureOnly) return verifyFixtureChecklist();

  const databaseUrl = process.env.DATABREEZE_RESTORED_DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    console.error(
      'BLOCKED: set DATABREEZE_RESTORED_DATABASE_URL through a protected shell environment.',
    );
    process.exitCode = 2;
    return;
  }
  if (!args.acknowledged) {
    console.error('BLOCKED: add --acknowledge-isolated-restored-staging before live verification.');
    process.exitCode = 2;
    return;
  }
  await verifyLiveRestore(databaseUrl.trim());
}

await main();
